import { getDefaultLanguage, setLanguage, t, applyI18n } from './i18n.js'
import { STORAGE_KEYS } from './config.js'

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

function renderAspects(
  aspects: Array<{ aspect: string; score: number; summary: string; keywords: string[] }>
) {
  const container = el('aspects-container')
  container.innerHTML = ''

  for (const a of aspects) {
    const config = ASPECT_CONFIG[a.aspect] || { color: '#667eea', icon: '\u2B50' }
    const pct = (a.score / 10) * 100
    const name = t(`aspect${a.aspect.charAt(0).toUpperCase() + a.aspect.slice(1)}`) || a.aspect

    const card = document.createElement('div')
    card.className = 'aspect-card'

    const header = document.createElement('div')
    header.className = 'aspect-header'
    header.innerHTML = `<span class="aspect-icon">${config.icon}</span><span class="aspect-name"></span><span class="aspect-score" style="color:${config.color}"></span>`
    header.querySelector('.aspect-name')!.textContent = name
    header.querySelector('.aspect-score')!.textContent = a.score.toFixed(1)

    const barBg = document.createElement('div')
    barBg.className = 'aspect-bar-bg'
    barBg.innerHTML = `<div class="aspect-bar-fill" style="width:${pct}%;background:${config.color}"></div>`

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

function renderList(containerId: string, sectionId: string, items: string[], _className: string) {
  const list = el(containerId)
  const section = el(sectionId)
  list.innerHTML = ''
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
  container.innerHTML = ''
  if (!trend) return

  const config: Record<string, { icon: string; label: string; cls: string }> = {
    improving: { icon: '\u2191', label: t('trendImproving'), cls: 'trend-improving' },
    declining: { icon: '\u2193', label: t('trendDeclining'), cls: 'trend-declining' },
    stable: { icon: '\u2192', label: t('trendStable'), cls: 'trend-stable' }
  }
  const c = config[trend.direction] || config.stable

  const div = document.createElement('div')
  div.className = `trend-badge ${c.cls}`
  div.innerHTML = `<div class="trend-header"><span class="trend-icon">${c.icon}</span><span class="trend-label"></span></div><p class="trend-reason"></p>`
  div.querySelector('.trend-label')!.textContent = c.label
  div.querySelector('.trend-reason')!.textContent = trend.reason
  container.appendChild(div)
}

function renderWaitTime(waitTime: { estimate: string; basedOn: number } | undefined) {
  const container = el('waittime-container')
  container.innerHTML = ''
  if (!waitTime) return

  const hasData = waitTime.basedOn > 0
  const div = document.createElement('div')
  div.className = 'waittime'
  div.innerHTML = `<div class="waittime-header">\u23F1\uFE0F <span style="font-size:13px;font-weight:600;color:#6a1b9a">${t('waitTime')}</span></div><p class="waittime-estimate"></p>`
  div.querySelector('.waittime-estimate')!.textContent = hasData
    ? waitTime.estimate
    : t('insufficientData')
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
  container.innerHTML = ''
  if (!tags?.length) return

  const label = document.createElement('p')
  label.style.cssText = 'font-size:13px;font-weight:600;color:#333;margin-bottom:6px'
  label.textContent = t('bestFor')
  container.appendChild(label)

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
  renderList('highlights-list', 'highlights-section', data.highlights, 'highlights')
  renderList('warnings-list', 'warnings-section', data.warnings, 'warnings')

  // Pro 기능
  const proSection = el('pro-section')
  const proGate = el('pro-gate')

  if (data.trend || data.waitTime || data.bestFor) {
    proSection.style.display = 'block'
    proGate.style.display = 'none'
    renderTrend(data.trend)
    renderWaitTime(data.waitTime)
    renderBestFor(data.bestFor)
  } else if (!isPro) {
    proSection.style.display = 'none'
    proGate.style.display = 'block'
  }

  // 언어 비율
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

  // storage에서 최신 결과 읽기
  const stored = await chrome.storage.local.get(STORAGE_KEYS.LAST_ANALYSIS)
  const analysis = stored[STORAGE_KEYS.LAST_ANALYSIS]

  if (!analysis) {
    showState('empty')
  } else if (!analysis.success || !analysis.data) {
    showState('error')
    el('state-error').textContent = analysis.exceeded
      ? t('limitReached')
      : analysis.error || t('analysisFailed')
  } else {
    renderAnalysis(analysis.data, analysis.placeInfo, isPro)
  }

  // 실시간 메시지 수신
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'ANALYSIS_RESULT' && msg.data) {
      if (msg.data.success && msg.data.data) {
        renderAnalysis(msg.data.data, msg.data.placeInfo, isPro)
      } else {
        showState('error')
        el('state-error').textContent = msg.data.error || t('analysisFailed')
      }
    }
    if (msg.type === 'ANALYSIS_LOADING') {
      showState('loading')
    }
  })
}

init()
