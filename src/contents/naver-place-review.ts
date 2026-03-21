import { extractNaverPlaceReviews } from '../lib/scrapers/naver-place'
import { getDefaultLanguage, setLanguage, t } from '../js/i18n.js'

setLanguage(getDefaultLanguage())

function createButton(): HTMLButtonElement {
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

let loading = false

async function handleClick(btn: HTMLButtonElement) {
  if (loading) return
  loading = true
  btn.textContent = t('analyzingButton')
  btn.style.opacity = '0.8'

  try {
    const { reviews, placeInfo } = await extractNaverPlaceReviews(document, window.location.href)

    if (reviews.length === 0) {
      loading = false
      btn.textContent = t('noReviews')
      btn.style.background = '#e53935'
      setTimeout(() => resetButton(btn), 3000)
      return
    }

    // 사용자 제스처 컨텍스트에서 SidePanel 먼저 열기
    chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' })

    chrome.runtime.sendMessage(
      { type: 'ANALYZE_PLACE', reviews, placeInfo, site: 'naver_place', lang: getDefaultLanguage() },
      (response) => {
        loading = false
        if (response?.success) {
          btn.textContent = '\u2713 ' + t('doneButton')
          btn.style.background = '#43a047'
          setTimeout(() => resetButton(btn), 3000)
        } else if (response?.exceeded) {
          btn.textContent = t('upgradeButton')
          btn.style.background = '#ff9800'
        } else {
          btn.textContent = t('analysisFailed')
          btn.style.background = '#e53935'
          setTimeout(() => resetButton(btn), 5000)
        }
      }
    )
  } catch {
    loading = false
    btn.textContent = t('analysisFailed')
    btn.style.background = '#e53935'
    setTimeout(() => resetButton(btn), 5000)
  }
}

function resetButton(btn: HTMLButtonElement) {
  loading = false
  btn.textContent = '\u2605 ' + t('analyzeButton')
  btn.style.background = '#667eea'
  btn.style.opacity = '1'
}

const btn = createButton()
btn.addEventListener('click', () => handleClick(btn))
document.body.appendChild(btn)
