import { API_BASE, WORKERS_BASE, STORAGE_KEYS, FREE_DAILY_LIMIT } from './js/config.js'
import { openCheckout } from './js/subscription.js'

// installId가 없으면 재생성 (storage 초기화 대응)
async function ensureInstallId() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.INSTALL_ID)
  if (data[STORAGE_KEYS.INSTALL_ID]) return data[STORAGE_KEYS.INSTALL_ID]
  const newId = crypto.randomUUID()
  await chrome.storage.local.set({
    [STORAGE_KEYS.INSTALL_ID]: newId,
    [STORAGE_KEYS.PREMIUM]: false,
    [STORAGE_KEYS.PLAN_TYPE]: null,
    [STORAGE_KEYS.EXPIRES_AT]: null,
    [STORAGE_KEYS.SUB_STATUS]: null
  })
  return newId
}

const DEFAULT_USAGE = {
  count: 0,
  limit: FREE_DAILY_LIMIT,
  isPro: false,
  remaining: FREE_DAILY_LIMIT
}

// === onInstalled ===
chrome.runtime.onInstalled.addListener(async () => {
  await ensureInstallId()
  chrome.alarms.create('check-premium', { periodInMinutes: 30 })
  await checkSubscriptionStatus(true)
})

// === onStartup ===
chrome.runtime.onStartup.addListener(async () => {
  await checkSubscriptionStatus(true)
})

// === onAlarm ===
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'check-premium') checkSubscriptionStatus(true)
})

// === 메시지 핸들러 ===
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'check-status') {
    checkSubscriptionStatus(true).then(async () => {
      const keys = [
        STORAGE_KEYS.PREMIUM,
        STORAGE_KEYS.PLAN_TYPE,
        STORAGE_KEYS.EXPIRES_AT,
        STORAGE_KEYS.SUB_STATUS
      ]
      const data = await chrome.storage.local.get(keys)
      sendResponse({
        premium: data[STORAGE_KEYS.PREMIUM],
        planType: data[STORAGE_KEYS.PLAN_TYPE],
        expiresAt: data[STORAGE_KEYS.EXPIRES_AT],
        status: data[STORAGE_KEYS.SUB_STATUS]
      })
    })
    return true
  }

  if (msg.type === 'ANALYZE_PLACE') {
    handleAnalyze(msg, sendResponse)
    return true
  }

  if (msg.type === 'GET_USAGE') {
    handleGetUsage(sendResponse, msg.refresh, msg.migrate)
    return true
  }

  if (msg.type === 'GET_HISTORY') {
    handleGetHistory(sendResponse)
    return true
  }

  if (msg.type === 'GET_HISTORY_DETAIL') {
    handleGetHistoryDetail(msg.id, sendResponse)
    return true
  }

  if (msg.type === 'COMPARE_PLACES') {
    handleComparePlaces(msg.ids, sendResponse)
    return true
  }

  if (msg.type === 'OPEN_CHECKOUT') {
    openCheckout(msg.plan || 'monthly').catch((err) => {
      console.error('[OPEN_CHECKOUT failed]', err)
    })
    return false
  }
})

// === 구독 상태 체크 (5분 TTL 캐시) ===
let lastCheckTime = 0
const CHECK_CACHE_TTL = 5 * 60 * 1000

async function checkSubscriptionStatus(force = false) {
  const now = Date.now()
  if (!force && now - lastCheckTime < CHECK_CACHE_TTL) return
  lastCheckTime = now

  try {
    const installId = await ensureInstallId()

    const res = await fetch(`${API_BASE}/api/status?id=${installId}`)
    if (!res.ok) throw new Error('API error')

    const { premium, planType, expiresAt, status } = await res.json()
    await chrome.storage.local.set({
      [STORAGE_KEYS.PREMIUM]: premium,
      [STORAGE_KEYS.PLAN_TYPE]: planType,
      [STORAGE_KEYS.EXPIRES_AT]: expiresAt,
      [STORAGE_KEYS.SUB_STATUS]: status,
      [STORAGE_KEYS.SYNC_FAILED]: false
    })
  } catch {
    await chrome.storage.local.set({ [STORAGE_KEYS.SYNC_FAILED]: true })
  }
}

// === 분석 핸들러 ===
async function handleAnalyze(request, sendResponse) {
  try {
    const installId = await ensureInstallId()

    const res = await fetch(`${WORKERS_BASE}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-ID': installId },
      body: JSON.stringify({
        reviews: request.reviews,
        placeInfo: request.placeInfo,
        site: request.site,
        lang: request.lang || 'en'
      })
    })

    const result = await res.json()
    const response = res.ok
      ? { success: true, data: result.data }
      : {
          success: false,
          error: result.error || `Server error ${res.status}`,
          exceeded: result.exceeded || false
        }

    // storage에 저장 (페이지 새로고침 후 참조용)
    const storedResult = { ...response, placeInfo: request.placeInfo, timestamp: Date.now() }
    await chrome.storage.local.set({ [STORAGE_KEYS.LAST_ANALYSIS]: storedResult })

    // 분석 후 사용량 캐시 갱신 (popup에서 즉시 반영)
    try {
      const usageRes = await fetch(`${WORKERS_BASE}/usage`, { headers: { 'X-Device-ID': installId } })
      if (usageRes.ok) {
        const usageData = await usageRes.json()
        await chrome.storage.local.set({ [STORAGE_KEYS.USAGE_CACHE]: usageData.data })
      }
    } catch { /* 사용량 갱신 실패해도 무시 */ }

    sendResponse(response)
  } catch (error) {
    sendResponse({ success: false, error: error.message || 'Unknown error' })
  }
}

// === 히스토리 핸들러 ===
async function handleGetHistory(sendResponse) {
  try {
    const installId = await ensureInstallId()
    const res = await fetch(`${WORKERS_BASE}/history`, {
      headers: { 'X-Device-ID': installId }
    })
    const result = await res.json()
    sendResponse(res.ok ? result : { success: false, error: result.error || 'Failed to fetch history' })
  } catch (err) {
    console.error('[GET_HISTORY failed]', err)
    sendResponse({ success: false, error: 'Network error' })
  }
}

async function handleGetHistoryDetail(id, sendResponse) {
  try {
    const installId = await ensureInstallId()
    const res = await fetch(`${WORKERS_BASE}/history?id=${encodeURIComponent(id)}`, {
      headers: { 'X-Device-ID': installId }
    })
    const result = await res.json()
    sendResponse(res.ok ? result : { success: false, error: result.error || 'Not found' })
  } catch (err) {
    console.error('[GET_HISTORY_DETAIL failed]', err)
    sendResponse({ success: false, error: 'Network error' })
  }
}

// === 비교 핸들러 ===
async function handleComparePlaces(ids, sendResponse) {
  try {
    const installId = await ensureInstallId()
    const res = await fetch(`${WORKERS_BASE}/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-ID': installId },
      body: JSON.stringify({ ids })
    })
    const result = await res.json()
    sendResponse(res.ok ? result : { success: false, error: result.error || 'Compare failed' })
  } catch (err) {
    console.error('[COMPARE_PLACES failed]', err)
    sendResponse({ success: false, error: 'Network error' })
  }
}

// === 사용량 핸들러 ===
async function handleGetUsage(sendResponse, refresh = false, migrate = null) {
  try {
    const installId = await ensureInstallId()
    const params = new URLSearchParams()
    if (refresh) params.set('refresh', 'true')
    if (migrate) params.set('migrate', migrate)
    const qs = params.toString()
    const url = qs ? `${WORKERS_BASE}/usage?${qs}` : `${WORKERS_BASE}/usage`
    const res = await fetch(url, { headers: { 'X-Device-ID': installId } })

    if (res.ok) {
      const result = await res.json()
      await chrome.storage.local.set({ [STORAGE_KEYS.USAGE_CACHE]: result.data })
      sendResponse({ success: true, data: result.data })
    } else {
      const cached = await chrome.storage.local.get(STORAGE_KEYS.USAGE_CACHE)
      sendResponse({
        success: true,
        data: cached[STORAGE_KEYS.USAGE_CACHE] || DEFAULT_USAGE
      })
    }
  } catch {
    const cached = await chrome.storage.local.get(STORAGE_KEYS.USAGE_CACHE)
    sendResponse({
      success: true,
      data: cached[STORAGE_KEYS.USAGE_CACHE] || DEFAULT_USAGE
    })
  }
}
