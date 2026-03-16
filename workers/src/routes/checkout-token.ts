import type { Env } from '../index'
import { extractIdentity } from '../lib/auth'
import { createCheckoutToken, verifyCheckoutToken } from '../lib/checkout-token'

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
      return errorResponse('Authentication required', 401)
    }

    // body에서 email 가져오기 (또는 JWT에서 추출 가능)
    const body = (await request.json().catch(() => ({}))) as { email?: string }
    const email = body.email ?? ''

    const token = await createCheckoutToken(identity.userId, email, env)

    return jsonResponse({ success: true, token })
  } catch (err) {
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
  // CORS: 체크아웃 도메인만 허용
  const origin = request.headers.get('Origin') ?? ''
  if (checkoutOrigin && origin !== checkoutOrigin) {
    return errorResponse('CORS origin not allowed', 403)
  }

  try {
    const body = (await request.json()) as { token?: string }
    if (!body.token) return errorResponse('Token required', 400)

    const payload = await verifyCheckoutToken(body.token, env)
    if (!payload) return errorResponse('Invalid or expired token', 401)

    return new Response(
      JSON.stringify({ success: true, userId: payload.userId, email: payload.email }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': checkoutOrigin || '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return errorResponse(message, 500)
  }
}
