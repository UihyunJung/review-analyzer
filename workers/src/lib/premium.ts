import type { Env } from '../index'

/**
 * Vercel /api/status 호출로 Pro 여부 확인. 인메모리 1분 캐시.
 * 결제 직후 Pro 반영 지연을 최소화하기 위해 5분 → 1분으로 축소.
 */
const cache = new Map<string, { isPro: boolean; expiresAt: number }>()

export async function checkPremium(installId: string, env: Env, skipCache = false): Promise<boolean> {
  if (!installId) return false

  if (!skipCache) {
    const cached = cache.get(installId)
    if (cached && Date.now() < cached.expiresAt) return cached.isPro
  }

  // 1000개 이상이면 정리
  if (cache.size > 1000) {
    const now = Date.now()
    for (const [key, val] of cache) {
      if (now > val.expiresAt) cache.delete(key)
    }
  }

  try {
    const res = await fetch(`${env.PADDLE_BACKEND_URL}/api/status?id=${installId}`)
    if (!res.ok) return false

    const { premium } = (await res.json()) as { premium: boolean }
    cache.set(installId, { isPro: premium, expiresAt: Date.now() + 60 * 1000 })
    return premium
  } catch {
    return false
  }
}
