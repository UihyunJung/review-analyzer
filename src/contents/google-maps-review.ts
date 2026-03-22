import { extractGoogleMapsReviews } from '../lib/scrapers/google-maps'
import { getDefaultLanguage, setLanguage, t } from '../js/i18n.js'
import { STORAGE_KEYS } from '../js/config.js'
import { showLoading, setLoadingStage, showResult, showError, showExceeded, hideModal, hasResult, toggleModal, clearResult } from './modal'

// 저장된 언어 복원 (비동기)
let currentLang = getDefaultLanguage()
setLanguage(currentLang)

chrome.storage.local.get(STORAGE_KEYS.LANGUAGE).then((data) => {
  if (data[STORAGE_KEYS.LANGUAGE]) {
    currentLang = data[STORAGE_KEYS.LANGUAGE]
    setLanguage(currentLang)
    if (analyzeBtn) analyzeBtn.textContent = '\u2605 ' + t('analyzeButton')
    if (toggleBtn) toggleBtn.title = t('togglePanel') || 'Show/hide analysis'
  }
})

function createButtonContainer(): HTMLDivElement {
  const container = document.createElement('div')
  Object.assign(container.style, {
    position: 'fixed',
    bottom: '160px',
    right: '24px',
    display: 'flex',
    gap: '8px',
    zIndex: '10000'
  })
  return container
}

function createAnalyzeButton(): HTMLButtonElement {
  const btn = document.createElement('button')
  Object.assign(btn.style, {
    padding: '12px 24px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    transition: 'all 0.2s ease'
  })
  btn.textContent = '\u2605 ' + t('analyzeButton')
  return btn
}

function createToggleButton(): HTMLButtonElement {
  const btn = document.createElement('button')
  Object.assign(btn.style, {
    padding: '12px 14px',
    background: '#43a047',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    transition: 'all 0.2s ease',
    display: 'none'
  })
  btn.textContent = '\u2630'
  btn.title = t('togglePanel') || 'Show/hide analysis'
  return btn
}

let loading = false
let exceeded = false

async function handleAnalyzeClick(btn: HTMLButtonElement) {
  if (loading) return
  if (exceeded) {
    showExceeded()
    return
  }

  // 분석 전 사용량 확인
  const usageCheck = await new Promise<{ success?: boolean; data?: { remaining: number } }>((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_USAGE' }, resolve)
  })
  if (usageCheck?.success && usageCheck.data?.remaining <= 0) {
    exceeded = true
    btn.textContent = t('upgradeButton')
    btn.style.background = '#ff9800'
    showExceeded()
    return
  }

  loading = true
  btn.textContent = t('analyzingButton')
  btn.style.opacity = '0.8'

  showLoading()

  try {
    const { reviews, placeInfo } = await extractGoogleMapsReviews(document, window.location.href)

    if (reviews.length === 0) {
      loading = false
      btn.textContent = t('noReviews')
      btn.style.background = '#e53935'
      showError(t('noReviews'))
      setTimeout(() => resetButton(btn), 3000)
      return
    }

    setLoadingStage('analyzing')

    chrome.runtime.sendMessage(
      { type: 'ANALYZE_PLACE', reviews, placeInfo, site: 'google_maps', lang: currentLang },
      (response) => {
        loading = false
        if (response?.success) {
          btn.textContent = '\u2713 ' + t('doneButton')
          btn.style.background = '#43a047'
          const isPro = response.data?.isPro || false
          showResult(response.data, placeInfo, isPro)
          toggleBtn.style.display = ''
          setTimeout(() => resetButton(btn), 3000)
        } else if (response?.exceeded) {
          exceeded = true
          btn.textContent = t('upgradeButton')
          btn.style.background = '#ff9800'
          showExceeded()
        } else {
          btn.textContent = t('analysisFailed')
          btn.style.background = '#e53935'
          showError(t('analysisFailed'))
          setTimeout(() => resetButton(btn), 5000)
        }
      }
    )
  } catch {
    loading = false
    btn.textContent = t('analysisFailed')
    btn.style.background = '#e53935'
    showError(t('analysisFailed'))
    setTimeout(() => resetButton(btn), 5000)
  }
}

function resetButton(btn: HTMLButtonElement) {
  loading = false
  btn.textContent = '\u2605 ' + t('analyzeButton')
  btn.style.background = '#667eea'
  btn.style.opacity = '1'
}

// --- 버튼 생성 ---
const btnContainer = createButtonContainer()
const analyzeBtn = createAnalyzeButton()
const toggleBtn = createToggleButton()

btnContainer.appendChild(analyzeBtn)
btnContainer.appendChild(toggleBtn)

analyzeBtn.addEventListener('click', () => handleAnalyzeClick(analyzeBtn))
toggleBtn.addEventListener('click', () => toggleModal())

// --- SPA URL 변화 감시 ---
let currentPlaceUrl = ''

function updateButtonVisibility() {
  const isPlacePage = window.location.pathname.includes('/place/')
  // 장소 이름 부분만 추출 (쿼리/데이터 파라미터 무시)
  const placeSegment = window.location.pathname.match(/\/place\/([^/]+)/)?.[1] || ''

  if (isPlacePage) {
    if (!btnContainer.parentElement) document.body.appendChild(btnContainer)
    btnContainer.style.display = 'flex'

    // 다른 장소로 전환했을 때만 초기화 (같은 장소의 URL 파라미터 변경은 무시)
    if (placeSegment !== currentPlaceUrl && !loading) {
      currentPlaceUrl = placeSegment
      resetButton(analyzeBtn)
      hideModal()
      clearResult()
      toggleBtn.style.display = 'none'
    }
  } else {
    btnContainer.style.display = 'none'
    hideModal()
  }
}

updateButtonVisibility()

let lastUrl = location.href
let debounceTimer: ReturnType<typeof setTimeout> | null = null
const observer = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(updateButtonVisibility, 100)
  }
})
observer.observe(document.body, { childList: true, subtree: true })

// --- 언어 변경 실시간 반영 ---
chrome.storage.onChanged.addListener((changes) => {
  if (changes[STORAGE_KEYS.LANGUAGE]) {
    currentLang = changes[STORAGE_KEYS.LANGUAGE].newValue || getDefaultLanguage()
    setLanguage(currentLang)
    if (!loading) analyzeBtn.textContent = '\u2605 ' + t('analyzeButton')
    toggleBtn.title = t('togglePanel') || 'Show/hide analysis'
  }
})
