import type { Review, PlaceInfo } from '../types'
import { MAX_REVIEWS, MAX_REVIEW_LENGTH } from '../../js/config.js'

// --- Selectors (상수 분리: DOM 변경 시 여기만 수정) ---
const SELECTORS = {
  // 리뷰 패널 열기
  ALL_REVIEWS_BUTTON: 'button[jsaction*="reviewChart"]',
  REVIEWS_TAB_COUNT: 'button[aria-label*="review"]',

  // 리뷰 컨테이너 (패널 내부 스크롤 영역)
  REVIEW_PANEL_SCROLLABLE: 'div.m6QErb.DxyBCb',

  // 정렬 버튼
  SORT_BUTTON: 'button[data-value="Sort"]',
  SORT_NEWEST: 'li[data-index="1"]',

  // 개별 리뷰
  REVIEW_ITEM: 'div[data-review-id]',
  REVIEW_TEXT: 'span.wiI7pd',
  REVIEW_MORE_BUTTON: 'button.w8nwRe.kyuRq',
  REVIEW_RATING: 'span.kvMYJc',
  REVIEW_AUTHOR: 'div.d4r55',
  REVIEW_DATE: 'span.rsqaWe',
  REVIEW_LANG: '[lang]',

  // 장소 메타데이터
  PLACE_NAME: 'h1.DUwDvf',
  PLACE_CATEGORY: 'button.DkEaL',
  PLACE_RATING: 'div.F7nice span[aria-hidden="true"]',
  PLACE_REVIEW_COUNT: 'span[aria-label*="review"]',
  PLACE_ADDRESS: 'button[data-item-id="address"]',

  // place_id 추출
  CANONICAL_LINK: 'link[rel="canonical"]',
  META_PLACE_ID: 'meta[property="og:url"]'
} as const

// --- Place ID 추출 (URL 우선 + DOM fallback) ---
export function extractPlaceId(url: string, doc: Document): string {
  // 1순위: URL에서 hex 패턴 추출
  const hexMatch = url.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i)
  if (hexMatch) return hexMatch[1]

  // 2순위: URL의 place/ 뒤 세그먼트에서 ChIJ 패턴
  const chiMatch = url.match(/place\/[^/]+\/(ChIJ[A-Za-z0-9_-]+)/)
  if (chiMatch) return chiMatch[1]

  // 3순위: canonical link 또는 og:url 메타에서 추출
  const canonical = doc.querySelector(SELECTORS.CANONICAL_LINK)?.getAttribute('href') ?? ''
  const ogUrl = doc.querySelector(SELECTORS.META_PLACE_ID)?.getAttribute('content') ?? ''

  for (const link of [canonical, ogUrl]) {
    const linkHex = link.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i)
    if (linkHex) return linkHex[1]
    const linkChi = link.match(/place\/[^/]+\/(ChIJ[A-Za-z0-9_-]+)/)
    if (linkChi) return linkChi[1]
  }

  // 최종 fallback: 현재 URL 자체를 키로 사용
  return url.split('?')[0]
}

// --- 상대 날짜 파싱 (영어 MVP) ---
export function parseRelativeDate(relativeStr: string): Date | null {
  const now = new Date()
  const str = relativeStr.toLowerCase().trim()

  const patterns: [RegExp, (n: number) => Date][] = [
    [/(\d+)\s*second/i, (n) => new Date(now.getTime() - n * 1000)],
    [/(\d+)\s*minute/i, (n) => new Date(now.getTime() - n * 60 * 1000)],
    [/(\d+)\s*hour/i, (n) => new Date(now.getTime() - n * 3600 * 1000)],
    [/(\d+)\s*day/i, (n) => new Date(now.getTime() - n * 86400 * 1000)],
    [/(\d+)\s*week/i, (n) => new Date(now.getTime() - n * 7 * 86400 * 1000)],
    [
      /(\d+)\s*month/i,
      (n) => {
        const d = new Date(now)
        d.setMonth(d.getMonth() - n)
        return d
      }
    ],
    [
      /(\d+)\s*year/i,
      (n) => {
        const d = new Date(now)
        d.setFullYear(d.getFullYear() - n)
        return d
      }
    ],
    [
      /^a\s+month/i,
      () => {
        const d = new Date(now)
        d.setMonth(d.getMonth() - 1)
        return d
      }
    ],
    [
      /^a\s+year/i,
      () => {
        const d = new Date(now)
        d.setFullYear(d.getFullYear() - 1)
        return d
      }
    ],
    [/^a\s+week/i, () => new Date(now.getTime() - 7 * 86400 * 1000)],
    [/^a\s+day|^yesterday/i, () => new Date(now.getTime() - 86400 * 1000)]
  ]

  for (const [regex, calc] of patterns) {
    const match = str.match(regex)
    if (match) {
      const n = match[1] ? parseInt(match[1], 10) : 1
      return calc(n)
    }
  }

  return null // 파싱 실패 — 트렌드 분석에서 제외
}

// --- 단일 리뷰 파싱 ---
function parseReviewElement(el: Element, index: number): Review | null {
  const textEl = el.querySelector(SELECTORS.REVIEW_TEXT)
  const text = textEl?.textContent?.trim() ?? ''
  if (!text) return null

  const ratingEl = el.querySelector(SELECTORS.REVIEW_RATING)
  const ratingAttr = ratingEl?.getAttribute('aria-label') ?? ''
  const ratingMatch = ratingAttr.match(/(\d)/)
  const rating = ratingMatch ? parseInt(ratingMatch[1], 10) : 0

  const author = el.querySelector(SELECTORS.REVIEW_AUTHOR)?.textContent?.trim() ?? 'Anonymous'

  const dateEl = el.querySelector(SELECTORS.REVIEW_DATE)
  const relativeDate = dateEl?.textContent?.trim() ?? ''
  const date = parseRelativeDate(relativeDate)

  const langEl = el.querySelector(SELECTORS.REVIEW_LANG)
  const language = langEl?.getAttribute('lang') ?? undefined

  const reviewId = el.getAttribute('data-review-id') ?? `review-${index}`

  return {
    id: reviewId,
    author,
    rating,
    text: text.slice(0, MAX_REVIEW_LENGTH),
    date,
    relativeDate,
    language
  }
}

// --- 장소 메타데이터 추출 ---
export function extractPlaceInfo(doc: Document, url: string): PlaceInfo {
  const name = doc.querySelector(SELECTORS.PLACE_NAME)?.textContent?.trim() ?? 'Unknown Place'
  const category = doc.querySelector(SELECTORS.PLACE_CATEGORY)?.textContent?.trim() ?? ''
  const ratingText = doc.querySelector(SELECTORS.PLACE_RATING)?.textContent?.trim() ?? '0'
  const overallRating = parseFloat(ratingText) || 0

  const reviewCountEl = doc.querySelector(SELECTORS.PLACE_REVIEW_COUNT)
  const reviewCountAttr = reviewCountEl?.getAttribute('aria-label') ?? ''
  const countMatch = reviewCountAttr.match(/([\d,]+)/)
  const totalReviews = countMatch ? parseInt(countMatch[1].replace(/,/g, ''), 10) : 0

  const address = doc.querySelector(SELECTORS.PLACE_ADDRESS)?.textContent?.trim()

  return {
    placeId: extractPlaceId(url, doc),
    name,
    url: url.split('?')[0],
    category,
    overallRating,
    totalReviews,
    address
  }
}

// --- 스크롤 가능한 부모 요소 찾기 (난독화 클래스 의존 제거) ---
function findScrollableParent(element: Element): Element | null {
  let el: Element | null = element
  while (el) {
    const style = getComputedStyle(el)
    if (
      (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
      el.scrollHeight > el.clientHeight
    ) {
      return el
    }
    el = el.parentElement
  }
  return null
}

// --- 리뷰 패널 열기 ---
async function openReviewPanel(doc: Document): Promise<Element | null> {
  // "All reviews" 버튼 또는 리뷰 수 버튼 클릭
  const reviewBtn =
    doc.querySelector(SELECTORS.ALL_REVIEWS_BUTTON) ||
    doc.querySelector(SELECTORS.REVIEWS_TAB_COUNT)

  if (reviewBtn && reviewBtn instanceof HTMLElement) {
    reviewBtn.click()
  }

  // 리뷰가 나타날 때까지 대기 (난독화 클래스 의존 제거)
  return new Promise((resolve) => {
    let attempts = 0
    const check = () => {
      // 먼저 리뷰 아이템이 있는지 확인 (data-review-id는 안정적)
      const firstReview = doc.querySelector(SELECTORS.REVIEW_ITEM)
      if (firstReview) {
        // 리뷰의 스크롤 가능한 부모 컨테이너를 찾음
        const scrollable = findScrollableParent(firstReview)
        if (scrollable) {
          resolve(scrollable)
          return
        }
      }
      // fallback: 기존 셀렉터 시도
      const panel = doc.querySelector(SELECTORS.REVIEW_PANEL_SCROLLABLE)
      if (panel) {
        resolve(panel)
        return
      }
      attempts++
      if (attempts > 20) {
        resolve(null)
        return
      }
      setTimeout(check, 300)
    }
    check()
  })
}

// --- 리뷰 "More" 버튼 클릭 (전체 텍스트 펼치기) ---
function expandAllReviews(doc: Document): void {
  const moreButtons = doc.querySelectorAll(SELECTORS.REVIEW_MORE_BUTTON)
  moreButtons.forEach((btn) => {
    if (btn instanceof HTMLElement) btn.click()
  })
}

// --- 무한 스크롤 로딩 ---
async function scrollAndLoadReviews(panel: Element, maxReviews: number): Promise<void> {
  // 리뷰 아이템의 스크롤 가능한 부모를 찾아서 스크롤 대상으로 사용
  const firstReview = panel.querySelector(SELECTORS.REVIEW_ITEM)
  const scrollTarget = firstReview ? findScrollableParent(firstReview) : panel

  if (!scrollTarget) return

  let prevCount = 0
  let staleRounds = 0

  while (staleRounds < 5) {
    const currentCount = panel.querySelectorAll(SELECTORS.REVIEW_ITEM).length
    if (currentCount >= maxReviews) break

    if (currentCount === prevCount) {
      staleRounds++
    } else {
      staleRounds = 0
    }
    prevCount = currentCount

    scrollTarget.scrollTop = scrollTarget.scrollHeight
    await new Promise((r) => setTimeout(r, 800))
  }
}

// --- 메인 추출 함수 ---
export async function extractGoogleMapsReviews(
  doc: Document,
  url: string,
  maxReviews: number = MAX_REVIEWS
): Promise<{ reviews: Review[]; placeInfo: PlaceInfo }> {
  const placeInfo = extractPlaceInfo(doc, url)

  // 리뷰 패널 열기
  const panel = await openReviewPanel(doc)
  if (!panel) {
    return { reviews: [], placeInfo }
  }

  // 무한 스크롤로 리뷰 로딩
  await scrollAndLoadReviews(panel, maxReviews)

  // "More" 버튼 클릭해서 전체 텍스트 펼치기
  expandAllReviews(doc)
  await new Promise((r) => setTimeout(r, 300))

  // 리뷰 파싱
  const reviewElements = panel.querySelectorAll(SELECTORS.REVIEW_ITEM)
  const seen = new Set<string>()
  const reviews: Review[] = []

  for (let i = 0; i < reviewElements.length && reviews.length < maxReviews; i++) {
    const review = parseReviewElement(reviewElements[i], i)
    if (!review) continue

    // 중복 제거 (텍스트 기준)
    const key = review.text.slice(0, 100)
    if (seen.has(key)) continue
    seen.add(key)

    reviews.push(review)
  }

  return { reviews, placeInfo }
}

export { SELECTORS }
