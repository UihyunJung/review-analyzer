import { extractNaverPlaceReviews } from '../lib/scrapers/naver-place'
import { getDefaultLanguage, setLanguage, t } from '../js/i18n.js'
import { showLoading, showResult, showError, hideModal, hasResult, toggleModal, clearResult } from './modal'

setLanguage(getDefaultLanguage())

function createAnalyzeButton(): HTMLButtonElement {
  const btn = document.createElement('button')
  Object.assign(btn.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    padding: '12px 24px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    zIndex: '10000',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    transition: 'all 0.2s ease'
  })
  btn.textContent = '\u2605 ' + t('analyzeButton')
  return btn
}

function createToggleButton(): HTMLButtonElement {
  const btn = document.createElement('button')
  Object.assign(btn.style, {
    position: 'fixed',
    bottom: '24px',
    right: '210px',
    padding: '12px 14px',
    background: '#43a047',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '600',
    zIndex: '10000',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    transition: 'all 0.2s ease',
    display: 'none'
  })
  btn.textContent = '\uD83D\uDCCA'
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
      { type: 'ANALYZE_PLACE', reviews, placeInfo, site: 'naver_place', lang: getDefaultLanguage() },
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

const analyzeBtn = createAnalyzeButton()
const toggleBtn = createToggleButton()

analyzeBtn.addEventListener('click', () => handleAnalyzeClick(analyzeBtn))
toggleBtn.addEventListener('click', () => toggleModal())

document.body.appendChild(analyzeBtn)
document.body.appendChild(toggleBtn)
