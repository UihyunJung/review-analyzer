import type { Env } from '../index'

// Supabase REST API를 직접 호출 (supabase-js 의존성 없이 Workers에서 경량 사용)
export async function supabaseQuery(
  env: Env,
  path: string,
  options: {
    method?: string
    body?: unknown
    headers?: Record<string, string>
  } = {}
): Promise<unknown> {
  const { method = 'GET', body, headers = {} } = options

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'return=representation' : '',
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Supabase error ${res.status}: ${text}`)
  }

  const text = await res.text()
  return text ? JSON.parse(text) : null
}

// RPC 호출
export async function supabaseRpc(
  env: Env,
  functionName: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Supabase RPC error ${res.status}: ${text}`)
  }

  return res.json()
}
