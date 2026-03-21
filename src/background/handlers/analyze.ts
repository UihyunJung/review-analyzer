import { EDGE_FUNCTION_URL, STORAGE_KEYS } from '~lib/constants'
import { getAccessToken } from '~lib/api/supabase'
import type { AnalyzeRequest, AnalyzeResponse } from '~lib/types'

async function getDeviceId(): Promise<string> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.DEVICE_ID)
  if (result[STORAGE_KEYS.DEVICE_ID]) {
    return result[STORAGE_KEYS.DEVICE_ID]
  }
  const newId = crypto.randomUUID()
  await chrome.storage.local.set({ [STORAGE_KEYS.DEVICE_ID]: newId })
  return newId
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const token = await getAccessToken()
    if (token) return { Authorization: `Bearer ${token}` }
  } catch {
    // fallback
  }
  const deviceId = await getDeviceId()
  return { 'X-Device-ID': deviceId }
}

export async function handleAnalyzePlace(
  request: AnalyzeRequest,
  sendResponse: (response: AnalyzeResponse) => void
) {
  try {
    const authHeaders = await getAuthHeaders()

    // 항상 /analyze로 전송. 서버가 Pro 여부를 DB에서 판단하여 Pro 분석 결과 포함.
    const res = await fetch(`${EDGE_FUNCTION_URL}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({
        reviews: request.reviews,
        placeInfo: request.placeInfo,
        site: request.site
      })
    })

    const data = await res.json()

    const response: AnalyzeResponse = res.ok
      ? { success: true, data: data.data }
      : {
          success: false,
          error: data.error ?? `Server error ${res.status}`,
          exceeded: data.exceeded ?? false
        }

    await chrome.storage.local.set({
      [STORAGE_KEYS.LAST_ANALYSIS]: {
        ...response,
        placeInfo: request.placeInfo,
        timestamp: Date.now()
      }
    })

    sendResponse(response)
  } catch (error) {
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}
