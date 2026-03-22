import { t } from '../js/i18n.js'
import type { PlaceInfo } from '../lib/types'

declare module '*.css?inline' {
  const css: string
  export default css
}
import modalCss from '../css/modal.css?inline'

// --- 분석 결과 타입 ---

interface AspectData {
  aspect: string
  score: number
  summary: string
  keywords: string[]
}

interface TrendData {
  direction: string
  reason: string
}

interface WaitTimeData {
  estimate: string
  basedOn: number
}

interface AnalysisData {
  aspects?: AspectData[]
  highlights?: string[]
  warnings?: string[]
  trend?: TrendData
  waitTime?: WaitTimeData
  bestFor?: string[]
  languageBreakdown?: Record<string, number>
  reviewCount?: number
  cached?: boolean
  isPro?: boolean
}

// --- Shadow DOM 기반 모달 ---

let shadowRoot: ShadowRoot | null = null
let hostEl: HTMLElement | null = null
let lastResultData: { data: AnalysisData; placeInfo: PlaceInfo; isPro: boolean } | null = null

const ASPECT_CONFIG: Record<string, { color: string; icon: string }> = {
  food: { color: '#4caf50', icon: '\uD83C\uDF7D\uFE0F' },
  service: { color: '#2196f3', icon: '\uD83D\uDC4B' },
  value: { color: '#ff9800', icon: '\uD83D\uDCB0' },
  ambiance: { color: '#9c27b0', icon: '\u2728' }
}

function el(id: string): HTMLElement {
  return shadowRoot!.getElementById(id)!
}

function clearChildren(element: Element) {
  element.replaceChildren()
}

function ensureHost(): ShadowRoot {
  if (shadowRoot) return shadowRoot

  hostEl = document.createElement('div')
  hostEl.id = 'pra-modal-host'
  hostEl.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:99999'
  document.body.appendChild(hostEl)

  shadowRoot = hostEl.attachShadow({ mode: 'closed' })

  // CSS 인라인
  const style = document.createElement('style')
  style.textContent = modalCss
  shadowRoot.appendChild(style)

  // 모달 컨테이너 (초기 숨김)
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'modal-overlay'
  overlay.style.display = 'none'

  const container = document.createElement('div')
  container.className = 'modal-container'
  container.id = 'modal-container'

  // Sticky header (제목 + 카테고리 + 닫기 버튼)
  const headerEl = document.createElement('div')
  headerEl.className = 'modal-header'
  headerEl.id = 'modal-header'
  const headerInfo = document.createElement('div')
  headerInfo.className = 'modal-header-info'
  const h1 = document.createElement('h1')
  h1.id = 'place-name'
  headerInfo.appendChild(h1)
  const cat = document.createElement('p')
  cat.id = 'place-category'
  cat.className = 'category'
  headerInfo.appendChild(cat)
  headerEl.appendChild(headerInfo)
  const closeBtn = document.createElement('button')
  closeBtn.className = 'modal-close'
  closeBtn.textContent = '\u2715'
  closeBtn.addEventListener('click', hideModal)
  headerEl.appendChild(closeBtn)
  container.appendChild(headerEl)

  // Body (스크롤 영역)
  const body = document.createElement('div')
  body.className = 'modal-body'
  body.id = 'modal-body'

  // 상태: loading (progress bar)
  const stateLoading = document.createElement('div')
  stateLoading.id = 'state-loading'
  stateLoading.className = 'state-message'
  const progressWrap = document.createElement('div')
  progressWrap.className = 'progress-wrap'
  const progressBg = document.createElement('div')
  progressBg.className = 'progress-bar-bg'
  const progressFill = document.createElement('div')
  progressFill.className = 'progress-bar-fill'
  progressFill.id = 'progress-fill'
  progressBg.appendChild(progressFill)
  progressWrap.appendChild(progressBg)
  const progressStage = document.createElement('p')
  progressStage.className = 'progress-stage'
  progressStage.id = 'progress-stage'
  progressWrap.appendChild(progressStage)
  stateLoading.appendChild(progressWrap)
  body.appendChild(stateLoading)

  // 상태: error
  const stateError = document.createElement('div')
  stateError.id = 'state-error'
  stateError.className = 'state-error'
  stateError.style.display = 'none'
  body.appendChild(stateError)

  // 상태: result (구조를 1회만 생성)
  const stateResult = document.createElement('div')
  stateResult.id = 'state-result'
  stateResult.style.display = 'none'
  body.appendChild(stateResult)

  buildResultDOM(stateResult)

  container.appendChild(body)

  overlay.appendChild(container)

  // 오버레이 클릭 닫기
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hideModal()
  })


  shadowRoot.appendChild(overlay)
  return shadowRoot
}

function buildResultDOM(root: HTMLElement) {
  // Aspects
  const aspectSection = document.createElement('section')
  aspectSection.className = 'section'
  const aspectTitle = document.createElement('h2')
  aspectTitle.textContent = t('aspectScores')
  aspectSection.appendChild(aspectTitle)
  const aspectContainer = document.createElement('div')
  aspectContainer.id = 'aspects-container'
  aspectSection.appendChild(aspectContainer)
  root.appendChild(aspectSection)

  // Highlights
  const hlSection = document.createElement('section')
  hlSection.className = 'section'
  hlSection.id = 'highlights-section'
  hlSection.style.display = 'none'
  const hlTitle = document.createElement('h2')
  hlTitle.textContent = t('highlights')
  hlSection.appendChild(hlTitle)
  const hlList = document.createElement('ul')
  hlList.id = 'highlights-list'
  hlList.className = 'result-list highlights'
  hlSection.appendChild(hlList)
  root.appendChild(hlSection)

  // Warnings
  const warnSection = document.createElement('section')
  warnSection.className = 'section'
  warnSection.id = 'warnings-section'
  warnSection.style.display = 'none'
  const warnTitle = document.createElement('h2')
  warnTitle.textContent = t('watchOut')
  warnSection.appendChild(warnTitle)
  const warnList = document.createElement('ul')
  warnList.id = 'warnings-list'
  warnList.className = 'result-list warnings'
  warnSection.appendChild(warnList)
  root.appendChild(warnSection)

  // Pro section
  const proSection = document.createElement('section')
  proSection.className = 'section'
  proSection.id = 'pro-section'
  proSection.style.display = 'none'
  const proTitle = document.createElement('h2')
  proTitle.textContent = t('proInsights')
  proSection.appendChild(proTitle)
  const trendContainer = document.createElement('div')
  trendContainer.id = 'trend-container'
  proSection.appendChild(trendContainer)
  const waittimeContainer = document.createElement('div')
  waittimeContainer.id = 'waittime-container'
  proSection.appendChild(waittimeContainer)
  const bestforContainer = document.createElement('div')
  bestforContainer.id = 'bestfor-container'
  proSection.appendChild(bestforContainer)
  root.appendChild(proSection)

  // Pro gate
  const proGate = document.createElement('section')
  proGate.id = 'pro-gate'
  proGate.className = 'pro-gate'
  proGate.style.display = 'none'
  const proGateText = document.createElement('p')
  proGateText.textContent = t('proGateText')
  proGate.appendChild(proGateText)
  const proGateBtns = document.createElement('div')
  proGateBtns.style.cssText = 'display:flex;gap:8px;justify-content:center'
  const proMonthlyBtn = document.createElement('button')
  proMonthlyBtn.className = 'pro-gate-btn'
  proMonthlyBtn.textContent = t('monthlyPlan')
  proMonthlyBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_CHECKOUT', plan: 'monthly' })
  })
  const proAnnualBtn = document.createElement('button')
  proAnnualBtn.className = 'pro-gate-btn'
  proAnnualBtn.style.background = '#764ba2'
  proAnnualBtn.textContent = t('annualPlan')
  proAnnualBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_CHECKOUT', plan: 'annual' })
  })
  proGateBtns.appendChild(proMonthlyBtn)
  proGateBtns.appendChild(proAnnualBtn)
  proGate.appendChild(proGateBtns)
  root.appendChild(proGate)

  // Language
  const langSection = document.createElement('section')
  langSection.className = 'section'
  langSection.id = 'lang-section'
  langSection.style.display = 'none'
  const langInfo = document.createElement('p')
  langInfo.id = 'lang-info'
  langInfo.className = 'lang-info'
  langSection.appendChild(langInfo)
  root.appendChild(langSection)

  // 캐시 안내
  const cachedNotice = document.createElement('p')
  cachedNotice.id = 'cached-notice'
  cachedNotice.className = 'cached-notice'
  cachedNotice.style.display = 'none'
  root.appendChild(cachedNotice)

  // Footer
  const footer = document.createElement('footer')
  footer.className = 'result-footer'
  const reviewCount = document.createElement('p')
  reviewCount.id = 'review-count'
  footer.appendChild(reviewCount)
  root.appendChild(footer)
}

// --- 렌더링 함수 (Shadow DOM 기반) ---

function renderAspects(aspects: AspectData[]) {
  const container = el('aspects-container')
  clearChildren(container)

  for (const a of aspects) {
    const config = ASPECT_CONFIG[a.aspect] || { color: '#667eea', icon: '\u2B50' }
    const pct = (a.score / 10) * 100
    const name = t(`aspect${a.aspect.charAt(0).toUpperCase() + a.aspect.slice(1)}`) || a.aspect

    const card = document.createElement('div')
    card.className = 'aspect-card'

    const header = document.createElement('div')
    header.className = 'aspect-header'
    const iconSpan = document.createElement('span')
    iconSpan.className = 'aspect-icon'
    iconSpan.textContent = config.icon
    header.appendChild(iconSpan)
    const nameSpan = document.createElement('span')
    nameSpan.className = 'aspect-name'
    nameSpan.textContent = name
    header.appendChild(nameSpan)
    const scoreSpan = document.createElement('span')
    scoreSpan.className = 'aspect-score'
    scoreSpan.style.color = config.color
    scoreSpan.textContent = a.score.toFixed(1)
    header.appendChild(scoreSpan)

    const barBg = document.createElement('div')
    barBg.className = 'aspect-bar-bg'
    const barFill = document.createElement('div')
    barFill.className = 'aspect-bar-fill'
    barFill.style.width = `${pct}%`
    barFill.style.background = config.color
    barBg.appendChild(barFill)

    const summary = document.createElement('p')
    summary.className = 'aspect-summary'
    summary.textContent = a.summary

    card.appendChild(header)
    card.appendChild(barBg)
    card.appendChild(summary)

    if (a.keywords?.length) {
      const tags = document.createElement('div')
      tags.className = 'aspect-keywords'
      for (const kw of a.keywords) {
        const tag = document.createElement('span')
        tag.className = 'keyword-tag'
        tag.style.borderColor = config.color
        tag.style.color = config.color
        tag.textContent = kw
        tags.appendChild(tag)
      }
      card.appendChild(tags)
    }

    container.appendChild(card)
  }
}

function renderList(containerId: string, sectionId: string, items: string[]) {
  const list = el(containerId)
  const section = el(sectionId)
  clearChildren(list)
  if (!items?.length) {
    section.style.display = 'none'
    return
  }
  section.style.display = 'block'
  for (const item of items) {
    const li = document.createElement('li')
    li.textContent = item
    list.appendChild(li)
  }
}

function renderTrend(trend: TrendData | undefined) {
  const container = el('trend-container')
  clearChildren(container)
  if (!trend) return

  const trendConfig: Record<string, { icon: string; label: string; cls: string }> = {
    improving: { icon: '\u2191', label: t('trendImproving'), cls: 'trend-improving' },
    declining: { icon: '\u2193', label: t('trendDeclining'), cls: 'trend-declining' },
    stable: { icon: '\u2192', label: t('trendStable'), cls: 'trend-stable' }
  }
  const c = trendConfig[trend.direction] || trendConfig.stable

  const div = document.createElement('div')
  div.className = `trend-badge ${c.cls}`
  const header = document.createElement('div')
  header.className = 'trend-header'
  const iconSpan = document.createElement('span')
  iconSpan.className = 'trend-icon'
  iconSpan.textContent = c.icon
  header.appendChild(iconSpan)
  const labelSpan = document.createElement('span')
  labelSpan.className = 'trend-label'
  labelSpan.textContent = c.label
  header.appendChild(labelSpan)
  div.appendChild(header)
  const reason = document.createElement('p')
  reason.className = 'trend-reason'
  reason.textContent = trend.reason
  div.appendChild(reason)
  container.appendChild(div)
}

function renderWaitTime(waitTime: WaitTimeData | undefined) {
  const container = el('waittime-container')
  clearChildren(container)
  if (!waitTime) return

  const hasData = waitTime.basedOn > 0
  const div = document.createElement('div')
  div.className = 'waittime'
  const header = document.createElement('div')
  header.className = 'waittime-header'
  header.textContent = '\u23F1\uFE0F '
  const label = document.createElement('span')
  label.style.cssText = 'font-size:13px;font-weight:600;color:#6a1b9a'
  label.textContent = t('waitTime')
  header.appendChild(label)
  div.appendChild(header)
  const estimate = document.createElement('p')
  estimate.className = 'waittime-estimate'
  estimate.textContent = hasData ? waitTime.estimate : t('insufficientData')
  div.appendChild(estimate)
  if (hasData) {
    const note = document.createElement('p')
    note.className = 'waittime-note'
    note.textContent = t('basedOnWaitReviews').replace('{count}', String(waitTime.basedOn))
    div.appendChild(note)
  }
  container.appendChild(div)
}

function renderBestFor(tags: string[] | undefined) {
  const container = el('bestfor-container')
  clearChildren(container)
  if (!tags?.length) return

  const labelEl = document.createElement('p')
  labelEl.style.cssText = 'font-size:13px;font-weight:600;color:#333;margin-bottom:6px'
  labelEl.textContent = t('bestFor')
  container.appendChild(labelEl)
  const tagsDiv = document.createElement('div')
  tagsDiv.className = 'bestfor-tags'
  for (const tag of tags) {
    const span = document.createElement('span')
    span.className = 'bestfor-tag'
    span.textContent = tag
    tagsDiv.appendChild(span)
  }
  container.appendChild(tagsDiv)
}

function showState(state: 'loading' | 'error' | 'result') {
  for (const s of ['loading', 'error', 'result']) {
    el(`state-${s}`).style.display = s === state ? 'block' : 'none'
  }
}

function renderAnalysis(data: AnalysisData, placeInfo: PlaceInfo, isPro: boolean) {
  showState('result')

  el('place-name').textContent = placeInfo?.name || ''
  el('place-category').textContent = placeInfo?.category || ''

  renderAspects(data.aspects || [])
  renderList('highlights-list', 'highlights-section', data.highlights)
  renderList('warnings-list', 'warnings-section', data.warnings)

  const proSection = el('pro-section')
  const proGate = el('pro-gate')

  if (isPro && (data.trend || data.waitTime || data.bestFor)) {
    proSection.style.display = 'block'
    proGate.style.display = 'none'
    renderTrend(data.trend)
    renderWaitTime(data.waitTime)
    renderBestFor(data.bestFor)
  } else if (!isPro) {
    proSection.style.display = 'none'
    proGate.style.display = 'block'
  } else {
    proSection.style.display = 'none'
    proGate.style.display = 'none'
  }

  const langSection = el('lang-section')
  const langInfo = el('lang-info')
  const breakdown = data.languageBreakdown
  if (breakdown && Object.keys(breakdown).length > 0) {
    langSection.style.display = 'block'
    const total = Object.values(breakdown).reduce((a, b) => a + b, 0)
    langInfo.textContent =
      t('reviews') + ': ' +
      Object.entries(breakdown)
        .sort(([, a], [, b]) => b - a)
        .map(([lang, count]) => {
          const langKey = 'lang_' + lang.toLowerCase()
          const translated = t(langKey)
          const label = translated !== langKey ? translated : lang.toUpperCase()
          return `${Math.round((count / total) * 100)}% ${label}`
        })
        .join(', ')
  } else {
    langSection.style.display = 'none'
  }

  el('review-count').textContent = t('basedOnReviews').replace('{count}', String(data.reviewCount || 0))

  // 캐시 안내
  const cachedNotice = el('cached-notice')
  if (data.cached) {
    cachedNotice!.textContent = t('cachedResult')
    cachedNotice!.style.display = 'block'
  } else {
    cachedNotice!.style.display = 'none'
  }
}

// --- Public API ---

export function showModal() {
  ensureHost()
  hostEl!.style.width = '100%'
  hostEl!.style.height = '100%'
  el('modal-overlay').style.display = 'flex'
}

export function hideModal() {
  if (!shadowRoot) return
  el('modal-overlay').style.display = 'none'
  hostEl!.style.width = '0'
  hostEl!.style.height = '0'
}

export function toggleModal() {
  if (!shadowRoot || el('modal-overlay').style.display === 'none') {
    if (lastResultData) {
      showModal()
    }
  } else {
    hideModal()
  }
}

// --- Progress bar 애니메이션 ---
let progressTimer: ReturnType<typeof setInterval> | null = null
let progressValue = 0

function stopProgress() {
  if (progressTimer) {
    clearInterval(progressTimer)
    progressTimer = null
  }
}

function startProgress(from: number, to: number, durationMs: number) {
  stopProgress()
  progressValue = from
  const fill = el('progress-fill')
  fill.style.width = `${from}%`

  const steps = Math.ceil(durationMs / 100)
  let step = 0
  progressTimer = setInterval(() => {
    step++
    // ease-out: 갈수록 느려짐
    const ratio = step / steps
    const eased = 1 - Math.pow(1 - ratio, 3)
    progressValue = from + (to - from) * eased
    fill.style.width = `${progressValue}%`
    if (step >= steps) stopProgress()
  }, 100)
}

export function showLoading() {
  showModal()
  showState('loading')
  el('place-name')!.textContent = ''
  el('place-category')!.textContent = ''
  // 단계1: 리뷰 수집 (0→40%, 8초 예상)
  el('progress-stage').textContent = t('loadingCollecting')
  startProgress(0, 40, 8000)
}

export function setLoadingStage(stage: 'analyzing') {
  if (stage === 'analyzing') {
    // 단계2: AI 분석 (현재값→90%, 12초 예상, 90%에서 극도로 느려짐)
    el('progress-stage').textContent = t('loadingAnalyzing')
    startProgress(progressValue, 90, 12000)
  }
}

export function showResult(data: AnalysisData, placeInfo: PlaceInfo, isPro: boolean) {
  lastResultData = { data, placeInfo, isPro }
  stopProgress()
  el('progress-fill').style.width = '100%'
  el('progress-stage').textContent = ''
  // 바 100% 표시 후 결과 전환
  setTimeout(() => {
    showModal()
    renderAnalysis(data, placeInfo, isPro)
  }, 300)
}

export function showError(msg: string) {
  stopProgress()
  showModal()
  showState('error')
  const errorEl = el('state-error')
  errorEl.textContent = msg
}

export function showExceeded() {
  stopProgress()
  showModal()
  showState('error')
  const errorEl = el('state-error')
  errorEl.textContent = ''

  const msg = document.createElement('p')
  msg.textContent = t('limitReached')
  msg.style.cssText = 'margin-bottom:12px'
  errorEl.appendChild(msg)

  const desc = document.createElement('p')
  desc.textContent = t('upgradeDesc')
  desc.style.cssText = 'margin-bottom:12px;font-size:12px;color:#666'
  errorEl.appendChild(desc)

  const btnContainer = document.createElement('div')
  btnContainer.style.cssText = 'display:flex;gap:8px;justify-content:center'

  const monthlyBtn = document.createElement('button')
  monthlyBtn.textContent = t('monthlyPlan')
  monthlyBtn.style.cssText = 'padding:8px 16px;background:#667eea;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer'
  monthlyBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_CHECKOUT', plan: 'monthly' })
  })

  const annualBtn = document.createElement('button')
  annualBtn.textContent = t('annualPlan')
  annualBtn.style.cssText = 'padding:8px 16px;background:#764ba2;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer'
  annualBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_CHECKOUT', plan: 'annual' })
  })

  btnContainer.appendChild(monthlyBtn)
  btnContainer.appendChild(annualBtn)
  errorEl.appendChild(btnContainer)
}

export function hasResult(): boolean {
  return lastResultData !== null
}

export function clearResult() {
  lastResultData = null
}
