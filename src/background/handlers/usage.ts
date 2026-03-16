import { EDGE_FUNCTION_URL, FREE_DAILY_LIMIT, STORAGE_KEYS } from '~lib/constants'
import { getAccessToken } from '~lib/api/supabase'
import type { UsageData } from '~lib/types'

const DEFAULT_USAGE: UsageData = {
  count: 0,
  limit: FREE_DAILY_LIMIT,
  isPro: false,
  remaining: FREE_DAILY_LIMIT
}

async function getDeviceId(): Promise<string> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.DEVICE_ID)
  return result[STORAGE_KEYS.DEVICE_ID] ?? ''
}

async function getCachedUsage(): Promise<UsageData> {
  const cached = await chrome.storage.local.get(STORAGE_KEYS.USAGE_CACHE)
  return (cached[STORAGE_KEYS.USAGE_CACHE] as UsageData) ?? { ...DEFAULT_USAGE }
}

/** JWT 있으면 Authorization, 없으면 X-Device-ID */
async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const token = await getAccessToken()
    if (token) return { Authorization: `Bearer ${token}` }
  } catch {
    // fallback
  }
  const deviceId = await getDeviceId()
  if (deviceId) return { 'X-Device-ID': deviceId }
  return {}
}

export async function handleGetUsage(
  sendResponse: (response: { success: boolean; data?: UsageData; error?: string }) => void
) {
  try {
    const authHeaders = await getAuthHeaders()
    const hasAuth = Object.keys(authHeaders).length > 0

    if (!hasAuth || !EDGE_FUNCTION_URL) {
      sendResponse({ success: true, data: await getCachedUsage() })
      return
    }

    const res = await fetch(`${EDGE_FUNCTION_URL}/usage`, { headers: authHeaders })

    if (res.ok) {
      const result = await res.json()
      const usage = result.data as UsageData
      await chrome.storage.local.set({ [STORAGE_KEYS.USAGE_CACHE]: usage })
      sendResponse({ success: true, data: usage })
    } else {
      sendResponse({ success: true, data: await getCachedUsage() })
    }
  } catch {
    sendResponse({ success: true, data: await getCachedUsage() })
  }
}
