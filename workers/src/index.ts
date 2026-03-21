import { handleAnalyze } from './routes/analyze'
import { handleAnalyzePro } from './routes/analyze-pro'
import { handleUsage } from './routes/usage'
import { handleCreateCheckoutToken, handleVerifyCheckoutToken } from './routes/checkout-token'
import { handlePaddleWebhook } from './routes/paddle-webhook'
import { isRateLimited } from './lib/rate-limit'

export interface Env {
  ANTHROPIC_API_KEY: string
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  CLAUDE_MODEL: string
  PROMPT_VERSION: string
  FREE_DAILY_LIMIT: string
  CHECKOUT_TOKEN_SECRET: string
  CHECKOUT_ORIGIN: string
  ALLOWED_ORIGINS?: string // 쉼표 구분. 비어있으면 chrome-extension:// 만 허용
}

/**
 * Origin 검증:
 * - chrome-extension:// 은 항상 허용 (확장)
 * - CHECKOUT_ORIGIN은 /verify-checkout-token에서만 허용
 * - ALLOWED_ORIGINS에 명시된 도메인 허용
 * - 그 외는 거부
 */
function isAllowedOrigin(origin: string, env: Env, path: string): boolean {
  // Origin 없는 요청 허용 — Paddle 웹훅(서버→서버), curl, 모바일 앱 등.
  // 이 요청도 JWT/device_id 검증을 거치므로 Origin 없이도 인증됨.
  if (!origin) return true
  if (origin.startsWith('chrome-extension://')) return true
  if (path === '/verify-checkout-token' && env.CHECKOUT_ORIGIN && origin === env.CHECKOUT_ORIGIN)
    return true
  if (path === '/paddle-webhook') return true // 웹훅은 Paddle 서버에서 옴
  if (env.ALLOWED_ORIGINS) {
    const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
    if (allowed.includes(origin)) return true
  }
  return false
}

function corsHeaders(origin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin || 'null',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Device-ID, Authorization',
    Vary: 'Origin'
  }
}

function makeJsonResponse(origin: string) {
  return (data: unknown, status = 200): Response =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
    })
}

function makeErrorResponse(origin: string) {
  return (message: string, status: number): Response =>
    makeJsonResponse(origin)({ success: false, error: message }, status)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    const origin = request.headers.get('Origin') ?? ''

    // CORS Origin 검증
    if (!isAllowedOrigin(origin, env, path)) {
      return new Response(JSON.stringify({ success: false, error: 'Origin not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const jsonResponse = makeJsonResponse(origin)
    const errorResponse = makeErrorResponse(origin)

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    // IP rate limit (분당 30 요청)
    const clientIp = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    if (path !== '/paddle-webhook' && isRateLimited(clientIp)) {
      return errorResponse('Too many requests', 429)
    }

    try {
      switch (path) {
        case '/analyze':
          if (request.method !== 'POST') return errorResponse('Method not allowed', 405)
          return handleAnalyze(request, env, jsonResponse, errorResponse)

        case '/analyze-pro':
          if (request.method !== 'POST') return errorResponse('Method not allowed', 405)
          return handleAnalyzePro(request, env, jsonResponse, errorResponse)

        case '/usage':
          if (request.method !== 'GET') return errorResponse('Method not allowed', 405)
          return handleUsage(request, env, jsonResponse, errorResponse)

        case '/checkout-token':
          if (request.method !== 'POST') return errorResponse('Method not allowed', 405)
          return handleCreateCheckoutToken(request, env, jsonResponse, errorResponse)

        case '/verify-checkout-token':
          if (request.method !== 'POST') return errorResponse('Method not allowed', 405)
          return handleVerifyCheckoutToken(request, env, jsonResponse, errorResponse, env.CHECKOUT_ORIGIN)

        case '/paddle-webhook':
          // Paddle 시그니처 검증은 paddle-webhook.ts 내부에서 구현 (Paddle 연동 시)
          // query param secret 방식은 로그 유출 위험으로 제거됨
          if (request.method !== 'POST') return errorResponse('Method not allowed', 405)
          return handlePaddleWebhook(request, env, jsonResponse, errorResponse)

        default:
          return errorResponse('Not found', 404)
      }
    } catch (err) {
      console.error('[Workers Error]', path, err)
      const message = err instanceof Error ? err.message : 'Internal server error'
      return errorResponse(message, 500)
    }
  }
}
