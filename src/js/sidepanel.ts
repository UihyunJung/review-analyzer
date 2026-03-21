import { getDefaultLanguage, setLanguage, t, applyI18n } from './i18n.js'
import { STORAGE_KEYS } from './config.js'
import { openCheckout } from './subscription.js'

const el = (id: string) => document.getElementById(id)!

const ASPECT_CONFIG: Record<string, { color: string; icon: string }> = {
  food: { color: '#4caf50', icon: '\uD83C\uDF7D\uFE0F' },
  service: { color: '#2196f3', icon: '\uD83D\uDC4B' },
  value: { color: '#ff9800', icon: '\uD83D\uDCB0' },
  ambiance: { color: '#9c27b0', icon: '\u2728' }
}

function showState(state: 'loading' | 'empty' | 'error' | 'result') {
  ;['loading', 'empty', 'error', 'result'].forEach((s) => {
    el(`state-${s}`).style.display = s === state ? 'block' : 'none'
  })
}

function clearChildren(element: Element) {
  element.replaceChildren()
}

function renderAspects(
  aspects: Array<{ aspect: string; score: number; summary: string; keywords: string[] }>
) {
  const container = el('aspects-container')
  clearChildren(container)

  for (const a of aspects) {
    const config = ASPECT_CONFIG[a.aspect] || { color: '#667eea', icon: '\u2B50' }
    const pct = (a.score / 10) * 100
    const name = t(`aspect${a.aspect.charAt(0).toUpperCase() + a.aspect.slice(1)}`) || a.aspect

    const card = document.createElement('div')
    card.className = 'aspect-card'

    // Header (createElement only — no innerHTML)
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

    // Bar
    const barBg = document.createElement('div')
    barBg.className = 'aspect-bar-bg'
    const barFill = document.createElement('div')
    barFill.className = 'aspect-bar-fill'
    barFill.style.width = `${pct}%`
    barFill.style.background = config.color
    barBg.appendChild(barFill)

    // Summary
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

function renderTrend(trend: { direction: string; reason: string } | undefined) {
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

function renderWaitTime(waitTime: { estimate: string; basedOn: number } | undefined) {
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

function renderAnalysis(data: any, placeInfo: any, isPro: boolean) {
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
    const total =
      data.reviewCount || Object.values(breakdown).reduce((a: number, b: number) => a + b, 0)
    langInfo.textContent =
      t('reviews') +
      ': ' +
      Object.entries(breakdown)
        .sort(([, a]: any, [, b]: any) => b - a)
        .map(([lang, count]: any) => `${Math.round((count / total) * 100)}% ${lang.toUpperCase()}`)
        .join(', ')
  } else {
    langSection.style.display = 'none'
  }

  el('review-count').textContent = t('basedOnReviews').replace(
    '{count}',
    String(data.reviewCount || 0)
  )
}

async function init() {
  setLanguage(getDefaultLanguage())
  applyI18n()

  const premiumData = await chrome.storage.local.get(STORAGE_KEYS.PREMIUM)
  const isPro = premiumData[STORAGE_KEYS.PREMIUM] === true

  const stored = await chrome.storage.local.get(STORAGE_KEYS.LAST_ANALYSIS)
  const analysis = stored[STORAGE_KEYS.LAST_ANALYSIS]

  if (!analysis) {
    showState('empty')
  } else if (!analysis.success || !analysis.data) {
    showState('error')
    el('state-error').textContent = analysis.exceeded
      ? t('limitReached')
      : t('analysisFailed')
  } else {
    renderAnalysis(analysis.data, analysis.placeInfo, isPro)
  }

  // Pro 게이트 버튼 — 이벤트 위임 (display:none 상태에서도 동작)
  document.addEventListener('click', (e) => {
    if ((e.target as Element).closest('.pro-gate-btn')) {
      openCheckout('monthly').catch(() => {})
    }
  })

  // 메시지로 실시간 반영
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'ANALYSIS_RESULT' && msg.data) {
      if (msg.data.success && msg.data.data) {
        renderAnalysis(msg.data.data, msg.data.placeInfo, isPro)
      } else {
        showState('error')
        el('state-error').textContent = msg.data.exceeded ? t('limitReached') : t('analysisFailed')
      }
    }
    if (msg.type === 'ANALYSIS_LOADING') {
      showState('loading')
    }
  })

  // storage 변경 시에도 최신 결과 반영 (메시지 타이밍 누락 대비)
  chrome.storage.onChanged.addListener((changes) => {
    if (changes[STORAGE_KEYS.LAST_ANALYSIS]) {
      const analysis = changes[STORAGE_KEYS.LAST_ANALYSIS].newValue
      if (!analysis) {
        showState('empty')
      } else if (analysis.success && analysis.data) {
        renderAnalysis(analysis.data, analysis.placeInfo, isPro)
      } else {
        showState('error')
        el('state-error').textContent = analysis.exceeded
          ? t('limitReached')
          : t('analysisFailed')
      }
    }
  })
}

init()
