# TODO: v0.3.0 게시 배포 체크리스트

## ⚠️ 다음 배포 전 필수 확인 — 2026-10-28 툴체인 일괄 업데이트 이후 첫 배포

2026-10-28에 개발 의존성을 전부 최신으로 올렸다 (TS 6.0.3, **Vite 6 → 8 (번들러가 Rollup → Rolldown으로 교체)**, Vitest 5, ESLint 10, jsdom 30, @types/chrome 0.3, wrangler 4.154). 의존성은 전부 devDependencies라 **아직 배포된 확장/워커에는 아무 영향이 없다**. 새 툴체인으로 빌드된 산출물은 다음 배포 때 처음 사용자에게 나간다. 자동 검증(빌드·테스트 56개·lint·typecheck)과 산출물 전후 비교는 끝났지만, Rolldown 출력물은 기존과 다른 코드라 **수동 스모크 테스트가 한 번 필요하다**.

### 확장 (CWS 제출 전)
- [ ] `pnpm build` → `chrome://extensions`에서 "압축해제된 확장 프로그램 로드"로 `dist/` 로드
- [ ] 팝업: 언어 선택 변경, 구독 상태 배지, 사용량 표시, 업그레이드 패널 열림 확인
- [ ] Google Maps 장소 페이지: 분석 버튼 노출 → 분석 실행 → 모달에 Aspect Scores 렌더링 확인
- [ ] Pro 계정이면 Highlights/Trend 등 Pro Insights + 히스토리/비교 모달 열림 확인
- [ ] 언어 변경 후 모달·버튼 텍스트가 즉시 바뀌는지 확인 (storage onChanged 경로 — 이번에 타입 가드 추가한 부분)
- [ ] 에러 경로: 네트워크 끊고 분석 → 에러 메시지 + "다시 시도" 버튼 확인

### Workers (`wrangler deploy` 전)
- [ ] `cd workers && npx wrangler deploy --dry-run` 으로 번들 생성 확인 (업데이트 당시 기존 번들과 14바이트 차이, 사실상 동일)
- [ ] dev 환경에 먼저 배포 (`--env dev`) → `/usage`, `/analyze` 호출 확인 후 prod 배포

### 문제 생기면
- Vite 8 쪽 문제로 의심되면 `pnpm add -D vite@6 vitest@3` 으로 되돌려 빌드 비교. 나머지 패키지는 산출물에 영향 없음
- 확인 끝나면 이 섹션은 삭제

---

## 현재 상태
- **v0.2.0**: CWS 심사/게시 대기 중
- **v0.3.0**: 코드 완료, main 머지됨, CWS zip 준비됨 (`place-review-analyzer.zip`)
- **프로덕션 Workers**: v1/5/100으로 0.2.0 호환 배포 중 (Gemini 프록시 + migrate-usage 포함)
- **dev Workers**: v2/3/50 배포 완료

## v0.3.0 게시 확정 시 (순서 중요!)

### 1. Paddle 프로덕션 Price 생성
- [ ] Paddle 프로덕션 대시보드에서 새 Price 생성
  - Monthly: $5.99/mo
  - Annual: $49.99/yr
- [ ] 기존 Price ($3.99/$29.99) 아카이브 (기존 구독자는 유지됨)

### 2. paddle-extensions-backend 배포
- [ ] `prices.js`에 새 Price ID 교체 (review_analyzer 앱)
- [ ] Vercel 프로덕션 배포
- [ ] `/api/gemini` 엔드포인트에 `GEMINI_API_KEY` 환경변수 확인 (이미 설정됨)

### 3. Workers 프로덕션 재배포
- [ ] `workers/wrangler.toml` 프로덕션 vars 변경:
  ```
  PROMPT_VERSION = "v2"
  FREE_DAILY_LIMIT = "3"
  PRO_DAILY_LIMIT = "50"
  ```
- [ ] 배포: `npx wrangler deploy -c workers/wrangler.toml`
- [ ] 배포 후 확인: `curl -s "https://place-review-api.uihyun-jung.workers.dev/usage" -H "X-Device-ID: 00000000-0000-4000-8000-000000000001"` → limit=3 확인

### 4. CWS v0.3.0 게시
- [ ] CWS에서 0.3.0 게시 버튼 클릭

### 5. 배포 후 검증
- [ ] 프로덕션에서 분석 실행 → 성공 확인
- [ ] Free 한도 3회 확인
- [ ] Pro 결제 → $5.99 가격 확인
- [ ] 구매복원 → 사용량 이관 확인

---

## 주의사항

### Workers 배포 타이밍
- 0.2.0이 게시된 상태에서 Workers를 v2/3/50으로 배포하면 **한도 불일치** 발생
  - 0.2.0 popup: "0/5" 표시 → 서버는 3회에서 차단
- **반드시 CWS 0.3.0 게시와 동시에 Workers 재배포**

### Gemini API 리전 이슈
- Cloudflare Workers가 HKG 엣지로 라우팅되면 Gemini API 400 에러 (홍콩 미지원)
- Vercel 프록시(`/api/gemini`)로 경유하여 해결됨
- Workers `wrangler.toml`에 `[placement] mode = "smart"` 설정 포함

### Supabase
- `cleanup_old_history` 트리거: INSERT 시 device당 20개 초과 자동 삭제
- `migrate_usage` RPC: 구매복원 시 이전 installId 사용량을 새 installId로 이관
- `analysis_history.id`는 UUID 타입 (integer 아님)

### Paddle
- 기존 구독자는 현재 가격($3.99/$29.99) 유지, 신규만 $5.99/$49.99 적용
- Statement descriptor: `N.R. LAB` (또는 설정한 값)
- Business name: Nooroong Lab

---

## v0.3.0 변경 요약
- 가격: $3.99→$5.99/mo, $29.99→$49.99/yr
- 한도: Free 5→3회/일, Pro 100→50회/일
- Free: Aspect Scores만 (블러 없음, summary + keywords 전부 표시)
- Pro Insights: Highlights, Watch Out, Trend, Best For, Top Picks, Avoid, Tips, Review Highlights, 히스토리, 장소 비교
- Gemini API: Vercel 프록시 경유 (HKG 차단 대응)
- 스크래퍼: Overview 탭 전환 → Sponsored h1 회피
- 구매복원 시 사용량 이관 (previousInstallId)
- 버그 수정: 언어변경 사용량, exceeded 리셋, 구독 캐시 지연 등

