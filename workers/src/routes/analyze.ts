import type { Env } from '../index'
import { callClaude } from '../lib/claude'
import { supabaseRpc, supabaseQuery } from '../lib/supabase'
import {
  validateRequestSize,
  SizeError,
  UsageExceededError,
  ValidationError
} from '../lib/validate'
import { extractIdentity, AuthError } from '../lib/auth'

const MAX_REVIEWS = 50
const MAX_REVIEW_LENGTH = 500
const MAX_BODY_BYTES = 100 * 1024 // 100KB

interface Review {
  id: string
  text: string
  rating: number
  author: string
  language?: string
}

interface AnalyzeBody {
  reviews: Review[]
  placeInfo: {
    placeId: string
    name: string
    url: string
    category: string
  }
  site: string
}

function buildSystemPrompt(category: string, site: string): string {
  if (site === 'naver_place') {
    return `당신은 네이버 Place 리뷰 분석 전문가입니다. ${category || '장소'}의 리뷰를 분석합니다.
반드시 유효한 JSON만 반환하세요 (마크다운, 코드블록 없이):
{
  "aspects": [
    { "aspect": "맛", "score": 8.5, "summary": "간단한 요약", "keywords": ["키워드1", "키워드2"] },
    { "aspect": "서비스", "score": 6.2, "summary": "간단한 요약", "keywords": ["키워드1"] },
    { "aspect": "가성비", "score": 7.8, "summary": "간단한 요약", "keywords": ["키워드1"] },
    { "aspect": "분위기", "score": 9.1, "summary": "간단한 요약", "keywords": ["키워드1"] }
  ],
  "highlights": ["장점 1", "장점 2", "장점 3"],
  "warnings": ["주의점 1", "주의점 2", "주의점 3"]
}
점수는 0-10. 해당 없는 측면은 생략. 각 요약은 1-2문장.`
  }

  return `You are a review analyst for Google Maps places. Analyze the provided reviews for a ${category || 'place'}.
Reviews may be in multiple languages — analyze all regardless of language. Respond in English.
Return ONLY valid JSON (no markdown, no code blocks) with this exact structure:
{
  "aspects": [
    { "aspect": "food", "score": 8.5, "summary": "Brief summary", "keywords": ["keyword1", "keyword2"] },
    { "aspect": "service", "score": 6.2, "summary": "Brief summary", "keywords": ["keyword1"] },
    { "aspect": "value", "score": 7.8, "summary": "Brief summary", "keywords": ["keyword1"] },
    { "aspect": "ambiance", "score": 9.1, "summary": "Brief summary", "keywords": ["keyword1"] }
  ],
  "highlights": ["Top positive point 1", "Top positive point 2", "Top positive point 3"],
  "warnings": ["Watch out for 1", "Watch out for 2", "Watch out for 3"]
}
Scores are 0-10. Only include relevant aspects (e.g. skip "food" for a hotel).
Be concise. Each summary should be 1-2 sentences max.`
}

function buildProSystemPrompt(category: string, site: string): string {
  const base = buildSystemPrompt(category, site)
  const proAddition = site === 'naver_place'
    ? `

추가로 다음 필드도 JSON에 포함하세요:
"trend": { "recentSentiment": "positive|negative|mixed", "previousSentiment": "...", "direction": "improving|declining|stable", "reason": "..." },
"waitTime": { "estimate": "대기시간 추정 또는 insufficient data", "basedOn": 참조한리뷰수 },
"bestFor": ["데이트", "가족모임", "회식"]
대기시간 언급이 3건 미만이면 estimate를 "insufficient data"로.`
    : `

Also include these additional fields in the JSON:
"trend": { "recentSentiment": "positive|negative|mixed", "previousSentiment": "...", "direction": "improving|declining|stable", "reason": "..." },
"waitTime": { "estimate": "estimated wait or insufficient data", "basedOn": numberOfReviewsMentioningWait },
"bestFor": ["romantic dinner", "business lunch", "family"]
If fewer than 3 reviews mention wait times, return estimate as "insufficient data".`
  return base + proAddition
}

function buildUserMessage(reviews: Review[]): string {
  const reviewTexts = reviews
    .map((r, i) => `[${i + 1}] (${r.rating}★) ${r.text}`)
    .join('\n')
  return `Analyze these ${reviews.length} reviews:\n\n${reviewTexts}`
}

function computeLanguageBreakdown(reviews: Review[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const r of reviews) {
    const lang = r.language || 'unknown'
    counts[lang] = (counts[lang] || 0) + 1
  }
  return counts
}

export async function handleAnalyze(
  request: Request,
  env: Env,
  jsonResponse: (data: unknown, status?: number) => Response,
  errorResponse: (message: string, status: number) => Response
): Promise<Response> {
  try {
    // 1. 인증: JWT → user_id 또는 X-Device-ID → device_id
    const identity = await extractIdentity(request, env)

    // 2. 요청 크기 검증
    validateRequestSize(request.headers.get('Content-Length'), MAX_BODY_BYTES)

    // 3. Body 파싱 + 입력 검증
    const body = (await request.json()) as AnalyzeBody

    if (!body.reviews || !Array.isArray(body.reviews)) {
      return errorResponse('reviews array required', 400)
    }
    if (body.reviews.length > MAX_REVIEWS) {
      return errorResponse(`Maximum ${MAX_REVIEWS} reviews allowed`, 400)
    }
    if (body.reviews.some((r) => r.text && r.text.length > MAX_REVIEW_LENGTH)) {
      return errorResponse(`Review text exceeds ${MAX_REVIEW_LENGTH} chars`, 400)
    }

    // 바디 크기 fallback 검증 (Content-Length 헤더 없었을 경우)
    const bodyStr = JSON.stringify(body)
    if (new TextEncoder().encode(bodyStr).length > MAX_BODY_BYTES) {
      return errorResponse('Request body too large', 413)
    }

    // 4. 사용량 원자적 카운트 증가 (Race condition 방지)
    const limit = parseInt(env.FREE_DAILY_LIMIT, 10)
    const usageParams =
      identity.type === 'user'
        ? { p_user_id: identity.userId, p_limit: limit }
        : { p_device_id: identity.deviceId, p_limit: limit }
    const usageResult = (await supabaseRpc(env, 'increment_usage', usageParams)) as Array<{
      new_count: number
      exceeded: boolean
    }>

    // Pro 체크 (서버에서 DB 조회 — 클라이언트 isPro 캐시를 신뢰하지 않음)
    let isPro = false
    if (identity.type === 'user') {
      const subs = (await supabaseQuery(
        env,
        `subscriptions?user_id=eq.${encodeURIComponent(identity.userId!)}&status=eq.active&select=id`,
        { headers: { Accept: 'application/json' } }
      )) as Array<{ id: string }>
      isPro = subs.length > 0
    }

    if (!isPro && usageResult[0]?.exceeded) {
      return jsonResponse(
        { success: false, exceeded: true, error: 'Daily analysis limit reached' },
        402
      )
    }

    // 5. Claude API 호출 (실패 시 카운트 롤백)
    const systemPrompt = isPro
      ? buildProSystemPrompt(body.placeInfo?.category ?? '', body.site ?? 'google_maps')
      : buildSystemPrompt(body.placeInfo?.category ?? '', body.site ?? 'google_maps')
    const userMessage = buildUserMessage(body.reviews)
    let claudeText: string
    let model: string
    try {
      const result = await callClaude(env, systemPrompt, userMessage)
      claudeText = result.text
      model = result.model
    } catch (err) {
      // Claude API 실패 → 카운트 롤백
      try {
        const rollbackParams =
          identity.type === 'user'
            ? { p_user_id: identity.userId }
            : { p_device_id: identity.deviceId }
        await supabaseRpc(env, 'decrement_usage', rollbackParams)
      } catch {
        console.error('[Rollback failed]', err)
      }
      const msg = err instanceof Error ? err.message : 'Claude API failed'
      return errorResponse(msg, 502)
    }

    // 7. JSON 파싱
    let analysisResult: Record<string, unknown>
    try {
      analysisResult = JSON.parse(claudeText)
    } catch {
      const jsonMatch = claudeText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0])
      } else {
        return errorResponse('Failed to parse AI response', 502)
      }
    }

    // 8. languageBreakdown 서버사이드 집계
    const languageBreakdown = computeLanguageBreakdown(body.reviews)

    const summary = {
      ...analysisResult,
      languageBreakdown
    }

    // 9. analysis_history에 저장 (원문 미저장)
    try {
      await supabaseQuery(env, 'analysis_history', {
        method: 'POST',
        body: {
          ...(identity.type === 'user'
            ? { user_id: identity.userId }
            : { device_id: identity.deviceId }),
          place_id: body.placeInfo?.placeId ?? '',
          place_name: body.placeInfo?.name ?? '',
          place_url: body.placeInfo?.url ?? '',
          place_category: body.placeInfo?.category ?? '',
          summary,
          review_count: body.reviews.length,
          site: body.site ?? 'google_maps',
          model,
          prompt_version: env.PROMPT_VERSION
        },
        headers: { Prefer: 'return=minimal' }
      })
    } catch {
      // 히스토리 저장 실패해도 분석 결과는 반환
    }

    // 10. 응답 (isPro를 서버에서 반환 — 클라이언트가 Pro UI 표시에 사용)
    return jsonResponse({
      success: true,
      data: {
        ...summary,
        reviewCount: body.reviews.length,
        model,
        promptVersion: env.PROMPT_VERSION,
        isPro
      }
    })
  } catch (err) {
    if (err instanceof AuthError) return errorResponse(err.message, 401)
    if (err instanceof SizeError) return errorResponse(err.message, 413)
    if (err instanceof UsageExceededError) {
      return jsonResponse({ success: false, exceeded: true, error: err.message }, 402)
    }
    if (err instanceof ValidationError) return errorResponse(err.message, 400)

    // device_id 검증 실패
    if (err instanceof Error && err.message.includes('device_id')) {
      return errorResponse(err.message, 400)
    }
    if (err instanceof Error && err.message.includes('X-Device-ID')) {
      return errorResponse(err.message, 401)
    }

    const message = err instanceof Error ? err.message : 'Internal server error'
    return errorResponse(message, 500)
  }
}
