# Place Review Analyzer

Google Maps/네이버 Place 식당·장소 리뷰를 AI로 측면별(Food, Service, Value, Ambiance) 분석하는 크롬 확장.

## 빌드/테스트/린트

```bash
pnpm build          # Vite 빌드 (dist/) — main + content scripts 3단계
pnpm dev            # Vite 개발 서버
pnpm lint           # ESLint
pnpm format:check   # Prettier 체크
pnpm test           # vitest
```

Workers (Cloudflare):
```bash
cd workers
npx wrangler deploy --config wrangler.toml
```

## 아키텍처

- **확장**: Vite + 바닐라 JS/TS (React 없음, average-down-extension 패턴)
- **백엔드 (분석)**: Cloudflare Workers — Claude API 프록시 + 사용량
- **백엔드 (결제)**: paddle-extensions-backend (Vercel) — 공유
- **DB**: Supabase Free (usage, analysis_history)
- **i18n**: en, ko, ja, zh-CN, zh-TW (src/i18n/*.json + _locales/)

## 핵심 규칙

- API 키를 클라이언트에 절대 포함하지 않을 것
- 동적 콘텐츠는 `textContent`/`createElement` 사용, `innerHTML` 금지 (XSS 방지)
- 환경 변수: `import.meta.env.VITE_*` (Plasmo의 process.env 아님)
- installId 기반 결제 (Supabase Auth 불필요)

## 파일 구조

- `popup.html` + `src/js/ui.ts` — Popup
- `sidepanel.html` + `src/js/sidepanel.ts` — SidePanel
- `src/background.js` — Service Worker (구독 체크 + 분석 + 사용량)
- `src/contents/*.ts` — Content Scripts (IIFE 빌드)
- `src/js/i18n.js` — 다국어 시스템
- `src/js/config.js` — API URL, 상수, storage 키
- `src/js/subscription.js` — checkout, restore, refreshStatus
- `src/lib/scrapers/*.ts` — 스크래퍼 (기존 유지)
- `workers/` — Cloudflare Workers
