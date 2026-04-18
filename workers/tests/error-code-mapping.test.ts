import { describe, it, expect } from 'vitest'
import { geminiStatusToErrorCode } from '../src/lib/error-mapping'

describe('geminiStatusToErrorCode', () => {
  it.each([
    [503, 'GEMINI_OVERLOADED'],
    [429, 'GEMINI_RATE_LIMIT'],
    [404, 'GEMINI_NOT_FOUND'],
    [500, 'GEMINI_ERROR'],
    [502, 'GEMINI_ERROR'],
    [504, 'GEMINI_ERROR'],
    [400, 'GEMINI_ERROR'],
    [401, 'GEMINI_ERROR'],
    [403, 'GEMINI_ERROR']
  ])('status %i → %s', (status, expected) => {
    expect(geminiStatusToErrorCode(status)).toBe(expected)
  })
})
