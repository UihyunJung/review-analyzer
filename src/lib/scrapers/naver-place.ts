import type { Review, PlaceInfo } from '../types'
import { MAX_REVIEWS, MAX_REVIEW_LENGTH } from '../../js/config.js'

const SELECTORS = {
  // 리뷰 컨테이너
  REVIEW_LIST: 'ul.place_section_content',
  REVIEW_ITEM: 'li.pui__X35jYm',

  // 리뷰 내용
  REVIEW_TEXT: 'div.pui__vn15t2 > a, div.pui__vn15t2 > span',
  REVIEW_MORE_BUTTON: 'a.pui__NMy1y',
  REVIEW_RATING: 'span.pui__JvtoM_',
  REVIEW_AUTHOR: 'span.pui__NMi0-',
  REVIEW_DATE: 'span.pui__gfuUIT > time',
  REVIEW_VISIT_COUNT: 'span.pui__QKE5Pr',

  // 장소 메타데이터
  PLACE_NAME: 'span.GHAhO, h2.place_section_header_title',
  PLACE_CATEGORY: 'span.lnJFt, span.DJJvD',
  PLACE_RATING: 'span.PXMot em',
  PLACE_REVIEW_COUNT: 'span.PXMot a, a.place_section_count',
  PLACE_ADDRESS: 'span.LDgIH, span.pui__udFr2',

  // 리뷰 탭
  REVIEW_TAB: 'a[href*="review"], span.veBoZ'
} as const

// --- 네이버 Place ID 추출 ---
export function extractNaverPlaceId(url: string): string {
  // URL 패턴: https://m.place.naver.com/restaurant/1234567890/review
  // 또는: https://pcmap.place.naver.com/restaurant/1234567890
  const match = url.match(/place\.naver\.com\/\w+\/(\d+)/)
  if (match) return match[1]
  return url.split('?')[0]
}

// --- 네이버 날짜 파싱 ---
export function parseNaverDate(dateStr: string): Date | null {
  // "24.12.15. 방문" → 2024-12-15
  const dotMatch = dateStr.match(/(\d{2,4})\.(\d{1,2})\.(\d{1,2})/)
  if (dotMatch) {
    let year = parseInt(dotMatch[1], 10)
    if (year < 100) year += 2000
    const month = parseInt(dotMatch[2], 10) - 1
    const day = parseInt(dotMatch[3], 10)
    return new Date(year, month, day)
  }

  // "2개월 전", "1주 전" 등 상대 시간
  const now = new Date()
  const relativePatterns: [RegExp, (n: number) => Date][] = [
    [/(\d+)\s*일\s*전/, (n) => new Date(now.getTime() - n * 86400 * 1000)],
    [/(\d+)\s*주\s*전/, (n) => new Date(now.getTime() - n * 7 * 86400 * 1000)],
    [
      /(\d+)\s*개?월\s*전/,
      (n) => {
        const d = new Date(now)
        d.setMonth(d.getMonth() - n)
        return d
      }
    ],
    [
      /(\d+)\s*년\s*전/,
      (n) => {
        const d = new Date(now)
        d.setFullYear(d.getFullYear() - n)
        return d
      }
    ]
  ]

  for (const [regex, calc] of relativePatterns) {
    const m = dateStr.match(regex)
    if (m) return calc(parseInt(m[1], 10))
  }

  return null
}

// --- 단일 리뷰 파싱 ---
function parseReviewElement(el: Element, index: number): Review | null {
  const textEl = el.querySelector(SELECTORS.REVIEW_TEXT)
  const text = textEl?.textContent?.trim() ?? ''
  if (!text) return null

  const ratingEl = el.querySelector(SELECTORS.REVIEW_RATING)
  const ratingText = ratingEl?.textContent?.trim() ?? ''
  const rating = parseInt(ratingText, 10) || 0

  const author = el.querySelector(SELECTORS.REVIEW_AUTHOR)?.textContent?.trim() ?? '익명'

  const dateEl = el.querySelector(SELECTORS.REVIEW_DATE)
  const dateStr = dateEl?.textContent?.trim() ?? dateEl?.getAttribute('datetime') ?? ''
  const date = parseNaverDate(dateStr)

  return {
    id: `naver-${index}`,
    author,
    rating,
    text: text.slice(0, MAX_REVIEW_LENGTH),
    date,
    relativeDate: dateStr,
    language: 'ko'
  }
}

// --- 장소 메타데이터 ---
export function extractNaverPlaceInfo(doc: Document, url: string): PlaceInfo {
  const name = doc.querySelector(SELECTORS.PLACE_NAME)?.textContent?.trim() ?? ''
  const category = doc.querySelector(SELECTORS.PLACE_CATEGORY)?.textContent?.trim() ?? ''

  const ratingEls = doc.querySelectorAll(SELECTORS.PLACE_RATING)
  let overallRating = 0
  if (ratingEls.length > 0) {
    const nums = Array.from(ratingEls)
      .map((el) => el.textContent?.trim() ?? '')
      .join('')
    overallRating = parseFloat(nums) || 0
  }

  const reviewCountEl = doc.querySelector(SELECTORS.PLACE_REVIEW_COUNT)
  const countText = reviewCountEl?.textContent?.trim() ?? ''
  const countMatch = countText.match(/([\d,]+)/)
  const totalReviews = countMatch ? parseInt(countMatch[1].replace(/,/g, ''), 10) : 0

  const address = doc.querySelector(SELECTORS.PLACE_ADDRESS)?.textContent?.trim()

  return {
    placeId: extractNaverPlaceId(url),
    name,
    url: url.split('?')[0],
    category,
    overallRating,
    totalReviews,
    address
  }
}

// --- 리뷰 탭 열기 + 스크롤 ---
async function loadReviews(doc: Document, maxReviews: number): Promise<Element[]> {
  // 리뷰 탭 클릭
  const reviewTab = doc.querySelector(SELECTORS.REVIEW_TAB)
  if (reviewTab instanceof HTMLElement) {
    reviewTab.click()
    await new Promise((r) => setTimeout(r, 500))
  }

  // "더보기" 클릭 반복 또는 스크롤
  let staleRounds = 0
  let prevCount = 0

  for (let i = 0; i < 20 && staleRounds < 3; i++) {
    const items = doc.querySelectorAll(SELECTORS.REVIEW_ITEM)
    if (items.length >= maxReviews) break

    if (items.length === prevCount) {
      staleRounds++
    } else {
      staleRounds = 0
    }
    prevCount = items.length

    // "More" 버튼 또는 스크롤
    const moreBtn = doc.querySelector(SELECTORS.REVIEW_MORE_BUTTON)
    if (moreBtn instanceof HTMLElement) {
      moreBtn.click()
    } else {
      window.scrollTo(0, document.body.scrollHeight)
    }
    await new Promise((r) => setTimeout(r, 400))
  }

  return Array.from(doc.querySelectorAll(SELECTORS.REVIEW_ITEM))
}

// --- 메인 추출 ---
export async function extractNaverPlaceReviews(
  doc: Document,
  url: string,
  maxReviews: number = MAX_REVIEWS
): Promise<{ reviews: Review[]; placeInfo: PlaceInfo }> {
  const placeInfo = extractNaverPlaceInfo(doc, url)

  const reviewEls = await loadReviews(doc, maxReviews)

  const seen = new Set<string>()
  const reviews: Review[] = []

  for (let i = 0; i < reviewEls.length && reviews.length < maxReviews; i++) {
    const review = parseReviewElement(reviewEls[i], i)
    if (!review) continue

    const key = review.text.slice(0, 100)
    if (seen.has(key)) continue
    seen.add(key)

    reviews.push(review)
  }

  return { reviews, placeInfo }
}

export { SELECTORS }
