import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FREE_DAILY_LIMIT } from '../../src/lib/constants'

// chrome.storage.local mock
const mockStorage: Record<string, unknown> = {}

const chromeStorageMock = {
  get: vi.fn((keys: string | string[]) => {
    const result: Record<string, unknown> = {}
    const keyList = typeof keys === 'string' ? [keys] : keys
    for (const key of keyList) {
      if (mockStorage[key] !== undefined) result[key] = mockStorage[key]
    }
    return Promise.resolve(result)
  }),
  set: vi.fn((items: Record<string, unknown>) => {
    Object.assign(mockStorage, items)
    return Promise.resolve()
  })
}

// chrome API mock 설정
vi.stubGlobal('chrome', {
  storage: { local: chromeStorageMock }
})

// fetch mock
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// constants mock
vi.mock('../../src/lib/constants', () => ({
  EDGE_FUNCTION_URL: 'https://test-api.workers.dev',
  FREE_DAILY_LIMIT: 5,
  STORAGE_KEYS: {
    DEVICE_ID: 'place_review_device_id',
    LAST_ANALYSIS: 'place_review_last_analysis',
    USAGE_CACHE: 'place_review_usage_cache'
  }
}))

import { UsageTracker } from '../../src/lib/storage/usage'

describe('UsageTracker', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key])
    vi.clearAllMocks()
  })

  describe('getUsage', () => {
    it('returns default usage when cache is empty', async () => {
      const usage = await UsageTracker.getUsage()
      expect(usage.count).toBe(0)
      expect(usage.limit).toBe(FREE_DAILY_LIMIT)
      expect(usage.isPro).toBe(false)
      expect(usage.remaining).toBe(FREE_DAILY_LIMIT)
    })

    it('returns cached usage', async () => {
      mockStorage['place_review_usage_cache'] = {
        count: 3,
        limit: 5,
        isPro: false,
        remaining: 2
      }
      const usage = await UsageTracker.getUsage()
      expect(usage.count).toBe(3)
      expect(usage.remaining).toBe(2)
    })
  })

  describe('getRemainingToday', () => {
    it('returns full limit when no usage', async () => {
      const remaining = await UsageTracker.getRemainingToday()
      expect(remaining).toBe(FREE_DAILY_LIMIT)
    })

    it('returns 0 when limit exceeded', async () => {
      mockStorage['place_review_usage_cache'] = {
        count: 5,
        limit: 5,
        isPro: false,
        remaining: 0
      }
      const remaining = await UsageTracker.getRemainingToday()
      expect(remaining).toBe(0)
    })
  })

  describe('canAnalyze', () => {
    it('returns true when under limit', async () => {
      mockStorage['place_review_usage_cache'] = {
        count: 3,
        limit: 5,
        isPro: false,
        remaining: 2
      }
      expect(await UsageTracker.canAnalyze()).toBe(true)
    })

    it('returns false when at limit', async () => {
      mockStorage['place_review_usage_cache'] = {
        count: 5,
        limit: 5,
        isPro: false,
        remaining: 0
      }
      expect(await UsageTracker.canAnalyze()).toBe(false)
    })

    it('returns true for Pro users regardless of count', async () => {
      mockStorage['place_review_usage_cache'] = {
        count: 100,
        limit: 5,
        isPro: true,
        remaining: 0
      }
      expect(await UsageTracker.canAnalyze()).toBe(true)
    })
  })

  describe('incrementLocal', () => {
    it('increments count and decrements remaining', async () => {
      mockStorage['place_review_usage_cache'] = {
        count: 2,
        limit: 5,
        isPro: false,
        remaining: 3
      }
      const updated = await UsageTracker.incrementLocal()
      expect(updated.count).toBe(3)
      expect(updated.remaining).toBe(2)
    })

    it('does not go below 0 remaining', async () => {
      mockStorage['place_review_usage_cache'] = {
        count: 5,
        limit: 5,
        isPro: false,
        remaining: 0
      }
      const updated = await UsageTracker.incrementLocal()
      expect(updated.count).toBe(6)
      expect(updated.remaining).toBe(0)
    })
  })

  describe('syncFromServer', () => {
    it('returns cached data when no device_id', async () => {
      mockStorage['place_review_usage_cache'] = {
        count: 2,
        limit: 5,
        isPro: false,
        remaining: 3
      }
      const usage = await UsageTracker.syncFromServer()
      expect(usage.count).toBe(2)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('fetches from server when device_id exists', async () => {
      mockStorage['place_review_device_id'] = '00000000-0000-0000-0000-000000000000'
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: { count: 4, limit: 5, isPro: false, remaining: 1 }
          })
      })

      const usage = await UsageTracker.syncFromServer()
      expect(usage.count).toBe(4)
      expect(usage.remaining).toBe(1)
      expect(fetchMock).toHaveBeenCalledOnce()
    })

    it('falls back to cache on network error', async () => {
      mockStorage['place_review_device_id'] = '00000000-0000-0000-0000-000000000000'
      mockStorage['place_review_usage_cache'] = {
        count: 2,
        limit: 5,
        isPro: false,
        remaining: 3
      }
      fetchMock.mockRejectedValueOnce(new Error('Network error'))

      const usage = await UsageTracker.syncFromServer()
      expect(usage.count).toBe(2) // fallback to cache
    })
  })
})
