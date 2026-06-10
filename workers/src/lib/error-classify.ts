// Gemini/프록시 에러 → 운영자 알림용 세부 분류 (순수 함수, 테스트 대상)
// 사용자 응답용 errorCode 매핑(error-mapping.ts)과 완전히 독립 — 서로 import 금지.
// 분류 우선순위: 바디 문자열(우리 프록시/Google이 명시한 원인) → HTTP status fallback.

export type ErrorSeverity = 'critical' | 'warning'

export interface ClassifiedError {
  classification: string
  severity: ErrorSeverity
  adminHint: string
}

export function classifyGeminiError(status: number, body: string): ClassifiedError {
  // 우리 프록시가 반환하는 메시지 — 문자열이 고정이라 정확 매칭 가능
  if (/proxy authentication/i.test(body)) {
    return {
      classification: 'PROXY_AUTH_FAILED',
      severity: 'critical',
      adminHint: 'Worker↔Vercel 시크릿 불일치 — GEMINI_PROXY_SECRET 배포 동기화 확인'
    }
  }
  if (/model not allowed/i.test(body)) {
    return {
      classification: 'MODEL_NOT_ALLOWED',
      severity: 'critical',
      adminHint: 'GEMINI_MODEL이 백엔드 GEMINI_ALLOWED_MODELS에 없음 — 설정 불일치'
    }
  }
  // Google 고정 문구: "API key not valid. Please pass a valid API key."
  if (/api key not valid|invalid api key/i.test(body)) {
    return {
      classification: 'API_KEY_INVALID',
      severity: 'critical',
      adminHint: 'Gemini API 키 무효/만료 — Vercel GEMINI_API_KEY 확인'
    }
  }

  if (status === 429) {
    if (/prepayment|credit/i.test(body)) {
      return {
        classification: 'CREDITS_DEPLETED',
        severity: 'critical',
        adminHint:
          '선불 크레딧 소진 — auto-reload 미작동/충전 결제 실패 가능성. AI Studio 잔액·결제수단 확인 후 충전'
      }
    }
    if (/quota|resource[\s_]?exhausted|rate/i.test(body)) {
      return {
        classification: 'QUOTA_RATE_LIMIT',
        severity: 'warning',
        adminHint: 'Google rate limit/쿼터 초과 — 일시적일 수 있음, 지속되면 Tier 한도 확인'
      }
    }
    return {
      classification: 'RATE_LIMIT_OTHER',
      severity: 'warning',
      adminHint: '미분류 429 — 원문 확인 필요'
    }
  }

  if (status === 503) {
    return {
      classification: 'GOOGLE_OVERLOADED',
      severity: 'warning',
      adminHint: 'Google 측 과부하 — 보통 자동 회복, 장기화 시 status 페이지 확인'
    }
  }

  if (status === 404) {
    return {
      classification: 'MODEL_NOT_FOUND',
      severity: 'critical',
      adminHint: '모델을 찾을 수 없음 — 모델명 오타/지원 종료 여부 확인 (전면 장애)'
    }
  }

  if (status === 500 || status === 502 || status === 504) {
    return {
      classification: 'GOOGLE_SERVER_ERROR',
      severity: 'warning',
      adminHint: `Google/프록시 서버 오류 (HTTP ${status}) — 지속 시 원문 확인`
    }
  }

  return {
    classification: 'UNKNOWN',
    severity: 'warning',
    adminHint: `미분류 에러 (HTTP ${status}) — 원문 확인 필요`
  }
}

export function classifyParseError(): ClassifiedError {
  return {
    classification: 'PARSE_FAILED',
    severity: 'warning',
    adminHint: '모델 응답 JSON 파싱 실패 — 프롬프트/모델 변경 여부 점검'
  }
}

export function classifyFetchError(message: string): ClassifiedError {
  return {
    classification: 'PROXY_UNREACHABLE',
    severity: 'warning',
    adminHint: `Worker→Vercel fetch 실패 (${message}) — Vercel 장애/네트워크 확인`
  }
}
