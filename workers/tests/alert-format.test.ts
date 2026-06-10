import { describe, it, expect } from 'vitest'
import { formatAlertMessage } from '../src/lib/alert'
import type { ClassifiedError } from '../src/lib/error-classify'

const critical: ClassifiedError = {
  classification: 'CREDITS_DEPLETED',
  severity: 'critical',
  adminHint: '선불 크레딧 소진 — AI Studio 잔액 확인'
}

const warning: ClassifiedError = {
  classification: 'GOOGLE_OVERLOADED',
  severity: 'warning',
  adminHint: 'Google 측 과부하'
}

describe('formatAlertMessage', () => {
  it('분류·severity·env·status·errorCode·힌트·시각을 모두 포함한다', () => {
    const msg = formatAlertMessage(
      critical,
      {
        status: 429,
        errorCode: 'GEMINI_RATE_LIMIT',
        detail: 'Gemini API error (429): prepayment credits are depleted'
      },
      'production',
      '2026-06-11T03:00:00.000Z'
    )
    expect(msg).toContain('🚨')
    expect(msg).toContain('CREDITS_DEPLETED')
    expect(msg).toContain('critical')
    expect(msg).toContain('env: production')
    expect(msg).toContain('HTTP 429')
    expect(msg).toContain('errorCode: GEMINI_RATE_LIMIT')
    expect(msg).toContain('선불 크레딧 소진')
    expect(msg).toContain('2026-06-11T03:00:00.000Z')
  })

  it('warning은 ⚠️ 이모지를 사용한다', () => {
    const msg = formatAlertMessage(
      warning,
      { status: 503, errorCode: 'GEMINI_OVERLOADED', detail: 'overloaded' },
      'dev',
      '2026-06-11T03:00:00.000Z'
    )
    expect(msg).toContain('⚠️')
    expect(msg).toContain('env: dev')
  })

  it('300자 초과 원문은 절단하고 말줄임표를 붙인다', () => {
    const longDetail = 'x'.repeat(400)
    const msg = formatAlertMessage(
      warning,
      { status: 500, errorCode: 'GEMINI_ERROR', detail: longDetail },
      'production',
      '2026-06-11T03:00:00.000Z'
    )
    expect(msg).toContain('…')
    expect(msg).not.toContain('x'.repeat(301))
  })

  it('300자 이하 원문은 그대로 포함한다', () => {
    const msg = formatAlertMessage(
      warning,
      { status: 500, errorCode: 'GEMINI_ERROR', detail: 'short detail' },
      'production',
      '2026-06-11T03:00:00.000Z'
    )
    expect(msg).toContain('원문: short detail')
    expect(msg).not.toContain('…')
  })
})
