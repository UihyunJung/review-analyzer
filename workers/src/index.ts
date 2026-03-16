import { handleAnalyze } from './routes/analyze'
import { handleAnalyzePro } from './routes/analyze-pro'
import { handleUsage } from './routes/usage'
import { handleCreateCheckoutToken, handleVerifyCheckoutToken } from './routes/checkout-token'
import { handlePaddleWebhook } from './routes/paddle-webhook'

export interface Env {
  ANTHROPIC_API_KEY: string
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  CLAUDE_MODEL: string
  PROMPT_VERSION: string
  FREE_DAILY_LIMIT: string
  CHECKOUT_TOKEN_SECRET: string
  CHECKOUT_ORIGIN: string // GitHub Pages 도메인 (e.g. https://username.github.io)
}

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Device-ID, Authorization'
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  })
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ success: false, error: message }, status)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    const url = new URL(request.url)
    const path = url.pathname

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
          return handleVerifyCheckoutToken(
            request,
            env,
            jsonResponse,
            errorResponse,
            env.CHECKOUT_ORIGIN
          )

        case '/paddle-webhook':
          if (request.method !== 'POST') return errorResponse('Method not allowed', 405)
          return handlePaddleWebhook(request, env, jsonResponse, errorResponse)

        default:
          return errorResponse('Not found', 404)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error'
      return errorResponse(message, 500)
    }
  }
}
