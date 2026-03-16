import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { JSDOM } from 'jsdom'

import {
  extractPlaceId,
  extractPlaceInfo,
  parseRelativeDate,
  SELECTORS
} from '../../src/lib/scrapers/google-maps'

function loadFixture(name: string): Document {
  const html = readFileSync(join(__dirname, '..', 'fixtures', `${name}.html`), 'utf-8')
  const dom = new JSDOM(html)
  return dom.window.document
}

// --- parseRelativeDate ---
describe('parseRelativeDate', () => {
  it('parses "2 months ago"', () => {
    const date = parseRelativeDate('2 months ago')
    expect(date).not.toBeNull()
    const diffMs = Date.now() - date!.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThan(50)
    expect(diffDays).toBeLessThan(70)
  })

  it('parses "a year ago"', () => {
    const date = parseRelativeDate('a year ago')
    expect(date).not.toBeNull()
    const diffMs = Date.now() - date!.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThan(350)
    expect(diffDays).toBeLessThan(380)
  })

  it('parses "3 weeks ago"', () => {
    const date = parseRelativeDate('3 weeks ago')
    expect(date).not.toBeNull()
    const diffMs = Date.now() - date!.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThan(19)
    expect(diffDays).toBeLessThan(23)
  })

  it('parses "5 days ago"', () => {
    const date = parseRelativeDate('5 days ago')
    expect(date).not.toBeNull()
    const diffMs = Date.now() - date!.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThan(4)
    expect(diffDays).toBeLessThan(6)
  })

  it('parses "a week ago"', () => {
    const date = parseRelativeDate('a week ago')
    expect(date).not.toBeNull()
    const diffMs = Date.now() - date!.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThan(6)
    expect(diffDays).toBeLessThan(8)
  })

  it('returns null for non-English date', () => {
    expect(parseRelativeDate('2개월 전')).toBeNull()
    expect(parseRelativeDate('2か月前')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseRelativeDate('')).toBeNull()
  })
})

// --- extractPlaceId ---
describe('extractPlaceId', () => {
  it('extracts hex pattern from URL', () => {
    const doc = loadFixture('gmaps-restaurant')
    const url =
      'https://www.google.com/maps/place/Test/data=!1s0x89c25a22a3bda30d:0x68bdf1e3a7d2b364'
    const id = extractPlaceId(url, doc)
    expect(id).toBe('0x89c25a22a3bda30d:0x68bdf1e3a7d2b364')
  })

  it('falls back to canonical link when URL has no hex', () => {
    const doc = loadFixture('gmaps-restaurant')
    const url = 'https://www.google.com/maps/place/Test+Restaurant/'
    const id = extractPlaceId(url, doc)
    // canonical link에 hex 패턴이 있으므로 추출
    expect(id).toBe('0x89c25a22a3bda30d:0x68bdf1e3a7d2b364')
  })

  it('falls back to og:url meta when URL and canonical fail', () => {
    const doc = loadFixture('gmaps-hotel')
    const url = 'https://www.google.com/maps/place/Grand+Hotel/'
    const id = extractPlaceId(url, doc)
    expect(id).toBe('0x80c2c6c3f4e5d7b9:0x1234567890abcdef')
  })

  it('falls back to URL itself when all extraction fails', () => {
    const doc = loadFixture('gmaps-no-reviews')
    const url = 'https://www.google.com/maps/place/New+Cafe/?extra=param'
    const id = extractPlaceId(url, doc)
    // canonical에도 hex 없으므로 URL fallback
    expect(id).toBe('https://www.google.com/maps/place/New+Cafe/')
  })

  it('handles completely empty document', () => {
    const dom = new JSDOM('<html><body></body></html>')
    const url = 'https://www.google.com/maps/place/Empty/'
    const id = extractPlaceId(url, dom.window.document)
    expect(id).toBe('https://www.google.com/maps/place/Empty/')
  })
})

// --- extractPlaceInfo ---
describe('extractPlaceInfo', () => {
  it('extracts restaurant metadata', () => {
    const doc = loadFixture('gmaps-restaurant')
    const info = extractPlaceInfo(doc, 'https://www.google.com/maps/place/Test/')
    expect(info.name).toBe('The Great Pasta House')
    expect(info.category).toBe('Italian restaurant')
    expect(info.overallRating).toBe(4.5)
    expect(info.totalReviews).toBe(1234)
    expect(info.address).toBe('123 Main St, New York, NY')
  })

  it('extracts hotel metadata', () => {
    const doc = loadFixture('gmaps-hotel')
    const info = extractPlaceInfo(doc, 'https://www.google.com/maps/place/Hotel/')
    expect(info.name).toBe('Grand Hotel Downtown')
    expect(info.category).toBe('Hotel')
    expect(info.overallRating).toBe(4.2)
    expect(info.totalReviews).toBe(892)
  })

  it('handles zero-review place', () => {
    const doc = loadFixture('gmaps-no-reviews')
    const info = extractPlaceInfo(doc, 'https://www.google.com/maps/place/Cafe/')
    expect(info.name).toBe('New Cafe Opening Soon')
    expect(info.totalReviews).toBe(0)
  })
})

// --- 리뷰 파싱 (fixture 기반) ---
describe('review parsing from fixtures', () => {
  it('parses restaurant reviews', () => {
    const doc = loadFixture('gmaps-restaurant')
    const panel = doc.querySelector(SELECTORS.REVIEW_PANEL_SCROLLABLE)!
    const items = panel.querySelectorAll(SELECTORS.REVIEW_ITEM)
    expect(items.length).toBe(5)

    // 첫 번째 리뷰 확인
    const firstText = items[0].querySelector(SELECTORS.REVIEW_TEXT)?.textContent
    expect(firstText).toContain('Amazing pasta')

    const firstAuthor = items[0].querySelector(SELECTORS.REVIEW_AUTHOR)?.textContent
    expect(firstAuthor).toBe('John D.')
  })

  it('returns empty for no-reviews fixture', () => {
    const doc = loadFixture('gmaps-no-reviews')
    const panel = doc.querySelector(SELECTORS.REVIEW_PANEL_SCROLLABLE)!
    const items = panel.querySelectorAll(SELECTORS.REVIEW_ITEM)
    expect(items.length).toBe(0)
  })

  it('parses multilingual reviews with language detection', () => {
    const doc = loadFixture('gmaps-multilingual')
    const panel = doc.querySelector(SELECTORS.REVIEW_PANEL_SCROLLABLE)!
    const items = panel.querySelectorAll(SELECTORS.REVIEW_ITEM)
    expect(items.length).toBe(4)

    // 언어 감지
    const langs = Array.from(items).map(
      (el) => el.querySelector('[lang]')?.getAttribute('lang') ?? 'unknown'
    )
    expect(langs).toContain('en')
    expect(langs).toContain('ko')
    expect(langs).toContain('ja')
  })

  it('parses hotel reviews', () => {
    const doc = loadFixture('gmaps-hotel')
    const panel = doc.querySelector(SELECTORS.REVIEW_PANEL_SCROLLABLE)!
    const items = panel.querySelectorAll(SELECTORS.REVIEW_ITEM)
    expect(items.length).toBe(3)
  })
})
