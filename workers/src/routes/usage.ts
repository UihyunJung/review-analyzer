import type { Env } from '../index'
import { supabaseQuery } from '../lib/supabase'
import { extractIdentity } from '../lib/auth'
import { checkPremium } from '../lib/premium'

export async function handleUsage(
  request: Request,
  env: Env,
  jsonResponse: (data: unknown, status?: number) => Response,
  errorResponse: (message: string, status: number) => Response
): Promise<Response> {
  try {
    const identity = extractIdentity(request)
    const today = new Date().toISOString().split('T')[0]

    // Pro 체크 — Vercel /api/status (1분 캐시)
    const installId = identity.deviceId
    const isPro = await checkPremium(installId, env)
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
