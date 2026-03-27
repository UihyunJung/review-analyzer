import type { Env } from '../index'
import { callGemini } from '../lib/gemini'
import { supabaseRpc, supabaseQuery } from '../lib/supabase'
import {
  validateRequestSize,
  SizeError,
  UsageExceededError,
  ValidationError
} from '../lib/validate'
import { extractIdentity, AuthError } from '../lib/auth'
import { checkPremium } from '../lib/premium'

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
  lang?: string
}

const LANG_NAMES: Record<string, string> = {
  en: 'English', ko: '한국어', ja: '日本語',
  'zh-CN': '简体中文', 'zh-TW': '繁體中文',
  de: 'Deutsch', es: 'Español', fr: 'Français',
  'pt-BR': 'Português', it: 'Italiano'
}

function buildSystemPrompt(category: string, site: string, lang: string): string {
  const langName = LANG_NAMES[lang] || 'English'

  return `You are a review analyst for Google Maps places. Analyze the provided reviews for a ${category || 'place'}.
Reviews may be in multiple languages — analyze all regardless of language.

CRITICAL RULES:
1. Return ONLY valid JSON. No markdown, no code blocks, no text before or after the JSON.
2. All JSON keys MUST be exactly as shown below (English, lowercase). Never translate or change the keys.
3. All JSON string values (summary, keywords, highlights, warnings) MUST be written in ${langName}.

Return this exact JSON structure:
{
  "aspects": [
    { "aspect": "food", "score": 8.5, "summary": "Brief summary in ${langName}", "keywords": ["keyword1", "keyword2"] },
    { "aspect": "service", "score": 6.2, "summary": "Brief summary in ${langName}", "keywords": ["keyword1"] },
    { "aspect": "value", "score": 7.8, "summary": "Brief summary in ${langName}", "keywords": ["keyword1"] },
    { "aspect": "ambiance", "score": 9.1, "summary": "Brief summary in ${langName}", "keywords": ["keyword1"] }
  ],
  "highlights": ["Point 1 in ${langName}", "Point 2", "Point 3"],
  "warnings": ["Warning 1 in ${langName}", "Warning 2", "Warning 3"]
}
The "aspect" field MUST be one of exactly these values: "food", "service", "value", "ambiance". Do NOT use any other aspect names.
Scores are 0-10. Only include relevant aspects (e.g. skip "food" for a hotel).
Be concise. Each summary should be 1-2 sentences max.`
}

function buildProSystemPrompt(category: string, site: string, lang: string): string {
  const langName = LANG_NAMES[lang] || 'English'
  const base = buildSystemPrompt(category, site, lang)
  return base + `

Also include these additional fields in the JSON (keys in English, values in ${langName}):
"trend": { "recentSentiment": "positive|negative|mixed", "previousSentiment": "positive|negative|mixed", "direction": "improving|declining|stable", "reason": "reason in ${langName}" },
"waitTime": { "estimate": "estimated wait in ${langName} or insufficient data", "basedOn": numberOfReviewsMentioningWait },
"bestFor": ["suggestion1 in ${langName}", "suggestion2", "suggestion3"],
"topPicks": ["top recommendation based on reviews in ${langName}", "pick2", "pick3"],
"avoid": ["thing to avoid based on reviews in ${langName}", "avoid2"],
"tips": ["practical tip for visitors in ${langName}", "tip2", "tip3"],
"topReviews": [{"aspect": "food", "quote": "exact quote from a review, max 80 characters", "rating": 5}, {"aspect": "service", "quote": "...", "rating": 3}]
For topPicks/avoid/tips: adapt to the place category (e.g. menu items for restaurants, room types for hotels, visit tips for attractions).
For topReviews: select 2-4 representative quotes, one per aspect. Each quote must be max 80 characters.
If fewer than 3 reviews mention wait times, return estimate as "insufficient data".
If data is insufficient for a field, return an empty array.`
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
    // 1. 인증: X-Device-ID → installId
    const identity = extractIdentity(request)

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

    // 4. Pro 체크 + lang 검증
    const installId = identity.deviceId
    const isPro = await checkPremium(installId, env)
    const placeId = body.placeInfo?.placeId ?? ''
    const site = body.site ?? 'google_maps'
    const lang = LANG_NAMES[body.lang || 'en'] ? (body.lang || 'en') : 'en'

    // 5. 캐시 확인 — 같은 place_id + site + lang + isPro의 24시간 이내 분석 결과 재사용
    let cachedSummary: Record<string, unknown> | null = null
    let cachedModel = ''

    if (placeId) {
      try {
        const cacheQuery = `analysis_history?place_id=eq.${encodeURIComponent(placeId)}&site=eq.${encodeURIComponent(site)}&created_at=gte.${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()}&order=created_at.desc&limit=10`
        const cacheResult = (await supabaseQuery(env, cacheQuery)) as Array<{
          summary: Record<string, unknown>
          model: string
          prompt_version: string
        }>
        const match = cacheResult?.find(
          (r) =>
            r.prompt_version === env.PROMPT_VERSION &&
            (r.summary as Record<string, unknown>)?._lang === lang &&
            (r.summary as Record<string, unknown>)?._isPro === isPro
        )
        if (match) {
          cachedSummary = match.summary
          cachedModel = match.model
        }
      } catch {
        // cache query failed — proceed without cache
      }
    }

    let summary: Record<string, unknown>
    let model: string

    if (cachedSummary) {
      // 캐시 히트 — 사용량 카운트 없이 즉시 반환
      summary = cachedSummary
      model = cachedModel
    } else {
      // 6. 사용량 카운트 (캐시 미스일 때만)
      const limit = isPro ? parseInt(env.PRO_DAILY_LIMIT, 10) : parseInt(env.FREE_DAILY_LIMIT, 10)
      const usageParams = { p_device_id: identity.deviceId, p_limit: limit }
      const usageResult = (await supabaseRpc(env, 'increment_usage', usageParams)) as Array<{
        new_count: number
        exceeded: boolean
      }>

      if (usageResult[0]?.exceeded) {
        return jsonResponse(
          { success: false, exceeded: true, error: 'Daily analysis limit reached' },
          402
        )
      }

      // 7. Gemini API 호출 (실패 시 카운트 롤백)
      const systemPrompt = isPro
        ? buildProSystemPrompt(body.placeInfo?.category ?? '', site, lang)
        : buildSystemPrompt(body.placeInfo?.category ?? '', site, lang)
      const userMessage = buildUserMessage(body.reviews)
      let geminiText: string
      try {
        const result = await callGemini(env, systemPrompt, userMessage)
        geminiText = result.text
        model = result.model
      } catch (err) {
        try {
          await supabaseRpc(env, 'decrement_usage', { p_device_id: identity.deviceId })
        } catch {
          console.error('[Rollback failed]', err)
        }
        return errorResponse('AI service temporarily unavailable', 502)
      }

      // 8. JSON 파싱
      let analysisResult: Record<string, unknown>
      try {
        analysisResult = JSON.parse(geminiText)
      } catch {
        const jsonMatch = geminiText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          try {
            analysisResult = JSON.parse(jsonMatch[0])
          } catch {
            try { await supabaseRpc(env, 'decrement_usage', { p_device_id: identity.deviceId }) } catch { /* ignore */ }
            return errorResponse('Failed to parse AI response', 502)
          }
        } else {
          try { await supabaseRpc(env, 'decrement_usage', { p_device_id: identity.deviceId }) } catch { /* ignore */ }
          return errorResponse('Failed to parse AI response', 502)
        }
      }

      // 9. languageBreakdown 서버사이드 집계
      const languageBreakdown = computeLanguageBreakdown(body.reviews)
      summary = { ...analysisResult, languageBreakdown, _lang: lang, _isPro: isPro }

      // 10. analysis_history에 저장 (원문 미저장)
      try {
        await supabaseQuery(env, 'analysis_history', {
          method: 'POST',
          body: {
            device_id: identity.deviceId,
            place_id: placeId,
            place_name: body.placeInfo?.name ?? '',
            place_url: body.placeInfo?.url ?? '',
            place_category: body.placeInfo?.category ?? '',
            summary,
            review_count: body.reviews.length,
            site,
            model,
            prompt_version: env.PROMPT_VERSION
          },
          headers: { Prefer: 'return=minimal' }
        })
      } catch {
        // 히스토리 저장 실패해도 분석 결과는 반환
      }
    }

    // 11. 응답
    return jsonResponse({
      success: true,
      data: {
        ...summary,
        reviewCount: body.reviews.length,
        model,
        promptVersion: env.PROMPT_VERSION,
        isPro,
        cached: !!cachedSummary
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
