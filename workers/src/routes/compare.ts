import type { Env } from '../index'
import { supabaseQuery } from '../lib/supabase'
import { extractIdentity } from '../lib/auth'
import { checkPremium } from '../lib/premium'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface CompareBody {
  ids: string[]
}

export async function handleCompare(
  request: Request,
  env: Env,
  jsonResponse: (data: unknown, status?: number) => Response,
  errorResponse: (message: string, status: number) => Response
): Promise<Response> {
  try {
    const identity = extractIdentity(request)
    const installId = identity.deviceId
    const isPro = await checkPremium(installId, env)

    if (!isPro) {
      return errorResponse('Pro subscription required', 403)
    }

    const body = (await request.json()) as CompareBody

    if (!Array.isArray(body.ids) || body.ids.length !== 2) {
      return errorResponse('ids must be an array of exactly 2 strings', 400)
    }

    const [id1, id2] = body.ids.map(String)
    if (!UUID_REGEX.test(id1) || !UUID_REGEX.test(id2)) {
      return errorResponse('Invalid id values', 400)
    }

    // 두 row 모두 device_id 소유권 확인
    const query = `analysis_history?id=in.(${id1},${id2})&device_id=eq.${encodeURIComponent(installId)}&select=id,place_name,place_category,summary,review_count,created_at`
    const result = (await supabaseQuery(env, query)) as Array<Record<string, unknown>>

    if (!result || result.length !== 2) {
      return errorResponse('One or both analyses not found', 404)
    }

    const place1 = result.find((r) => r.id === id1)
    const place2 = result.find((r) => r.id === id2)

    if (!place1 || !place2) {
      return errorResponse('One or both analyses not found', 404)
    }

    const extractPlace = (row: Record<string, unknown>) => {
      const summary = row.summary as Record<string, unknown> | undefined
      return {
        id: row.id,
        name: row.place_name,
        category: row.place_category,
        aspects: Array.isArray(summary?.aspects) ? summary.aspects : [],
        highlights: Array.isArray(summary?.highlights) ? summary.highlights : [],
        reviewCount: row.review_count
      }
    }

    return jsonResponse({
      success: true,
      data: {
        place1: extractPlace(place1),
        place2: extractPlace(place2)
      }
    })
  } catch (err) {
    if (err instanceof Error && (err.message.includes('device_id') || err.message.includes('X-Device-ID'))) {
      return errorResponse(err.message, 400)
    }
    const message = err instanceof Error ? err.message : 'Internal server error'
    return errorResponse(message, 500)
  }
}
