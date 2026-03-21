import type { Env } from '../index'
import { callClaude } from '../lib/claude'
import { supabaseQuery } from '../lib/supabase'
import { extractIdentity } from '../lib/auth'
import { validateRequestSize, SizeError } from '../lib/validate'

const MAX_BODY_BYTES = 100 * 1024

interface Review {
  id: string
  text: string
  rating: number
  date: string | null
  language?: string
}

interface AnalyzeProBody {
  reviews: Review[]
  placeInfo: {
    placeId: string
    name: string
    url: string
    category: string
  }
  site: string
}

function buildProPrompt(category: string): string {
  return `You are a review analyst providing Pro-level insights for a ${category || 'place'} on Google Maps.
Reviews may be in multiple languages — analyze all regardless of language. Respond in English.

You will receive reviews split into two groups: "RECENT" (last ~3 months) and "OLDER".

Return ONLY valid JSON with this structure:
{
  "aspects": [
    { "aspect": "food", "score": 8.5, "summary": "Brief summary", "keywords": ["keyword1"] },
    { "aspect": "service", "score": 6.2, "summary": "Brief summary", "keywords": ["keyword1"] },
    { "aspect": "value", "score": 7.8, "summary": "Brief summary", "keywords": ["keyword1"] },
    { "aspect": "ambiance", "score": 9.1, "summary": "Brief summary", "keywords": ["keyword1"] }
  ],
  "highlights": ["Top positive 1", "Top positive 2", "Top positive 3"],
  "warnings": ["Watch out 1", "Watch out 2"],
  "trend": {
    "recentSentiment": "positive",
    "previousSentiment": "mixed",
    "direction": "improving",
    "reason": "Recent reviews praise new chef and updated menu"
  },
  "waitTime": {
    "estimate": "15-20 min on weekends",
    "basedOn": 5
  },
  "bestFor": ["romantic dinner", "business lunch", "family"]
}

Rules:
- Scores 0-10. Only include relevant aspects.
- trend.direction: "improving" | "declining" | "stable"
- If fewer than 3 reviews mention wait/queue/line, return waitTime: { "estimate": "insufficient data", "basedOn": 0 }
- bestFor: 2-4 use cases based on review sentiment.`
}

function splitReviewsByRecency(reviews: Review[]): { recent: Review[]; older: Review[] } {
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

  const recent: Review[] = []
  const older: Review[] = []

  for (const r of reviews) {
    if (r.date && new Date(r.date) > threeMonthsAgo) {
      recent.push(r)
    } else {
      older.push(r)
    }
  }

  return { recent, older }
}

function buildUserMessage(reviews: Review[]): string {
  const { recent, older } = splitReviewsByRecency(reviews)

  let msg = `=== RECENT REVIEWS (last 3 months, ${recent.length} reviews) ===\n`
  msg += recent.map((r, i) => `[R${i + 1}] (${r.rating}★) ${r.text}`).join('\n')

  msg += `\n\n=== OLDER REVIEWS (${older.length} reviews) ===\n`
  msg += older.map((r, i) => `[O${i + 1}] (${r.rating}★) ${r.text}`).join('\n')

  return msg
}

function computeLanguageBreakdown(reviews: Review[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const r of reviews) {
    const lang = r.language || 'unknown'
    counts[lang] = (counts[lang] || 0) + 1
  }
  return counts
}

export async function handleAnalyzePro(
  request: Request,
  env: Env,
  jsonResponse: (data: unknown, status?: number) => Response,
  errorResponse: (message: string, status: number) => Response
): Promise<Response> {
  try {
    const identity = await extractIdentity(request, env)

    // Pro 체크: 인증된 사용자만 + active subscription
    if (identity.type !== 'user' || !identity.userId) {
      return errorResponse('Pro features require a signed-in account', 403)
    }

    const subs = (await supabaseQuery(
      env,
      `subscriptions?user_id=eq.${encodeURIComponent(identity.userId!)}&status=eq.active&select=id`,
      { headers: { Accept: 'application/json' } }
    )) as Array<{ id: string }>

    if (subs.length === 0) {
      return errorResponse('Pro subscription required', 403)
    }

    // 입력 검증
    validateRequestSize(request.headers.get('Content-Length'), MAX_BODY_BYTES)
    const body = (await request.json()) as AnalyzeProBody

    if (!body.reviews?.length) {
      return errorResponse('reviews array required', 400)
    }

    // Claude API 호출 (단일 프롬프트에 전체 분석 통합)
    const systemPrompt = buildProPrompt(body.placeInfo?.category ?? '')
    const userMessage = buildUserMessage(body.reviews)
    const { text: claudeText, model } = await callClaude(env, systemPrompt, userMessage)

    // JSON 파싱
    let result: Record<string, unknown>
    try {
      result = JSON.parse(claudeText)
    } catch {
      const jsonMatch = claudeText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0])
      } else {
        return errorResponse('Failed to parse AI response', 502)
      }
    }

    const languageBreakdown = computeLanguageBreakdown(body.reviews)

    const summary = { ...result, languageBreakdown }

    // 히스토리 저장
    try {
      await supabaseQuery(env, 'analysis_history', {
        method: 'POST',
        body: {
          user_id: identity.userId,
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
      // 저장 실패해도 결과는 반환
    }

    return jsonResponse({
      success: true,
      data: {
        ...summary,
        reviewCount: body.reviews.length,
        model,
        promptVersion: env.PROMPT_VERSION
      }
    })
  } catch (err) {
    if (err instanceof SizeError) return errorResponse(err.message, 413)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return errorResponse(message, 500)
  }
}
