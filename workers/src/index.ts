import { handleAnalyze } from './routes/analyze'
import { handleUsage } from './routes/usage'
import { handleHistory } from './routes/history'
import { handleCompare } from './routes/compare'
import { isRateLimited } from './lib/rate-limit'

export interface Env {
  GEMINI_API_KEY: string
  GEMINI_MODEL: string
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  PROMPT_VERSION: string
  FREE_DAILY_LIMIT: string
  PRO_DAILY_LIMIT: string
  PADDLE_BACKEND_URL: string
  ALLOWED_ORIGINS?: string
}

function isAllowedOrigin(origin: string, env: Env): boolean {
  // Origin 없는 요청 허용 — curl, 서버→서버 등. device_id 검증으로 인증됨.
  if (!origin) return true
  if (origin.startsWith('chrome-extension://')) return true
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
    'Access-Control-Allow-Headers': 'Content-Type, X-Device-ID',
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

    if (!isAllowedOrigin(origin, env)) {
      return new Response(JSON.stringify({ success: false, error: 'Origin not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const jsonResponse = makeJsonResponse(origin)
    const errorResponse = makeErrorResponse(origin)

    const clientIp = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    if (isRateLimited(clientIp)) {
      return errorResponse('Too many requests', 429)
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    try {
      switch (path) {
        case '/analyze':
          if (request.method !== 'POST') return errorResponse('Method not allowed', 405)
          return handleAnalyze(request, env, jsonResponse, errorResponse)

        case '/usage':
          if (request.method !== 'GET') return errorResponse('Method not allowed', 405)
          return handleUsage(request, env, jsonResponse, errorResponse)

        case '/history':
          if (request.method !== 'GET') return errorResponse('Method not allowed', 405)
          return handleHistory(request, env, jsonResponse, errorResponse)

        case '/compare':
          if (request.method !== 'POST') return errorResponse('Method not allowed', 405)
          return handleCompare(request, env, jsonResponse, errorResponse)

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
