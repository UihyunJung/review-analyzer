import { describe, it, expect } from 'vitest'
import {
  classifyGeminiError,
  classifyParseError,
  classifyFetchError
} from '../src/lib/error-classify'

describe('classifyGeminiError', () => {
  it.each([
    // 2026-06-10 장애의 실제 패턴 — 크레딧 소진
    [
      429,
      'Gemini API error (429): Your prepayment credits are depleted. Please purchase more credits.',
      'CREDITS_DEPLETED',
      'critical'
    ],
    [429, 'Gemini API error (429): insufficient credit balance', 'CREDITS_DEPLETED', 'critical'],
    // Google rate limit/쿼터
    [429, 'Gemini API error (429): RESOURCE_EXHAUSTED', 'QUOTA_RATE_LIMIT', 'warning'],
    [
      429,
      'Gemini API error (429): Quota exceeded for quota metric generate_content_requests',
      'QUOTA_RATE_LIMIT',
      'warning'
    ],
    // 미분류 429 ("Too Many Requests"는 quota/rate 문구가 없어 RATE_LIMIT_OTHER)
    [429, 'Too Many Requests', 'RATE_LIMIT_OTHER', 'warning'],
    [429, 'Gemini API error (429): something new', 'RATE_LIMIT_OTHER', 'warning'],
    // Google 측 장애
    [503, 'Gemini API error (503): The model is overloaded.', 'GOOGLE_OVERLOADED', 'warning'],
    [500, 'Gemini API error (500): Internal error', 'GOOGLE_SERVER_ERROR', 'warning'],
    [502, 'Gemini API request failed', 'GOOGLE_SERVER_ERROR', 'warning'],
    [504, 'upstream timeout', 'GOOGLE_SERVER_ERROR', 'warning'],
    // 프록시 인증/모델 제한 (우리 백엔드 고정 문구)
    [401, 'Proxy authentication failed', 'PROXY_AUTH_FAILED', 'critical'],
    [403, 'Model not allowed: gemini-2.5-pro', 'MODEL_NOT_ALLOWED', 'critical'],
    // Gemini API 키 문제 (Google 고정 문구)
    [
      400,
      'Gemini API error (400): API key not valid. Please pass a valid API key.',
      'API_KEY_INVALID',
      'critical'
    ],
    // 모델 미존재
    [404, 'Gemini API error (404): models/gemini-x is not found', 'MODEL_NOT_FOUND', 'critical'],
    // fallback
    [418, 'teapot', 'UNKNOWN', 'warning'],
    [400, 'Bad request', 'UNKNOWN', 'warning'],
    // 빈 바디 — status만으로 분류
    [429, '', 'RATE_LIMIT_OTHER', 'warning'],
    [503, '', 'GOOGLE_OVERLOADED', 'warning']
  ])('status %i + %s → %s (%s)', (status, body, classification, severity) => {
    const result = classifyGeminiError(status as number, body as string)
    expect(result.classification).toBe(classification)
    expect(result.severity).toBe(severity)
    expect(result.adminHint.length).toBeGreaterThan(0)
  })

  it('바디 문자열이 status보다 우선한다 (503 바디에 api key 문구가 있으면 API_KEY_INVALID)', () => {
    const result = classifyGeminiError(503, 'API key not valid. Please pass a valid API key.')
    expect(result.classification).toBe('API_KEY_INVALID')
  })
})

describe('classifyParseError', () => {
  it('PARSE_FAILED warning을 반환한다', () => {
    const result = classifyParseError()
    expect(result.classification).toBe('PARSE_FAILED')
    expect(result.severity).toBe('warning')
  })
})

describe('classifyFetchError', () => {
  it('PROXY_UNREACHABLE warning + 원인 메시지를 포함한다', () => {
    const result = classifyFetchError('fetch failed: connection timeout')
    expect(result.classification).toBe('PROXY_UNREACHABLE')
    expect(result.severity).toBe('warning')
    expect(result.adminHint).toContain('connection timeout')
  })
})
