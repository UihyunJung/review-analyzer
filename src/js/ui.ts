import { getDefaultLanguage, setLanguage, t, applyI18n } from './i18n.js'
import { STORAGE_KEYS } from './config.js'
import { checkPremium, openCheckout, restorePurchase, refreshStatus } from './subscription.js'

let isPremium = false
let planType: string | null = null
let expiresAt: string | null = null
let subStatus: string | null = null

const el = (id: string) => document.getElementById(id)!

function updatePremiumUI() {
  const badge = el('status-badge')
  const upgradePanel = el('upgrade-panel')
  const proPanel = el('pro-panel')
  const proPanelText = el('pro-panel-text')

  if (isPremium) {
    let label = t('pro')
    if (planType === 'month') label = t('monthlyLabel')
    else if (planType === 'year') label = t('annualLabel')

    let badgeText = '\u2713 ' + label
    let dateStr = ''
    if (expiresAt) {
      const d = new Date(expiresAt)
      if (!isNaN(d.getTime())) {
        dateStr = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
        const suffix = subStatus === 'canceled' ? t('expires') : t('renews')
        badgeText += ` \u00B7 ${dateStr} ${suffix}`
      }
    }

    badge.textContent = badgeText
    badge.className = 'status-badge status-pro'
    upgradePanel.style.display = 'none'
    proPanel.style.display = 'none'

    if (subStatus === 'canceled' && dateStr) {
      proPanelText.textContent = t('canceledNotice').replace('{date}', dateStr)
    } else {
      proPanelText.textContent = t('autoRenewNotice')
    }
  } else {
    badge.textContent = t('free')
    badge.className = 'status-badge status-free'
    upgradePanel.style.display = 'none'
    proPanel.style.display = 'none'
  }
}

function updateUsageUI(usage: { count: number; limit: number; remaining: number }) {
  const section = el('usage-section')
  const countEl = el('usage-count')
  const fillEl = el('usage-fill')
  const remainingEl = el('usage-remaining')
  const upsellEl = el('usage-upsell')

  const exceeded = usage.remaining <= 0 && !isPremium
  const displayCount = Math.min(usage.count, usage.limit)
  countEl.textContent = `${displayCount} / ${usage.limit}`
  countEl.style.color = ''
  fillEl.style.width = `${Math.min((usage.count / usage.limit) * 100, 100)}%`
  fillEl.className = exceeded ? 'usage-fill exceeded' : 'usage-fill'
  section.className = exceeded ? 'usage-section exceeded' : 'usage-section'
  remainingEl.textContent = exceeded ? t('limitReached') : `${usage.remaining} ${t('remaining')}`
  remainingEl.style.color = ''

  if (exceeded) {
    upsellEl.textContent = t('upsellMessage')
    upsellEl.style.display = 'block'
    upsellEl.onclick = () => { el('upgrade-panel').style.display = 'block' }
  } else {
    upsellEl.style.display = 'none'
  }
}

async function init() {
  // 저장된 언어 복원 또는 브라우저 기본 언어
  const langData = await chrome.storage.local.get(STORAGE_KEYS.LANGUAGE)
  const lang = langData[STORAGE_KEYS.LANGUAGE] || getDefaultLanguage()
  setLanguage(lang)
  const langSelect = el('lang-select') as HTMLSelectElement
  langSelect.value = lang
  applyI18n()

  isPremium = await checkPremium()
  const subData = await chrome.storage.local.get([
    STORAGE_KEYS.PLAN_TYPE,
    STORAGE_KEYS.EXPIRES_AT,
    STORAGE_KEYS.SUB_STATUS,
    STORAGE_KEYS.SYNC_FAILED
  ])
  planType = subData[STORAGE_KEYS.PLAN_TYPE] || null
  expiresAt = subData[STORAGE_KEYS.EXPIRES_AT] || null
  subStatus = subData[STORAGE_KEYS.SUB_STATUS] || null

  updatePremiumUI()

  // 사용량 로드
  chrome.runtime.sendMessage({ type: 'GET_USAGE' }, (response) => {
    if (response?.success && response.data) updateUsageUI(response.data)
  })

  // 즉시 상태 갱신
  refreshStatus().then((result) => {
    if (result.premium !== isPremium || result.planType !== planType) {
      isPremium = result.premium
      planType = result.planType
      expiresAt = result.expiresAt
      subStatus = result.status
      updatePremiumUI()
      chrome.runtime.sendMessage({ type: 'GET_USAGE', refresh: true }, (response) => {
        if (response?.success && response.data) updateUsageUI(response.data)
      })
    }
  })

  // 동기화 실패 알림
  el('sync-notice').style.display = subData[STORAGE_KEYS.SYNC_FAILED] ? 'block' : 'none'

  bindEvents()
}

function bindEvents() {
  // 언어 선택
  el('lang-select').addEventListener('change', (e) => {
    const lang = (e.target as HTMLSelectElement).value
    setLanguage(lang)
    applyI18n()
    updatePremiumUI()
    showMessage('', '')
    chrome.storage.local.set({ [STORAGE_KEYS.LANGUAGE]: lang })
    // applyI18n이 사용량 텍스트를 "로딩중.."으로 덮어쓰므로 재요청
    chrome.runtime.sendMessage({ type: 'GET_USAGE' }, (response) => {
      if (response?.success && response.data) updateUsageUI(response.data)
    })
  })

  el('btn-monthly').addEventListener('click', () => handleCheckout('monthly'))
  el('btn-annual').addEventListener('click', () => handleCheckout('annual'))

  // 배지 클릭 → 패널 토글
  el('status-badge').addEventListener('click', () => {
    if (isPremium) {
      const panel = el('pro-panel')
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none'
    } else {
      const panel = el('upgrade-panel')
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none'
    }
  })

  el('btn-verify').addEventListener('click', async () => {
    const btn = el('btn-verify')
    // verify 클릭 시 restore 섹션 닫기
    el('restore-section').style.display = 'none'
    showMessage('', '')
    btn.textContent = t('verifying')
    try {
      const result = await refreshStatus()
      isPremium = result.premium
      planType = result.planType
      expiresAt = result.expiresAt
      subStatus = result.status
      updatePremiumUI()
      // 사용량도 갱신 (Pro 한도 반영, 캐시 무시)
      chrome.runtime.sendMessage({ type: 'GET_USAGE', refresh: true }, (response) => {
        if (response?.success && response.data) updateUsageUI(response.data)
      })
      // 메시지 표시 (패널이 닫혔을 수 있으므로 다시 열기)
      if (!result.premium) {
        el('upgrade-panel').style.display = 'block'
      }
      showMessage(
        result.premium ? t('restoreSuccess') : t('verifyNotFound'),
        result.premium ? 'success' : 'error'
      )
    } catch {
      showMessage(t('networkError'), 'error')
    }
    btn.textContent = t('verifyPurchase')
  })

  el('btn-restore-link').addEventListener('click', () => {
    showMessage('', '')
    el('restore-section').style.display = 'flex'
    ;(el('restore-email') as HTMLInputElement).focus()
  })

  el('btn-restore-cancel').addEventListener('click', () => {
    el('restore-section').style.display = 'none'
    showMessage('', '')
  })

  el('btn-restore-confirm').addEventListener('click', async () => {
    const email = (el('restore-email') as HTMLInputElement).value.trim()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showMessage(t('invalidEmail'), 'error')
      return
    }

    const btn = el('btn-restore-confirm') as HTMLButtonElement
    btn.disabled = true
    showMessage(t('verifying'), '')

    try {
      const result = await restorePurchase(email)
      if (result.restored) {
        isPremium = true
        updatePremiumUI()
        // 사용량도 갱신 (Pro 한도 반영, 캐시 무시 + 이전 사용량 이관)
        chrome.runtime.sendMessage({ type: 'GET_USAGE', refresh: true, migrate: result.previousInstallId || null }, (response) => {
          if (response?.success && response.data) updateUsageUI(response.data)
        })
        showMessage(t('restoreSuccess'), 'success')
      } else {
        const msg = result.reason === 'cooldown' ? t('cooldownMessage') : t('restoreFail')
        showMessage(msg, 'error')
      }
    } catch {
      showMessage(t('networkError'), 'error')
    }
    btn.disabled = false
  })

  // storage 변경 리스너
  chrome.storage.onChanged.addListener((changes) => {
    if (changes[STORAGE_KEYS.PREMIUM]) isPremium = changes[STORAGE_KEYS.PREMIUM].newValue === true
    if (changes[STORAGE_KEYS.PLAN_TYPE]) planType = changes[STORAGE_KEYS.PLAN_TYPE].newValue || null
    if (changes[STORAGE_KEYS.EXPIRES_AT])
      expiresAt = changes[STORAGE_KEYS.EXPIRES_AT].newValue || null
    if (changes[STORAGE_KEYS.SUB_STATUS])
      subStatus = changes[STORAGE_KEYS.SUB_STATUS].newValue || null

    if (
      changes[STORAGE_KEYS.PREMIUM] ||
      changes[STORAGE_KEYS.PLAN_TYPE] ||
      changes[STORAGE_KEYS.EXPIRES_AT] ||
      changes[STORAGE_KEYS.SUB_STATUS]
    ) {
      updatePremiumUI()
      chrome.runtime.sendMessage({ type: 'GET_USAGE', refresh: true }, (response) => {
        if (response?.success && response.data) updateUsageUI(response.data)
      })
    }
    if (changes[STORAGE_KEYS.SYNC_FAILED]) {
      el('sync-notice').style.display = changes[STORAGE_KEYS.SYNC_FAILED].newValue
        ? 'block'
        : 'none'
    }
  })
}

async function handleCheckout(plan: string) {
  try {
    await openCheckout(plan)
  } catch {
    showMessage(t('checkoutError'), 'error')
  }
}

function showMessage(text: string, type: string) {
  const msgEl = el('upgrade-message')
  msgEl.textContent = text
  msgEl.className = `upgrade-message ${type}`
}

init()
