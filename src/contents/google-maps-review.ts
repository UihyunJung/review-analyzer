import { extractGoogleMapsReviews } from '../lib/scrapers/google-maps'
import { getDefaultLanguage, setLanguage, t } from '../js/i18n.js'
import { showLoading, showResult, showError, hideModal, hasResult, toggleModal, clearResult } from './modal'

setLanguage(getDefaultLanguage())

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

async function handleAnalyzeClick(btn: HTMLButtonElement) {
  if (loading) return
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

    chrome.runtime.sendMessage(
      { type: 'ANALYZE_PLACE', reviews, placeInfo, site: 'google_maps', lang: getDefaultLanguage() },
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
          btn.textContent = t('upgradeButton')
          btn.style.background = '#ff9800'
          showError(t('limitReached'))
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
const observer = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href
    updateButtonVisibility()
  }
})
observer.observe(document.body, { childList: true, subtree: true })
