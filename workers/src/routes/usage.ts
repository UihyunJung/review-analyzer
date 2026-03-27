import type { Env } from '../index'
import { supabaseQuery, supabaseRpc } from '../lib/supabase'
import { extractIdentity } from '../lib/auth'
import { checkPremium } from '../lib/premium'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function handleUsage(
  request: Request,
  env: Env,
  jsonResponse: (data: unknown, status?: number) => Response,
  errorResponse: (message: string, status: number) => Response
): Promise<Response> {
  try {
    const identity = extractIdentity(request)
    const today = new Date().toISOString().split('T')[0]

    const url = new URL(request.url)
    const installId = identity.deviceId

    // 사용량 이관 (구매복원 시 이전 installId → 현재 installId)
    const migrateFrom = url.searchParams.get('migrate')
    if (migrateFrom && UUID_REGEX.test(migrateFrom) && migrateFrom !== installId) {
      try {
        await supabaseRpc(env, 'migrate_usage', { p_old_device_id: migrateFrom, p_new_device_id: installId })
      } catch { /* 이관 실패해도 조회는 계속 */ }
    }

    // Pro 체크 — Vercel /api/status (1분 캐시, refresh=true 시 캐시 무시)
    const skipCache = url.searchParams.get('refresh') === 'true'
    const isPro = await checkPremium(installId, env, skipCache)
    const limit = isPro ? parseInt(env.PRO_DAILY_LIMIT, 10) : parseInt(env.FREE_DAILY_LIMIT, 10)

    const filter = `device_id=eq.${encodeURIComponent(identity.deviceId)}`

    const result = (await supabaseQuery(env, `usage?${filter}&date_key=eq.${today}&select=count`, {
      headers: { Accept: 'application/json' }
    })) as Array<{ count: number }>

    const count = result?.[0]?.count ?? 0

    return jsonResponse({
      success: true,
      data: {
        count,
        limit,
        isPro,
        remaining: Math.max(0, limit - count)
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
