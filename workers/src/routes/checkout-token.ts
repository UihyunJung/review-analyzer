import type { Env } from '../index'
import { extractIdentity, AuthError } from '../lib/auth'
import { createCheckoutToken, verifyCheckoutToken } from '../lib/checkout-token'
import { supabaseQuery } from '../lib/supabase'

/** POST /checkout-token — 확장에서 호출, 인증 사용자만 */
export async function handleCreateCheckoutToken(
  request: Request,
  env: Env,
  jsonResponse: (data: unknown, status?: number) => Response,
  errorResponse: (message: string, status: number) => Response
): Promise<Response> {
  try {
    const identity = await extractIdentity(request, env)
    if (identity.type !== 'user' || !identity.userId) {
      return errorResponse('Authentication required. Sign in to upgrade to Pro.', 401)
    }

    const token = await createCheckoutToken(identity.userId, env)

    return jsonResponse({ success: true, token })
  } catch (err) {
    if (err instanceof AuthError) return errorResponse(err.message, 401)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return errorResponse(message, 500)
  }
}

/** POST /verify-checkout-token — 체크아웃 페이지에서 호출 */
export async function handleVerifyCheckoutToken(
  request: Request,
  env: Env,
  jsonResponse: (data: unknown, status?: number) => Response,
  errorResponse: (message: string, status: number) => Response,
  checkoutOrigin: string
): Promise<Response> {
  const origin = request.headers.get('Origin') ?? ''
  const corsOrigin = checkoutOrigin || '*'

  const corsHeaders = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  }

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  // CORS origin 체크
  if (checkoutOrigin && origin && origin !== checkoutOrigin) {
    return errorResponse('CORS origin not allowed', 403)
  }

  try {
    const body = (await request.json()) as { token?: string }
    if (!body.token) return errorResponse('Token required', 400)

    const payload = await verifyCheckoutToken(body.token, env)
    if (!payload) return errorResponse('Invalid or expired token', 401)

    // email은 토큰에 미포함 — 서버에서 Supabase Auth로 조회
    let email = ''
    try {
      const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${payload.userId}`, {
        headers: {
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: env.SUPABASE_SERVICE_ROLE_KEY
        }
      })
      if (res.ok) {
        const user = (await res.json()) as { email?: string }
        email = user.email ?? ''
      }
    } catch {
      // email 조회 실패해도 userId만으로 진행 가능
    }

    return new Response(
      JSON.stringify({ success: true, userId: payload.userId, email }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return errorResponse(message, 500)
  }
}
