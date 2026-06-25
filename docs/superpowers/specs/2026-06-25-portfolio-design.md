# finote — 주식 포트폴리오(서브프로젝트 A) 설계 스펙

**작성일:** 2026-06-25
**프로젝트:** `finote` (`~/work/toy/finote`)
**서브프로젝트:** A. 주식 포트폴리오
**상태:** 설계 확정

---

## 0. 전체 프로젝트 맥락

기존에 Google 스프레드시트로 관리하던 가구(부부) 자산을, 앱+웹에서 접근 가능한 크로스플랫폼 서비스로 포팅·업그레이드한다. 스프레드시트가 너무 넓어 한 번에 만들지 않고 서브프로젝트로 분할하여 순차 구현한다.

```
A. 주식 포트폴리오   ← 토스 Open API 연동 (본 문서)
        │ (자산 데이터 공급)
        ▼
B. 대시보드          ← 2~5 통합 (주식·저축/현금·연금·부동산 → 순자산)
        │
        ▼
D. 통장쪼개기        ← 월 급여 배분
        │
        ▼
C. 가계부            ← 월별 수입/지출
```

각 서브프로젝트는 독립된 spec → plan → implementation 사이클을 가진다. 본 문서는 **A(주식 포트폴리오)** 만 다룬다. A의 데이터 모델은 B(대시보드)가 위에 쌓일 것을 염두에 두고 설계한다.

---

## 1. 개요 & 범위

토스증권 Open API로 **본인 주식 계좌를 자동 동기화**하고, 타 증권사·배우자 보유분은 **수동 입력**하여, 통합 포트폴리오(수익률·섹터/종목 비율·원화 환산)를 웹+PWA에서 본다. **일별 스냅샷**으로 추이 데이터를 축적해 다음 단계(B 대시보드)에 공급한다.

### 범위 IN

- 토스 API 자동 보유 종목 동기화 (본인 계좌)
- 수동 보유 종목 CRUD (타 증권사·배우자·연금) — **수동 종목도 현재가/평가금/수익률 반영** (토스 시세 API로 임의 종목 조회)
- 가격 갱신: 수동 버튼 + 자동 주기(클라이언트 폴링) + 일별(스케줄러). AUTO·MANUAL **모든** 보유 종목 대상
- 수익률·평가금·섹터별 비율·종목별 비율 계산
- USD → KRW 환산 (토스 exchange-rate)
- 일별 스냅샷 자동 저장
- API 자격증명(client_id/secret)을 **앱 UI에서 입력**, **다중 프리셋** 관리
- 단일 계정 로그인 (나만)

### 범위 OUT (이번 미구현 / 후속)

- 주문·매매 기능 (토스 orders API)
- 배우자 토스 계좌 **자동** 연동 → 단, "프리셋 추가"만으로 동작하도록 설계 (코드 변경 불필요)
- 저축·현금·연금·부동산 (B 대시보드에서)
- 푸시 알림
- 앱스토어/플레이스토어 네이티브 앱 배포 (PWA로 시작, 추후 Capacitor 래핑 가능)

---

## 2. 기술 스택 & 아키텍처

| 영역 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | Next.js (App Router) / TypeScript | 웹 UI + Route Handlers 백엔드 동거 (풀스택) |
| 앱/웹 | PWA (manifest + service worker) | 단일 UI 코드베이스로 웹+설치형 앱 모두 커버 |
| DB | **Supabase** (PostgreSQL) + Prisma | 풀링 필요 → pgbouncer 경유 |
| 호스팅 | **Vercel** | 서버리스 |
| 스케줄러 | Vercel Cron (일 1회) | Hobby 플랜 제약 반영 (아래 4-3) |
| UI 스타일 | 토스st 비주얼을 `frontend-design` 스킬로 직접 구현 | TDS 라이브러리는 외부 사용 불가 (4-4 참조) |
| 상태 | Zustand (클라 상태) + React Query (서버 데이터) | |

### 2-1. 모듈 경계

각 모듈은 단일 책임을 가지며 독립적으로 테스트 가능하다.

| 모듈 | 역할 | 입력 → 출력 |
|---|---|---|
| `toss-client` | 토큰 매니저 + accounts/holdings/prices/exchange-rate 호출 | 자격증명 → 정규화 DTO |
| `crypto` | 시크릿/토큰 암복호화 | 평문 ↔ 암호문 (env 키 사용) |
| `portfolio-service` | AUTO+MANUAL 병합, 섹터 매핑, KRW 환산, 비율 계산 | 원천 데이터 → 통합 뷰모델 |
| `snapshot-service` | 일별 평가금/수익률 스냅샷 저장·조회 | 뷰모델 → DailySnapshot |
| `sector-map` | symbol → 섹터 매핑 (시드 + 수동 override) | symbol → sector |

`portfolio-service`의 계산 로직(병합·환산·비율)은 **순수 함수**로 분리하여 테스트 용이성을 확보한다.

---

## 3. 데이터 모델 (Prisma)

```
Member            가구 구성원 (나 / 배우자)
  - id, name

Connection        자산 연결 (토스 API 또는 수동), "프리셋"
  - id, memberId, type(TOSS_API | MANUAL), label(예: "내 토스", "미래에셋")
  - clientId            (TOSS_API only)
  - clientSecretEnc     (TOSS_API only, 암호화 저장)
  - accountSeqs[]        (TOSS_API, 동기화 시 발견)
  - createdAt, updatedAt

TokenCache        토스 access token 캐시 (서버리스 대응 → DB 보관)
  - connectionId(unique), accessTokenEnc, expiresAt

Holding           보유 종목
  - id, connectionId, market, symbol, name, sector
  - currency(KRW | USD), quantity(Decimal), avgBuyPrice(Decimal)
  - source(AUTO | MANUAL), updatedAt

PriceCache        종목 현재가 캐시  (unique: symbol + currency)
  - symbol, currency, lastPrice(Decimal), prevClose(Decimal?), asOf

FxRate            환율
  - pair("USDKRW"), rate(Decimal), asOf

DailySnapshot     일별 포트폴리오 스냅샷
  - date(unique), totalCostKrw, totalValueKrw, totalPnlKrw, returnPct
  - bySectorJson, byHoldingJson
```

### 설계 노트

- **다중 프리셋**: `Connection`을 N개 등록 가능. 배우자 토스 연동은 향후 `TOSS_API` Connection 추가만으로 완성된다.
- **시크릿 보안**: `clientSecretEnc`, `accessTokenEnc`는 평문 저장 금지. 앱 단 암호화 키(env: `ENCRYPTION_KEY`)로 AES 암호화하여 저장, 사용 시 복호화. 단일 사용자 앱이므로 키 로테이션은 후순위 — 키 분실 시 시크릿 재입력으로 복구(데이터 손실 없음, 자격증명만 재등록).
- **현재가 (AUTO+MANUAL 공통)**: `/api/v1/prices`(MARKET_DATA)로 모든 보유 종목의 현재가를 받아 `PriceCache`에 저장. 평가금·수익률은 `portfolio-service`가 PriceCache 기준으로 계산하므로 수동 종목도 동일하게 반영된다.
- **일간손익(daily P&L)**: AUTO 종목은 토스 holdings API의 `dailyProfitLoss`(항목·요약 단위)를 그대로 사용. MANUAL 종목은 `PriceCache.prevClose` 기준으로 계산하며, prevClose가 없으면 일간손익은 표시 생략. prevClose 출처(`/api/v1/candles` 직접 조회 vs 일별 cron이 종가를 PriceCache에 이월)는 plan 단계에서 확정. 화면 요약의 일간손익은 표시 가능한 항목들의 합.
- **토큰 캐시 in DB**: Vercel 서버리스는 인메모리 캐시가 호출 간 유지되지 않으므로 토큰을 DB에 보관. 토스는 "client당 유효 토큰 1개, 재발급 시 이전 토큰 즉시 무효" → connectionId 단위 단일 토큰 매니저로 만료 시 재발급.
- **섹터**: 토스 holdings/StockInfo 응답에 섹터 정보가 없음 → `sector-map`으로 직접 관리. 기존 stock-scraper의 `SECTOR_MAP`을 시드로 재활용, 신규 종목은 "미분류" 후 수동 분류.
- **자동 holdings upsert**: 동기화 시 `source=AUTO` 종목을 connectionId+symbol 기준 upsert. 수동(`MANUAL`) 종목은 사용자 편집만 반영.

---

## 4. 데이터 흐름

### 4-1. 갱신 (수동 버튼 / 스케줄러)

1. `toss-client`: connection별 토큰 확보 (DB 캐시 확인 → 만료 시 재발급)
2. `GET /api/v1/accounts` → accountSeq 목록
3. accountSeq별 `GET /api/v1/holdings` (`X-Tossinvest-Account` 헤더) → `Holding`(source=AUTO) upsert
4. **AUTO+MANUAL 전체 보유 종목의 distinct symbol 수집** → `GET /api/v1/prices?symbols=...` (`MARKET_DATA`, 계좌 헤더 불필요, 최대 200개/요청 배치) → `PriceCache` 갱신. 이로써 **수동 종목도 현재가 반영**
5. `GET /api/v1/exchange-rate` → USDKRW → `FxRate` 갱신
6. `portfolio-service`: AUTO+MANUAL 병합 → 섹터 매핑 → KRW 환산 → 비율 계산 → 뷰모델
7. (스케줄러 일 1회) `snapshot-service`: 당일 `DailySnapshot` 저장 (date unique → upsert)

> **시세 의존성**: `/api/v1/prices`는 토스 OAuth 토큰을 요구한다(계좌 헤더는 불필요). 따라서 시세 갱신에는 **최소 1개의 `TOSS_API` Connection이 필요**하다. 토스 Connection이 하나도 없으면 수동 종목은 사용자가 현재가를 직접 입력하는 폴백으로 동작한다.

### 4-2. 조회 (화면 로드)

최신 `Holding` + `PriceCache` + `FxRate`로 뷰모델 계산 후 렌더. "마지막 갱신 시각" 표시.

### 4-3. 갱신 트리거 전략 (Vercel 제약 반영)

Vercel Hobby cron은 하루 1회 제한이므로 역할을 분리한다.

- **수동 갱신**: 버튼 → API Route 호출 (즉시 토스 동기화)
- **자동 주기**: 앱이 열려있는 동안 React Query가 장중 N분마다 refetch (서버 cron 불필요, "실시간감" 확보)
- **일별 스냅샷**: Vercel Cron 1일 1회 (Hobby 플랜 OK)
- (선택) 장중 서버측 자동 갱신이 필요하면 외부 무료 cron(cron-job.org / GitHub Actions)으로 API Route를 주기 호출 — 후속 옵션

### 4-4. 디자인 & UX 라이팅 — 토스st

> **단일 출처(SSOT):** 디자인 토큰(색·타이포·radius·spacing·컴포넌트)과 UX 라이팅 규칙은 프로젝트 루트의 **[`DESIGN.md`](../../../DESIGN.md)** 에 getdesign.md 형식으로 정의되어 있다. AI 코딩 에이전트(Claude Code/Cursor)가 자동 참조한다. 아래는 요약이며, 구현 시 항상 `DESIGN.md`를 기준으로 한다.

TDS 라이브러리는 사용 불가("앱인토스 미니앱 전용, 외부 웹/PWA 금지, 모든 IP 토스 귀속", npm 미배포)지만, **비주얼 스타일과 UX 라이팅 원칙(일반 가이드)은 차용 가능**하다. `frontend-design` 스킬로 토스st UI를 직접 구현하고, 모든 카피는 아래 라이팅 규칙을 따른다.

**비주얼 스타일**
- 포인트 컬러: 토스 블루 `#3182F6` (수익=빨강/상승, 손실=파랑/하락은 한국 증시 관례 — 빨강=플러스, 파랑=마이너스)
- 넉넉한 여백, 둥근 카드(radius 크게), 굵은 숫자로 금액·수익률 강조, 미니멀한 흑백 베이스 + 포인트 컬러
- 카드 기반 레이아웃, 큰 타이포 위계

**UX 라이팅 규칙** (출처: 토스 UX writing 가이드)
- **해요체 통일** — 모든 문구는 해요체. 과도한 경어(`~시겠어요?`, `~께`) 지양
- **능동형 우선** — "조회됐어요" → "조회했어요", 과거 연결어 `~었` 최소화
- **긍정형** — "안 돼요" 대신 "~하면 할 수 있어요". 부정형은 정책상 불가 등 필수 상황만
- **에러 메시지** — 문제 + 해결 방법을 긍정형으로 제시 (예: "토스 연동에 실패했어요. 설정에서 API 키를 다시 확인해 주세요.")
- **다이얼로그 버튼** — 왼쪽 버튼은 "취소"가 아닌 **"닫기"**로 통일
- **표기** — `되어요`→`돼요`(공간 절약), `{명사}+{명사}` 나열 구조 지양
- **금액/숫자** — 천 단위 콤마, 통화 기호 명시(`₩`, `$`), 수익률은 `+`/`-` 부호와 색으로 강조

---

## 5. 화면 (MVP)

### 5-1. 포트폴리오 메인

- 상단 요약: 총평가금(KRW) · 총수익률 · 일간손익
- 섹터별 비율 (도넛 차트)
- 종목별 비율
- 보유 종목 테이블: 시장 / 증권사(label) / 종목 / 수량 / 매수가 / 현재가 / 평가금 / 수익률
  - KRW 통합 표기 + 원통화 병기 (USD 종목)
- 갱신 버튼 + 마지막 갱신 시각

### 5-2. 수동 보유 관리

- 보유 종목 추가 / 수정 / 삭제 (MANUAL connection 대상)
- 필드: 증권사(connection), 시장, 종목명, symbol, 섹터, 통화, 수량, 매수가
- 입력한 symbol은 다음 시세 갱신 시 `/api/v1/prices` 대상에 자동 포함되어 현재가·평가금·수익률이 채워진다 (저장 직후 즉시 1회 갱신 트리거)

### 5-3. 설정 — API 프리셋 관리

- 토스 API 프리셋(Connection) 추가/수정/삭제
- 입력: label, 구성원(Member), client_id, client_secret
- client_secret은 입력 후 마스킹, 저장 시 암호화

### 5-4. (후속 placeholder) 추이 그래프

`DailySnapshot` 기반 수익률·자산 성장 그래프 — B 대시보드에서 본격 활용.

---

## 6. 에러 처리

- **토큰 만료/무효**: 401 감지 시 재발급 후 1회 재시도
- **Rate limit (429)**: 지수 백오프 재시도
- **부분 실패 격리**: 한 connection/계좌 실패해도 나머지는 정상 표시 + 해당 항목에 경고 표시
- **API 다운**: 마지막 `PriceCache`/`Holding`로 표시 + 상단 경고 배너 ("토스 동기화 실패, 마지막 갱신: …")
- **환율 조회 실패**: 직전 `FxRate` 사용
- **자격증명 오류**: 설정 화면에서 명확한 에러 메시지 (잘못된 client_id/secret)

---

## 7. 테스트 (TDD)

- **`portfolio-service` (핵심)**: 병합·섹터 매핑·KRW 환산·비율 계산 순수 함수 단위 테스트. AUTO+MANUAL 혼합, USD/KRW 혼합, 미분류 섹터, 일간손익(AUTO=토스값 / MANUAL=prevClose 기반 / prevClose 없음=생략) 케이스 포함.
- **`toss-client`**: 토스 응답 목킹 — 토큰 캐시/재발급(401), 429 백오프, 부분 실패.
- **`crypto`**: 암복호화 라운드트립.
- **`snapshot-service`**: date unique 보장 (하루 1행, 재실행 시 upsert).

---

## 8. 열린 항목 (구현 단계에서 확정)

- 인증 방식 세부: 단일 계정이므로 Auth.js single-user vs 단순 비밀번호 — plan 단계에서 결정
- Supabase 연결 풀링 구성 (Prisma + Supabase pooler URL) 세부
- PWA 아이콘/매니페스트 에셋
- 토스 API rate limit 그룹별 정확한 한도 (구현 시 실측)
