import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { JSDOM } from 'jsdom'

import {
  extractNaverPlaceId,
  extractNaverPlaceInfo,
  parseNaverDate,
  SELECTORS
} from '../../src/lib/scrapers/naver-place'

function loadFixture(name: string): Document {
  const html = readFileSync(join(__dirname, '..', 'fixtures', `${name}.html`), 'utf-8')
  return new JSDOM(html).window.document
}

describe('parseNaverDate', () => {
  it('parses "25.01.10. 방문"', () => {
    const date = parseNaverDate('25.01.10. 방문')
    expect(date).not.toBeNull()
    expect(date!.getFullYear()).toBe(2025)
    expect(date!.getMonth()).toBe(0) // January
    expect(date!.getDate()).toBe(10)
  })

  it('parses "24.12.20. 방문"', () => {
    const date = parseNaverDate('24.12.20. 방문')
    expect(date).not.toBeNull()
    expect(date!.getFullYear()).toBe(2024)
    expect(date!.getMonth()).toBe(11) // December
  })

  it('parses "2개월 전"', () => {
    const date = parseNaverDate('2개월 전')
    expect(date).not.toBeNull()
    const diffDays = (Date.now() - date!.getTime()) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThan(50)
    expect(diffDays).toBeLessThan(70)
  })

  it('parses "3일 전"', () => {
    const date = parseNaverDate('3일 전')
    expect(date).not.toBeNull()
    const diffDays = (Date.now() - date!.getTime()) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThan(2)
    expect(diffDays).toBeLessThan(4)
  })

  it('parses "1주 전"', () => {
    const date = parseNaverDate('1주 전')
    expect(date).not.toBeNull()
    const diffDays = (Date.now() - date!.getTime()) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThan(6)
    expect(diffDays).toBeLessThan(8)
  })

  it('returns null for unrecognized format', () => {
    expect(parseNaverDate('')).toBeNull()
    expect(parseNaverDate('unknown')).toBeNull()
  })
})

describe('extractNaverPlaceId', () => {
  it('extracts from restaurant URL', () => {
    const id = extractNaverPlaceId('https://m.place.naver.com/restaurant/1234567890/review')
    expect(id).toBe('1234567890')
  })

  it('extracts from pcmap URL', () => {
    const id = extractNaverPlaceId('https://pcmap.place.naver.com/restaurant/9876543210')
    expect(id).toBe('9876543210')
  })

  it('falls back to URL when pattern not found', () => {
    const id = extractNaverPlaceId('https://place.naver.com/unknown')
    expect(id).toBe('https://place.naver.com/unknown')
  })
})

describe('extractNaverPlaceInfo', () => {
  it('extracts restaurant metadata', () => {
    const doc = loadFixture('naver-place-restaurant')
    const info = extractNaverPlaceInfo(doc, 'https://m.place.naver.com/restaurant/1234567890')
    expect(info.name).toBe('서울 갈비집')
    expect(info.category).toBe('한식')
    expect(info.overallRating).toBe(4.6)
    expect(info.totalReviews).toBe(823)
    expect(info.placeId).toBe('1234567890')
    expect(info.address).toBe('서울특별시 강남구 테헤란로 123')
  })

  it('handles no-review place', () => {
    const doc = loadFixture('naver-place-no-reviews')
    const info = extractNaverPlaceInfo(doc, 'https://m.place.naver.com/cafe/111')
    expect(info.name).toBe('새로 오픈한 카페')
    expect(info.category).toBe('카페')
  })
})

describe('review parsing', () => {
  it('parses restaurant reviews', () => {
    const doc = loadFixture('naver-place-restaurant')
    const items = doc.querySelectorAll(SELECTORS.REVIEW_ITEM)
    expect(items.length).toBe(3)

    const firstText = items[0].querySelector(SELECTORS.REVIEW_TEXT)?.textContent
    expect(firstText).toContain('갈비가 정말 맛있어요')

    const firstAuthor = items[0].querySelector(SELECTORS.REVIEW_AUTHOR)?.textContent
    expect(firstAuthor).toBe('맛집탐방가')
  })

  it('returns empty for no-reviews fixture', () => {
    const doc = loadFixture('naver-place-no-reviews')
    const items = doc.querySelectorAll(SELECTORS.REVIEW_ITEM)
    expect(items.length).toBe(0)
  })

  it('all reviews have Korean language', () => {
    const doc = loadFixture('naver-place-restaurant')
    const items = doc.querySelectorAll(SELECTORS.REVIEW_ITEM)
    const langs = Array.from(items).map(
      (el) => el.querySelector('[lang]')?.getAttribute('lang') ?? ''
    )
    expect(langs.every((l) => l === 'ko')).toBe(true)
  })
})
