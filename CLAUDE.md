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
pnpm lint           # ESLint
pnpm format:check   # Prettier 체크
pnpm test           # vitest
```

Workers (Cloudflare):
```bash
cd workers
npx wrangler deploy --config wrangler.toml              # 프로덕션
npx wrangler deploy --config wrangler.toml --env dev    # 개발
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
- `workers/src/routes/analyze.ts` — 분석 (Gemini 프록시 경유, Pro 프롬프트 확장)
- `workers/src/routes/usage.ts` — 사용량 조회 + 이관 (migrate 파라미터)
- `workers/src/routes/history.ts` — Pro 전용 분석 히스토리
- `workers/src/routes/compare.ts` — Pro 전용 장소 비교
- `workers/src/lib/gemini.ts` — Vercel 프록시 경유 Gemini 호출
- `workers/src/lib/premium.ts` — Pro 체크 (1분 캐시, skipCache 옵션)
