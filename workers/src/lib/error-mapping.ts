// Gemini HTTP status → errorCode 매핑 (순수 함수, 테스트 용이)
// 클라이언트는 이 errorCode를 i18n 키로 다시 매핑해 사용자에게 표시
export function geminiStatusToErrorCode(status: number): string {
  if (status === 503) return 'GEMINI_OVERLOADED'
  if (status === 429) return 'GEMINI_RATE_LIMIT'
  if (status === 404) return 'GEMINI_NOT_FOUND'
  // 5xx + 4xx(400/401 등)는 GEMINI_ERROR fallback
  // 401은 우리 Worker 키 이슈라 개발자 대응 필요 — 사용자 메시지는 errorUpstream
  return 'GEMINI_ERROR'
}
