import type { Env } from '../index'

/**
 * HMAC-SHA256 기반 단기 토큰 (5분 만료).
 * 확장에서 발급 → 체크아웃 페이지에서 서버 검증.
 */

interface TokenPayload {
  userId: string
  email: string
  exp: number
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

async function hmacVerify(data: string, signature: string, secret: string): Promise<boolean> {
  const expected = await hmacSign(data, secret)
  return expected === signature
}

export async function createCheckoutToken(
  userId: string,
  email: string,
  env: Env
): Promise<string> {
  const payload: TokenPayload = {
    userId,
    email,
    exp: Date.now() + 5 * 60 * 1000 // 5분 만료
  }
  const payloadStr = btoa(JSON.stringify(payload))
  const signature = await hmacSign(payloadStr, env.CHECKOUT_TOKEN_SECRET)
  return `${payloadStr}.${signature}`
}

export async function verifyCheckoutToken(
  token: string,
  env: Env
): Promise<TokenPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 2) return null

  const [payloadStr, signature] = parts

  const valid = await hmacVerify(payloadStr, signature, env.CHECKOUT_TOKEN_SECRET)
  if (!valid) return null

  try {
    const payload = JSON.parse(atob(payloadStr)) as TokenPayload
    if (Date.now() > payload.exp) return null // 만료
    return payload
  } catch {
    return null
  }
}
