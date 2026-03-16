import type { Env } from '../index'
import { validateDeviceId } from './validate'

export interface AuthIdentity {
  type: 'user' | 'device'
  userId?: string
  deviceId?: string
}

/**
 * Request에서 인증 정보 추출.
 * Authorization: Bearer <jwt> → Supabase JWT 검증 → user_id
 * X-Device-ID: <uuid> → device_id
 */
export async function extractIdentity(request: Request, env: Env): Promise<AuthIdentity> {
  const authHeader = request.headers.get('Authorization')

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const userId = await verifySupabaseJwt(token, env)
    if (userId) {
      return { type: 'user', userId }
    }
    // JWT 검증 실패 → device_id fallback
  }

  const deviceId = validateDeviceId(request.headers.get('X-Device-ID'))
  return { type: 'device', deviceId }
}

/** Supabase JWT를 서버사이드에서 검증 (Supabase Auth API 호출) */
async function verifySupabaseJwt(token: string, env: Env): Promise<string | null> {
  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY
      }
    })

    if (!res.ok) return null

    const user = (await res.json()) as { id?: string }
    return user.id ?? null
  } catch {
    return null
  }
}
