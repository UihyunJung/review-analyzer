import type { Env } from '../index'
import { supabaseQuery } from '../lib/supabase'
import { extractIdentity } from '../lib/auth'

export async function handleUsage(
  request: Request,
  env: Env,
  jsonResponse: (data: unknown, status?: number) => Response,
  errorResponse: (message: string, status: number) => Response
): Promise<Response> {
  try {
    const identity = await extractIdentity(request, env)
    const limit = parseInt(env.FREE_DAILY_LIMIT, 10)
    const today = new Date().toISOString().split('T')[0]

    // identity에 따라 쿼리 분기
    const filter =
      identity.type === 'user'
        ? `user_id=eq.${encodeURIComponent(identity.userId!)}`
        : `device_id=eq.${encodeURIComponent(identity.deviceId!)}`

    const result = (await supabaseQuery(env, `usage?${filter}&date_key=eq.${today}&select=count`, {
      headers: { Accept: 'application/json' }
    })) as Array<{ count: number }>

    const count = result?.[0]?.count ?? 0

    // Pro 체크 (인증된 사용자만)
    let isPro = false
    if (identity.type === 'user') {
      const subs = (await supabaseQuery(
        env,
        `subscriptions?user_id=eq.${encodeURIComponent(identity.userId!)}&status=eq.active&select=id`,
        { headers: { Accept: 'application/json' } }
      )) as Array<{ id: string }>
      isPro = subs.length > 0
    }

    return jsonResponse({
      success: true,
      data: {
        count,
        limit,
        isPro,
        remaining: isPro ? 999 : Math.max(0, limit - count)
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
