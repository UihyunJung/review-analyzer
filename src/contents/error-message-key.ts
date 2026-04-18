// errorCode → i18n 키 매핑 (순수 함수, 테스트 가능하도록 분리)
// 이 파일은 chrome API 같은 런타임 의존성을 포함하지 않음
export function getErrorMessageKey(errorCode: string | undefined): string {
  const map: Record<string, string> = {
    GEMINI_OVERLOADED: 'errorOverloaded',
    GEMINI_RATE_LIMIT: 'errorRateLimit',
    WORKERS_RATE_LIMIT: 'errorRateLimit',
    GEMINI_NOT_FOUND: 'errorNotFound',
    GEMINI_ERROR: 'errorUpstream',
    PARSE_FAILED: 'errorParseFailed',
    NETWORK_ERROR: 'errorNetwork'
  }
  return map[errorCode ?? ''] ?? 'analysisFailed'
}
