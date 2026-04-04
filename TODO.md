# TODO: v0.3.0 게시 배포 체크리스트

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

