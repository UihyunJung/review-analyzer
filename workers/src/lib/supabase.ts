import type { Env } from '../index'

export class SupabaseError extends Error {
  constructor(
    public readonly statusCode: number,
    detail: string
  ) {
    // 내부 에러 상세는 로깅만, 사용자에게는 일반 메시지
    super('Database operation failed')
    this.name = 'SupabaseError'
    // eslint-disable-next-line no-console
    console.error(`[Supabase ${statusCode}]`, detail)
  }
}

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
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  })

  if (!res.ok) {
    const text = await res.text()
    throw new SupabaseError(res.status, text)
  }

  const text = await res.text()
  return text ? JSON.parse(text) : null
}

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
    throw new SupabaseError(res.status, text)
  }

  return res.json()
}
