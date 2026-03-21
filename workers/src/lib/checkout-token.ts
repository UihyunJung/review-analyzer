import type { Env } from '../index'

/**
 * HMAC-SHA256 기반 단기 토큰 (5분 만료).
 * base64url 인코딩 사용 (URL hash에서 +/= 파싱 문제 방지).
 */

interface TokenPayload {
  userId: string
  exp: number
}

function toBase64Url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (str.length % 4)) % 4)
  return atob(padded)
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
  return toBase64Url(String.fromCharCode(...new Uint8Array(sig)))
}

async function hmacVerify(data: string, signature: string, secret: string): Promise<boolean> {
  const expected = await hmacSign(data, secret)
  // Constant-time comparison (타이밍 사이드채널 방지)
  if (expected.length !== signature.length) return false
  let result = 0
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return result === 0
}

export async function createCheckoutToken(userId: string, env: Env): Promise<string> {
  const payload: TokenPayload = {
    userId,
    exp: Date.now() + 5 * 60 * 1000
  }
  const payloadStr = toBase64Url(JSON.stringify(payload))
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
    const payload = JSON.parse(fromBase64Url(payloadStr)) as TokenPayload
    if (Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}
