# Place Review Analyzer

Google Maps 장소 리뷰를 AI로 측면별(Food, Service, Value, Ambiance) 분석하는 크롬 확장.

## Free / Pro 구분

- **Free**: Aspect Scores만 표시 (블러 없음, summary + keywords 전부)
- **Pro Insights**: Highlights, Watch Out, Trend, Wait Time, Best For, Top Picks, Avoid, Tips, Review Highlights, History, Compare

## 빌드/테스트/린트

```bash
pnpm build          # Vite 빌드 (dist/) — main + content scripts 3단계
pnpm build:dev      # 개발용 빌드 (.env.development)
pnpm dev            # Vite 개발 서버
pnpm lint           # ESLint (src/ 대상)
pnpm format:check   # Prettier 체크 (src/ 대상)
pnpm test           # vitest (tests/ + workers/tests/)
```

Workers (Cloudflare):
```bash
cd workers
npx wrangler deploy --config wrangler.toml              # 프로덕션
npx wrangler deploy --config wrangler.toml --env dev    # 개발
# 타입/린트/포맷 (workers는 루트 pnpm lint에 포함 안 됨):
cd .. && npx tsc --noEmit -p workers/tsconfig.json
npx eslint workers/src/
npx prettier --check 'workers/**/*.{ts,js}'
```

## 아키텍처

- **확장**: Vite + 바닐라 JS/TS (React 없음, average-down-extension 패턴)
- **UI**: Content Script Shadow DOM 모달 (SidePanel 아님)
- **백엔드 (분석)**: Cloudflare Workers — Vercel Gemini 프록시 경유 + 사용량 + 24h 캐시 + 히스토리/비교
- **백엔드 (Gemini 프록시)**: paddle-extensions-backend (Vercel) `/api/gemini` — Cloudflare HKG 리전 차단 대응
- **백엔드 (결제)**: paddle-extensions-backend (Vercel) — 공유
- **DB**: Supabase Free (usage, analysis_history) + DB 트리거 (cleanup_old_history) + RPC (migrate_usage)
- **i18n**: en, ko, ja, zh-CN, zh-TW, de, es, fr, pt-BR, it (src/i18n/*.json + _locales/)
- **환경 분리**: `.env.development` / `.env.production` (Vite), `wrangler.toml [env.dev]` (Workers)
- **에러 분류 (v0.3.3+)**: Worker가 `errorCode` 문자열 반환 (`GEMINI_OVERLOADED`/`GEMINI_RATE_LIMIT`/`WORKERS_RATE_LIMIT`/`GEMINI_NOT_FOUND`/`GEMINI_ERROR`/`PARSE_FAILED`). 클라이언트는 503/GEMINI_ERROR에 한해 2s 대기 후 1회 자동 재시도 + "재시도 중…" UI. 최종 실패 시 코드별 i18n 메시지 + 선택적 "다시 시도" 버튼 (재시도 가능 에러에만)

## 핵심 규칙

- API 키를 클라이언트에 절대 포함하지 않을 것
- 동적 콘텐츠는 `textContent`/`createElement` 사용, `innerHTML` 금지 (XSS 방지)
- 환경 변수: `import.meta.env.VITE_*` (Plasmo의 process.env 아님)
- installId 기반 결제 (Supabase Auth 불필요)

## 파일 구조

- `popup.html` + `src/js/ui.ts` — Popup (언어선택, 구독 상태, 결제 UI)
- `src/contents/modal.ts` + `src/css/modal.css` — Shadow DOM 모달 (분석 결과 + 히스토리 + 비교)
- `src/contents/google-maps-review.ts` — Google Maps Content Script
- `src/background.js` — Service Worker (구독 체크 + 분석 + 사용량 + 히스토리 + 비교)
- `src/js/i18n.js` — 다국어 시스템
- `src/js/config.js` — API URL, 상수, storage 키
- `src/js/subscription.js` — checkout, restore(previousInstallId 이관), refreshStatus
- `src/lib/scrapers/*.ts` — 스크래퍼 (Overview 탭 전환 → h1/카테고리 추출)
- `src/contents/error-message-key.ts` — errorCode → i18n 키 매핑 (순수 함수, 테스트 대상)
- `workers/src/routes/analyze.ts` — 분석 (Gemini 프록시 경유, Pro 프롬프트 확장, errorCode 응답)
- `workers/src/routes/usage.ts` — 사용량 조회 + 이관 (migrate 파라미터)
- `workers/src/routes/history.ts` — Pro 전용 분석 히스토리
- `workers/src/routes/compare.ts` — Pro 전용 장소 비교
- `workers/src/lib/gemini.ts` — Vercel 프록시 경유 Gemini 호출 + `GeminiError` 클래스
- `workers/src/lib/error-mapping.ts` — status → errorCode 순수 함수 (테스트 대상)
- `workers/src/lib/premium.ts` — Pro 체크 (1분 캐시, skipCache 옵션)
- `workers/tsconfig.json` — workers 전용 TS 설정 (루트 tsconfig는 workers 제외)
- `tests/contents/error-message-key.test.ts`, `workers/tests/error-code-mapping.test.ts` — 자동 테스트

## TODO

- **운영 모니터링 자체 알림 (Slack or Telegram)**: Workers에서 Gemini 429/503 발생 시 Supabase `error_events` 테이블에 fire-and-forget 적재 → 임계치(예: 10분 내 N건) 초과 시 Slack webhook 또는 Telegram Bot API로 푸시. 중복 알림 방지(직전 1시간 내 동일 errorCode면 스킵). Tier 1이어도 Google은 자동 알림을 보내지 않음. (관련 계획: `C:\Users\Administrator\.claude\plans\inherited-waddling-thunder.md` 범위 밖 항목)

- **i18n 키 네이밍 컨벤션 도입**: 현재 프로젝트는 도메인별 prefix 컨벤션 없음. `networkError`(popup checkout용), `errorNetwork`(분석 플로우용), `errorOverloaded`/`errorRateLimit` 등 접미어/접두어 혼재. 일관된 `error_<domain>_<reason>` 형식(예: `errorCheckoutNetwork`, `errorAnalyzeNetwork`) 도입 검토. 리팩터 부담 있으므로 후속 과제.
