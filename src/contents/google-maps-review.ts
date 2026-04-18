import { extractGoogleMapsReviews } from '../lib/scrapers/google-maps'
import { extractPlaceId } from '../lib/scrapers/google-maps'
import { getDefaultLanguage, setLanguage, t } from '../js/i18n.js'
import { STORAGE_KEYS } from '../js/config.js'
import { showLoading, setLoadingStage, showResult, showError, showExceeded, hideModal, hasResult, toggleModal, clearResult, setRetryHandler } from './modal'
import { getErrorMessageKey } from './error-message-key'

// 응답 타입 (background.js와 계약)
type AnalyzeResponse = {
  success?: boolean
  data?: { isPro?: boolean } & Record<string, unknown>
  exceeded?: boolean
  errorCode?: string
}

// 재시도 버튼 클릭시 사용할 btn 참조 + placeId (SPA navigation 안전성)
let lastAnalyzeBtn: HTMLButtonElement | null = null
let lastAnalyzePlaceId: string | null = null

// 재시도 핸들러: modal.ts의 retry 버튼이 호출
async function triggerRetry() {
  if (!lastAnalyzeBtn) return
  // SPA navigation으로 장소가 바뀌었는지 확인
  const current = extractPlaceId(window.location.href, document)
  if (lastAnalyzePlaceId && current && current !== lastAnalyzePlaceId) {
    hideModal()
    return
  }
  // DOM에서 btn이 여전히 존재하는지
  if (!document.contains(lastAnalyzeBtn)) return
  resetButton(lastAnalyzeBtn)
  handleAnalyzeClick(lastAnalyzeBtn)
}
setRetryHandler(triggerRetry)

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
  if (usageCheck?.success && usageCheck.data?.remaining !== undefined && usageCheck.data.remaining <= 0) {
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
  lastAnalyzeBtn = btn

  try {
    const { reviews, placeInfo } = await extractGoogleMapsReviews(document, window.location.href)
    lastAnalyzePlaceId = placeInfo?.placeId ?? null

    if (reviews.length === 0) {
      loading = false
      btn.textContent = t('noReviews')
      btn.style.background = '#e53935'
      showError(t('noReviews'))
      setTimeout(() => resetButton(btn), 3000)
      return
    }

    setLoadingStage('analyzing')

    // 503/GEMINI_ERROR 자동 재시도 루프 (최대 1회 재시도)
    for (let attempt = 0; attempt <= 1; attempt++) {
      if (attempt > 0) {
        setLoadingStage('retrying')
        await new Promise((r) => setTimeout(r, 2000))
        // SPA navigation으로 장소가 바뀌었는지 재확인
        const currentPlaceId = extractPlaceId(window.location.href, document)
        if (lastAnalyzePlaceId && currentPlaceId && currentPlaceId !== lastAnalyzePlaceId) {
          hideModal()
          loading = false
          resetButton(btn)
          return
        }
      }

      // chrome.runtime.lastError 명시적 체크 (MV3 SW suspend 대응)
      const response = await new Promise<AnalyzeResponse | undefined>((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: 'ANALYZE_PLACE',
            reviews,
            placeInfo,
            site: 'google_maps',
            lang: currentLang,
            isFinalAttempt: attempt === 1
          },
          (resp: AnalyzeResponse | undefined) => {
            if (chrome.runtime.lastError) {
              console.warn('[sendMessage]', chrome.runtime.lastError.message)
              resolve(undefined)
              return
            }
            resolve(resp)
          }
        )
      })

      loading = false

      if (response?.success) {
        btn.textContent = '\u2713 ' + t('doneButton')
        btn.style.background = '#43a047'
        const isPro = response.data?.isPro || false
        showResult(response.data as never, placeInfo, isPro)
        toggleBtn.style.display = ''
        setTimeout(() => resetButton(btn), 3000)
        return
      }

      if (response?.exceeded) {
        exceeded = true
        btn.textContent = t('upgradeButton')
        btn.style.background = '#ff9800'
        showExceeded()
        return
      }

      const code = response?.errorCode
      const retryableCodes = ['GEMINI_OVERLOADED', 'GEMINI_ERROR']
      if (attempt === 0 && code !== undefined && retryableCodes.includes(code)) {
        loading = true
        continue
      }

      // 최종 실패
      const showRetryBtn =
        code !== undefined && ['GEMINI_OVERLOADED', 'GEMINI_ERROR', 'NETWORK_ERROR'].includes(code)
      btn.textContent = t('analysisFailed')
      btn.style.background = '#e53935'
      showError(t(getErrorMessageKey(code)), { showRetry: showRetryBtn })
      setTimeout(() => resetButton(btn), 5000)
      return
    }
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

// --- storage 변경 실시간 반영 ---
chrome.storage.onChanged.addListener((changes) => {
  if (changes[STORAGE_KEYS.LANGUAGE]) {
    currentLang = changes[STORAGE_KEYS.LANGUAGE].newValue || getDefaultLanguage()
    setLanguage(currentLang)
    if (!loading) analyzeBtn.textContent = '\u2605 ' + t('analyzeButton')
    toggleBtn.title = t('togglePanel') || 'Show/hide analysis'
  }
  if (changes[STORAGE_KEYS.PREMIUM]?.newValue === true && exceeded) {
    exceeded = false
    resetButton(analyzeBtn)
  }
})
