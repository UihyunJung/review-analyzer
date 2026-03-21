/**
 * 간단한 인메모리 IP rate limiter (Cloudflare Workers용).
 * Workers 인스턴스 재시작 시 초기화됨 — 완벽하지 않지만 기본 남용 방어로 충분.
 * 프로덕션 스케일에서는 Cloudflare Rate Limiting 또는 KV 기반으로 전환.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const ipCounts = new Map<string, RateLimitEntry>()

const WINDOW_MS = 60 * 1000 // 1분
const MAX_REQUESTS = 30 // 분당 30 요청

/** 오래된 엔트리 정리 (메모리 누수 방지) */
function cleanup() {
  const now = Date.now()
  for (const [key, entry] of ipCounts) {
    if (now > entry.resetAt) {
      ipCounts.delete(key)
    }
  }
}

/** IP rate limit 체크. 초과 시 true 반환. */
export function isRateLimited(ip: string): boolean {
  const now = Date.now()

  // 1000개 이상 쌓이면 정리
  if (ipCounts.size > 1000) cleanup()

  const entry = ipCounts.get(ip)

  if (!entry || now > entry.resetAt) {
    ipCounts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }

  entry.count++
  return entry.count > MAX_REQUESTS
}
