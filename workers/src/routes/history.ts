import type { Env } from '../index'
import { supabaseQuery } from '../lib/supabase'
import { extractIdentity } from '../lib/auth'
import { checkPremium } from '../lib/premium'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function handleHistory(
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

    const url = new URL(request.url)
    const rowId = url.searchParams.get('id')

    if (rowId) {
      // 상세 모드: 단건 조회 (summary 포함)
      if (!UUID_REGEX.test(rowId)) {
        return errorResponse('Invalid id parameter', 400)
      }

      const query = `analysis_history?id=eq.${rowId}&device_id=eq.${encodeURIComponent(installId)}&limit=1`
      const result = (await supabaseQuery(env, query)) as Array<Record<string, unknown>>

      if (!result?.length) {
        return errorResponse('Not found', 404)
      }

      return jsonResponse({ success: true, data: result[0] })
    }

    // 목록 모드: 최근 20개 (summary 제외)
    const query = `analysis_history?device_id=eq.${encodeURIComponent(installId)}&select=id,place_name,place_category,place_id,site,created_at,review_count&order=created_at.desc&limit=20`
    const result = await supabaseQuery(env, query)

    return jsonResponse({ success: true, data: result })
  } catch (err) {
    if (err instanceof Error && (err.message.includes('device_id') || err.message.includes('X-Device-ID'))) {
      return errorResponse(err.message, 400)
    }
    const message = err instanceof Error ? err.message : 'Internal server error'
    return errorResponse(message, 500)
  }
}
