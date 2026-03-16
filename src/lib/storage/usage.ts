import { EDGE_FUNCTION_URL, FREE_DAILY_LIMIT, STORAGE_KEYS } from '~lib/constants'
import type { UsageData } from '~lib/types'

const DEFAULT_USAGE: UsageData = {
  count: 0,
  limit: FREE_DAILY_LIMIT,
  isPro: false,
  remaining: FREE_DAILY_LIMIT
}

export class UsageTracker {
  /** 로컬 캐시에서 사용량 반환 (표시용) */
  static async getUsage(): Promise<UsageData> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.USAGE_CACHE)
    return (result[STORAGE_KEYS.USAGE_CACHE] as UsageData) ?? { ...DEFAULT_USAGE }
  }

  /** 서버에서 최신 사용량 조회 → 로컬 캐시 갱신 */
  static async syncFromServer(): Promise<UsageData> {
    try {
      const deviceId = await this.getDeviceId()
      if (!deviceId || !EDGE_FUNCTION_URL) {
        return this.getUsage()
      }

      const res = await fetch(`${EDGE_FUNCTION_URL}/usage`, {
        headers: { 'X-Device-ID': deviceId }
      })

      if (!res.ok) return this.getUsage()

      const data = await res.json()
      if (data.success && data.data) {
        await chrome.storage.local.set({ [STORAGE_KEYS.USAGE_CACHE]: data.data })
        return data.data as UsageData
      }
    } catch {
      // 네트워크 실패 시 캐시 반환
    }
    return this.getUsage()
  }

  /** 남은 횟수 */
  static async getRemainingToday(): Promise<number> {
    const usage = await this.getUsage()
    return Math.max(0, usage.limit - usage.count)
  }

  /** 분석 가능 여부 */
  static async canAnalyze(): Promise<boolean> {
    const usage = await this.getUsage()
    return usage.isPro || usage.count < usage.limit
  }

  /** 로컬 캐시 카운트 증가 (서버 응답 전 즉시 UI 반영용) */
  static async incrementLocal(): Promise<UsageData> {
    const usage = await this.getUsage()
    const updated: UsageData = {
      ...usage,
      count: usage.count + 1,
      remaining: Math.max(0, usage.remaining - 1)
    }
    await chrome.storage.local.set({ [STORAGE_KEYS.USAGE_CACHE]: updated })
    return updated
  }

  private static async getDeviceId(): Promise<string> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.DEVICE_ID)
    return result[STORAGE_KEYS.DEVICE_ID] ?? ''
  }
}
