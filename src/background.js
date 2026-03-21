import { API_BASE, WORKERS_BASE, STORAGE_KEYS, FREE_DAILY_LIMIT } from './js/config.js'

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
    checkSubscriptionStatus().then(async () => {
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
    handleGetUsage(sendResponse)
    return true
  }

  if (msg.type === 'OPEN_SIDE_PANEL') {
    if (sender.tab?.id) {
      chrome.sidePanel.open({ tabId: sender.tab.id }).catch((err) => {
        console.error('[SidePanel open failed]', err)
      })
    }
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
    // 이전 결과 초기화 + SidePanel에 로딩 상태 전송
    await chrome.storage.local.remove(STORAGE_KEYS.LAST_ANALYSIS)
    chrome.runtime.sendMessage({ type: 'ANALYSIS_LOADING' }).catch(() => {})

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

    const storedResult = { ...response, placeInfo: request.placeInfo, timestamp: Date.now() }
    await chrome.storage.local.set({ [STORAGE_KEYS.LAST_ANALYSIS]: storedResult })

    // SidePanel에 실시간 메시지 전송 (열려있으면 즉시 반영)
    chrome.runtime.sendMessage({ type: 'ANALYSIS_RESULT', data: storedResult }).catch(() => {})

    sendResponse(response)
  } catch (error) {
    sendResponse({ success: false, error: error.message || 'Unknown error' })
  }
}

// === 사용량 핸들러 ===
async function handleGetUsage(sendResponse) {
  try {
    const installId = await ensureInstallId()

    const res = await fetch(`${WORKERS_BASE}/usage`, { headers: { 'X-Device-ID': installId } })

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
