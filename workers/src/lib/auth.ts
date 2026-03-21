import type { Env } from '../index'
import { validateDeviceId } from './validate'

export interface AuthIdentity {
  type: 'user' | 'device'
  userId?: string
  deviceId?: string
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

/**
 * Request에서 인증 정보 추출.
 * - Authorization: Bearer <jwt> → Supabase JWT 검증 → user_id
 * - X-Device-ID: <uuid> → device_id
 * - JWT가 있지만 검증 실패 시: X-Device-ID도 있으면 device_id fallback, 없으면 AuthError
 */
export async function extractIdentity(request: Request, env: Env): Promise<AuthIdentity> {
  const authHeader = request.headers.get('Authorization')
  const deviceIdHeader = request.headers.get('X-Device-ID')

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const userId = await verifySupabaseJwt(token, env)
    if (userId) {
      return { type: 'user', userId }
    }
    // JWT 검증 실패 — device_id가 함께 있으면 fallback, 없으면 에러
    if (deviceIdHeader) {
      const deviceId = validateDeviceId(deviceIdHeader)
      return { type: 'device', deviceId }
    }
    throw new AuthError('Invalid or expired token')
  }

  // JWT 없음 — device_id 사용
  const deviceId = validateDeviceId(deviceIdHeader)
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
