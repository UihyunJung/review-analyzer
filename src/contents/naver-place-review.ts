import { extractNaverPlaceReviews } from '../lib/scrapers/naver-place'
import { getDefaultLanguage, setLanguage, t } from '../js/i18n.js'
import { STORAGE_KEYS } from '../js/config.js'
import { showLoading, showResult, showError, toggleModal } from './modal'

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
    bottom: '24px',
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
    const { reviews, placeInfo } = await extractNaverPlaceReviews(document, window.location.href)

    if (reviews.length === 0) {
      loading = false
      btn.textContent = t('noReviews')
      btn.style.background = '#e53935'
      showError(t('noReviews'))
      setTimeout(() => resetButton(btn), 3000)
      return
    }

    chrome.runtime.sendMessage(
      { type: 'ANALYZE_PLACE', reviews, placeInfo, site: 'naver_place', lang: currentLang },
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

const btnContainer = createButtonContainer()
const analyzeBtn = createAnalyzeButton()
const toggleBtn = createToggleButton()

btnContainer.appendChild(analyzeBtn)
btnContainer.appendChild(toggleBtn)

analyzeBtn.addEventListener('click', () => handleAnalyzeClick(analyzeBtn))
toggleBtn.addEventListener('click', () => toggleModal())

document.body.appendChild(btnContainer)

// --- 언어 변경 실시간 반영 ---
chrome.storage.onChanged.addListener((changes) => {
  if (changes[STORAGE_KEYS.LANGUAGE]) {
    currentLang = changes[STORAGE_KEYS.LANGUAGE].newValue || getDefaultLanguage()
    setLanguage(currentLang)
    if (!loading) analyzeBtn.textContent = '\u2605 ' + t('analyzeButton')
    toggleBtn.title = t('togglePanel') || 'Show/hide analysis'
  }
})
