import { describe, it, expect } from 'vitest'
import { getErrorMessageKey } from '../../src/contents/error-message-key'

describe('getErrorMessageKey', () => {
  it('maps each errorCode to correct i18n key', () => {
    expect(getErrorMessageKey('GEMINI_OVERLOADED')).toBe('errorOverloaded')
    expect(getErrorMessageKey('GEMINI_RATE_LIMIT')).toBe('errorRateLimit')
    expect(getErrorMessageKey('WORKERS_RATE_LIMIT')).toBe('errorRateLimit')
    expect(getErrorMessageKey('GEMINI_NOT_FOUND')).toBe('errorNotFound')
    expect(getErrorMessageKey('GEMINI_ERROR')).toBe('errorUpstream')
    expect(getErrorMessageKey('PARSE_FAILED')).toBe('errorParseFailed')
    expect(getErrorMessageKey('NETWORK_ERROR')).toBe('errorNetwork')
  })

  it('returns analysisFailed fallback for unknown code', () => {
    expect(getErrorMessageKey('UNKNOWN_XYZ')).toBe('analysisFailed')
    expect(getErrorMessageKey(undefined)).toBe('analysisFailed')
    expect(getErrorMessageKey('')).toBe('analysisFailed')
  })
})
