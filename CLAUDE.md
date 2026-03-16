# Place Review Analyzer

Google Maps 식당/장소 리뷰를 AI로 측면별(Food, Service, Value, Ambiance) 분석하는 크롬 확장.

## 빌드/테스트/린트

```bash
pnpm build          # Plasmo 빌드 (build/chrome-mv3-prod/)
pnpm dev            # 개발 서버 (HMR)
pnpm lint           # ESLint
pnpm format:check   # Prettier 체크
pnpm test           # vitest (클라이언트 코드)
```

Edge Function (Deno):
```bash
deno test --allow-env --allow-net supabase/functions/
supabase functions serve   # 로컬 Edge Function 서버
```

## 핵심 규칙

- **API 키를 클라이언트(확장)에 절대 포함하지 않을 것**. Claude API 키는 Supabase Edge Function secrets에만 보관.
- `PLASMO_PUBLIC_` prefix 환경변수는 빌드 시 번들에 인라인됨 — Supabase URL/anon key만 허용.
- Background Service Worker에서 Auth 조작 금지. 토큰은 popup/sidepanel에서만 관리, background는 `chrome.storage.local`에서 읽기만.

## 파일 구조 컨벤션

- `src/popup.tsx` — Popup (Plasmo 컨벤션)
- `src/sidepanel.tsx` — SidePanel
- `src/background/index.ts` — Background SW (모듈 분리)
- `src/background/handlers/*.ts` — 메시지 핸들러
- `src/contents/*.tsx` — Content Script UI (CSUI)
- `src/lib/types.ts` — 공통 타입
- `src/lib/constants.ts` — 상수
- `src/lib/scrapers/*.ts` — 사이트별 스크래퍼
- `supabase/functions/*/index.ts` — Edge Function (Deno)
