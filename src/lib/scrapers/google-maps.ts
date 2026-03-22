import type { Review, PlaceInfo } from '../types'
import { MAX_REVIEWS, MAX_REVIEW_LENGTH } from '../../js/config.js'

// --- Selectors (안정적 셀렉터 우선, 난독화 클래스 fallback) ---
const SELECTORS = {
  // 리뷰 탭 열기 (aria-label 기반 — 안정적)
  REVIEW_TAB: '[role="tab"][aria-label*="\ub9ac\ubdf0"], [role="tab"][aria-label*="review" i]',
  // fallback: 기존 방식
  ALL_REVIEWS_BUTTON: 'button[jsaction*="reviewChart"]',

  // 리뷰 컨테이너 (스크롤 영역)
  REVIEW_PANEL_SCROLLABLE: 'div.m6QErb.DxyBCb',

  // 개별 리뷰 (중첩된 data-review-id 중 최상위만 — :not으로 필터)
  REVIEW_ITEM: 'div[data-review-id]:not(div[data-review-id] div[data-review-id])',
  // 리뷰 내부 요소 (난독화 클래스 + aria-label fallback)
  REVIEW_TEXT: 'span.wiI7pd',
  REVIEW_MORE_BUTTON: 'button.w8nwRe.kyuRq',
  REVIEW_RATING: 'span.kvMYJc, [aria-label*="\ubcc4\ud45c"], [aria-label*="star" i]',
  REVIEW_AUTHOR: 'div.d4r55',
  REVIEW_DATE: 'span.rsqaWe',
  REVIEW_LANG: '[lang]',

  // 장소 메타데이터 (h1, aria-label — 안정적)
  PLACE_NAME: 'h1',
  PLACE_CATEGORY: 'button.DkEaL',
  PLACE_RATING: '[aria-label*="\ubcc4\ud45c"], div.F7nice span[aria-hidden="true"]',
  PLACE_REVIEW_COUNT: '[aria-label*="\ub9ac\ubdf0"], span[aria-label*="review" i]',
  PLACE_ADDRESS: 'button[data-item-id="address"]',

  // place_id 추출
  CANONICAL_LINK: 'link[rel="canonical"]',
  META_PLACE_ID: 'meta[property="og:url"]'
} as const

// --- Place ID 추출 (URL 우선 + DOM fallback) ---
export function extractPlaceId(url: string, doc: Document): string {
  // 1순위: URL에서 hex 패턴 추출 (마지막 매칭 = 현재 장소)
  const hexMatches = [...url.matchAll(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/gi)]
  if (hexMatches.length > 0) return hexMatches[hexMatches.length - 1][1]

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
    // 영어
    [/(\d+)\s*second/i, (n) => new Date(now.getTime() - n * 1000)],
    [/(\d+)\s*minute/i, (n) => new Date(now.getTime() - n * 60 * 1000)],
    [/(\d+)\s*hour/i, (n) => new Date(now.getTime() - n * 3600 * 1000)],
    [/(\d+)\s*day/i, (n) => new Date(now.getTime() - n * 86400 * 1000)],
    [/(\d+)\s*week/i, (n) => new Date(now.getTime() - n * 7 * 86400 * 1000)],
    [/(\d+)\s*month/i, (n) => { const d = new Date(now); d.setMonth(d.getMonth() - n); return d }],
    [/(\d+)\s*year/i, (n) => { const d = new Date(now); d.setFullYear(d.getFullYear() - n); return d }],
    [/^a\s+month/i, () => { const d = new Date(now); d.setMonth(d.getMonth() - 1); return d }],
    [/^a\s+year/i, () => { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d }],
    [/^a\s+week/i, () => new Date(now.getTime() - 7 * 86400 * 1000)],
    [/^a\s+day|^yesterday/i, () => new Date(now.getTime() - 86400 * 1000)],
    // 한국어
    [/(\d+)\s*초\s*전/, (n) => new Date(now.getTime() - n * 1000)],
    [/(\d+)\s*분\s*전/, (n) => new Date(now.getTime() - n * 60 * 1000)],
    [/(\d+)\s*시간\s*전/, (n) => new Date(now.getTime() - n * 3600 * 1000)],
    [/(\d+)\s*일\s*전/, (n) => new Date(now.getTime() - n * 86400 * 1000)],
    [/(\d+)\s*주\s*전/, (n) => new Date(now.getTime() - n * 7 * 86400 * 1000)],
    [/(\d+)\s*달\s*전/, (n) => { const d = new Date(now); d.setMonth(d.getMonth() - n); return d }],
    [/(\d+)\s*개월\s*전/, (n) => { const d = new Date(now); d.setMonth(d.getMonth() - n); return d }],
    [/(\d+)\s*년\s*전/, (n) => { const d = new Date(now); d.setFullYear(d.getFullYear() - n); return d }]
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
  let name = doc.querySelector(SELECTORS.PLACE_NAME)?.textContent?.trim() ?? ''
  if (!name) {
    // fallback: 리뷰 탭 aria-label 전체 사용 (리뷰 탭에서 새로고침 시 h1 없음)
    const reviewTab = doc.querySelector(SELECTORS.REVIEW_TAB)
    name = reviewTab?.getAttribute('aria-label')?.trim() || 'Unknown Place'
  }
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

// --- 리뷰 "More" 버튼 클릭 (전체 텍스트 펼치기) ---
function expandAllReviews(doc: Document): void {
  const moreButtons = doc.querySelectorAll(SELECTORS.REVIEW_MORE_BUTTON)
  moreButtons.forEach((btn) => {
    if (btn instanceof HTMLElement) btn.click()
  })
}

// --- 대기 헬퍼 ---
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

// --- 리뷰 탭 클릭 → 스크롤 → 50개 수집 ---
// 스크롤 컨테이너를 반환 (파싱 시 이 안에서만 검색)
async function loadReviews(doc: Document, maxReviews: number): Promise<Element | null> {
  // 1. 리뷰 탭 클릭
  const reviewTab = doc.querySelector(SELECTORS.REVIEW_TAB) || doc.querySelector(SELECTORS.ALL_REVIEWS_BUTTON)
  if (reviewTab && reviewTab instanceof HTMLElement) {
    reviewTab.click()
  }

  // 2. 스크롤 컨테이너가 나타날 때까지 대기 (최대 10초)
  let scrollContainer: Element | null = null
  for (let i = 0; i < 20; i++) {
    await wait(500)
    scrollContainer = doc.querySelector(SELECTORS.REVIEW_PANEL_SCROLLABLE)
    if (scrollContainer && scrollContainer.querySelectorAll(SELECTORS.REVIEW_ITEM).length >= 1) break
  }

  if (!scrollContainer) return null

  // 3. 스크롤하면서 리뷰 로드 — 컨테이너 안에서만 카운트
  let staleRounds = 0
  while (staleRounds < 3) {
    const count = scrollContainer.querySelectorAll(SELECTORS.REVIEW_ITEM).length
    if (count >= maxReviews) break

    scrollContainer.scrollTop = scrollContainer.scrollHeight
    await wait(1000)

    const newCount = scrollContainer.querySelectorAll(SELECTORS.REVIEW_ITEM).length
    if (newCount === count) {
      staleRounds++
    } else {
      staleRounds = 0
    }
  }

  return scrollContainer
}

// --- 메인 추출 함수 ---
export async function extractGoogleMapsReviews(
  doc: Document,
  url: string,
  maxReviews: number = MAX_REVIEWS
): Promise<{ reviews: Review[]; placeInfo: PlaceInfo }> {
  // 장소 메타데이터 (리뷰 탭 전환 전에 추출 — 리뷰 탭에서는 h1이 사라짐)
  const placeInfo = extractPlaceInfo(doc, url)

  // 리뷰 탭 클릭 → 스크롤 → 리뷰 로드
  const reviewContainer = await loadReviews(doc, maxReviews)
  if (!reviewContainer) {
    return { reviews: [], placeInfo }
  }

  // "More" 버튼 클릭해서 전체 텍스트 펼치기
  expandAllReviews(doc)
  await wait(300)

  // 리뷰 파싱 (스크롤 컨테이너 안에서만)
  const reviewElements = reviewContainer.querySelectorAll(SELECTORS.REVIEW_ITEM)
  const seen = new Set<string>()
  const reviews: Review[] = []
  for (let i = 0; i < reviewElements.length && reviews.length < maxReviews; i++) {
    const review = parseReviewElement(reviewElements[i], i)
    if (!review) continue

    // 중복 제거 (review ID 기준)
    const key = reviewElements[i].getAttribute('data-review-id') || review.text.slice(0, 100)
    if (seen.has(key)) continue
    seen.add(key)

    reviews.push(review)
  }

  return { reviews, placeInfo }
}

export { SELECTORS }
