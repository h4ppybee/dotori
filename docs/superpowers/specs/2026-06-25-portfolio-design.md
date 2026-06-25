# dotori — 주식 포트폴리오(서브프로젝트 A) 설계 스펙

**작성일:** 2026-06-25
**프로젝트:** `dotori` (`~/work/toy/finote`)
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

> **로컬 우선(local-first) 아키텍처:** 자산 데이터(보유 종목·평가금·스냅샷·자격증명)는 **브라우저 로컬(IndexedDB)에만 저장**하며 어떤 서버 DB에도 남기지 않는다. 토스 API 호출만 **무상태(stateless) 프록시**로 중계하고 프록시는 아무것도 저장하지 않는다. 기기 간 이동·백업·공유는 **JSON 내보내기/불러오기**로 한다. (상세 4-5 프라이버시)

### 범위 IN

- 토스 API 자동 보유 종목 동기화 (본인 계좌)
- 수동 보유 종목 CRUD (타 증권사·배우자·연금) — **수동 종목도 현재가/평가금/수익률 반영** (토스 시세 API로 임의 종목 조회)
- 가격 갱신: 수동 버튼 + 자동 주기(클라이언트 폴링) + 일별(스케줄러). AUTO·MANUAL **모든** 보유 종목 대상
- 수익률·평가금·섹터별 비율·종목별 비율 계산
- USD → KRW 환산 (토스 exchange-rate)
- 일별 스냅샷 자동 저장 (클라이언트 측, 앱 열릴 때 하루 1회)
- API 자격증명(client_id/secret)을 **앱 UI에서 입력**, **다중 프리셋** 관리 (로컬 암호화 저장)
- **JSON 내보내기/불러오기** (백업·기기 이동·공유)
- 로컬 패스프레이즈로 앱 잠금 + 자격증명 암호화 (서버 로그인 없음)

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
| 프레임워크 | Next.js (App Router) / TypeScript | UI + 무상태 프록시 Route Handlers 동거 |
| 앱/웹 | PWA (manifest + service worker) | 단일 UI 코드베이스로 웹+설치형 앱 모두 커버 |
| **데이터 저장** | **브라우저 IndexedDB** (Dexie 권장) | 모든 자산 데이터 로컬 보관. 서버 DB 없음 |
| **백엔드** | **무상태 토스 프록시** (Vercel Function) | 토큰 교환·토스 호출 중계만, 저장 0 |
| 호스팅 | **Vercel** | 서버리스, DB 미사용 |
| 스케줄러 | **클라이언트 측** (앱 열릴 때 하루 1회 스냅샷) | 서버 cron 없음 (서버에 데이터 없음) |
| 암호화 | **Web Crypto API** (패스프레이즈 → 키 파생) | 자격증명 로컬 암호화 (4-5) |
| UI 스타일 | 토스st — 루트 `DESIGN.md` 기준 (`frontend-design`) | TDS 라이브러리 외부 사용 불가 (4-4) |
| 상태 | Zustand (앱 상태) + React Query (로컬/프록시 비동기) | |

### 2-1. 모듈 경계

각 모듈은 단일 책임을 가지며 독립적으로 테스트 가능하다. `toss-proxy`만 서버(무상태), 나머지는 모두 클라이언트.

| 모듈 | 위치 | 역할 | 입력 → 출력 |
|---|---|---|---|
| `toss-proxy` | 서버(무상태) | 자격증명+파라미터를 받아 토스 토큰 교환·accounts/holdings/prices/exchange-rate 호출 후 정규화 DTO 반환. **저장 없음** | 자격증명·파라미터 → 정규화 DTO |
| `local-store` | 클라이언트 | IndexedDB CRUD (connections·holdings·priceCache·fx·snapshots·settings) | — |
| `crypto` | 클라이언트 | 패스프레이즈 파생 키로 자격증명·토큰 암복호화 | 평문 ↔ 암호문 |
| `toss-token` | 클라이언트 | 로컬 토큰 캐시 관리(만료 시 프록시로 재발급 요청) | 자격증명 → 유효 토큰 |
| `portfolio-service` | 클라이언트 | AUTO+MANUAL 병합, 섹터 매핑, KRW 환산, 비율 계산 | 원천 데이터 → 통합 뷰모델 |
| `snapshot-service` | 클라이언트 | 일별 스냅샷 저장·조회 (앱 열릴 때 하루 1회) | 뷰모델 → DailySnapshot |
| `backup` | 클라이언트 | 전체 로컬 데이터 JSON 내보내기/불러오기 | IndexedDB ↔ JSON 파일 |
| `sector-map` | 클라이언트 | symbol → 섹터 매핑 (시드 + 수동 override, IndexedDB) | symbol → sector |

`portfolio-service`의 계산 로직(병합·환산·비율)은 **순수 함수**로 분리하여 테스트 용이성을 확보한다.

---

## 3. 데이터 모델 (IndexedDB — 클라이언트 로컬)

모든 스토어는 브라우저 IndexedDB에 저장된다(Dexie 권장). 서버 DB는 없다. 아래는 object store 단위.

```
member            가구 구성원 (나 / 배우자)
  - id, name

connection        자산 연결 (토스 API 또는 수동), "프리셋"
  - id, memberId, type(TOSS_API | MANUAL), label(예: "내 토스", "미래에셋")
  - clientId            (TOSS_API only)
  - clientSecretEnc     (TOSS_API only, Web Crypto 암호화)
  - accountSeqs[]        (TOSS_API, 동기화 시 발견)
  - createdAt, updatedAt

tokenCache        토스 access token 로컬 캐시
  - connectionId(key), accessTokenEnc, expiresAt

holding           보유 종목
  - id, connectionId, market, symbol, name, sector
  - currency(KRW | USD), quantity, avgBuyPrice
  - source(AUTO | MANUAL), updatedAt
  - manualPrice?, manualPriceAsOf?   (MANUAL 전용 폴백: 토스 connection이 없어 시세 자동 조회가 불가할 때 사용자가 입력한 현재가)

priceCache        종목 현재가 캐시  (key: symbol + currency)
  - symbol, currency, lastPrice, prevClose?, asOf

fxRate            환율
  - pair("USDKRW"), rate, asOf

dailySnapshot     일별 포트폴리오 스냅샷  (key: date)
  - date, totalCostKrw, totalValueKrw, totalPnlKrw, returnPct
  - bySectorJson, byHoldingJson

settings          앱 설정 / 잠금 메타
  - id, kdfSalt, verifier(패스프레이즈 검증용), lastSnapshotDate, schemaVersion
```

### 설계 노트

- **다중 프리셋**: `connection`을 N개 등록 가능. 배우자 토스 연동은 향후 `TOSS_API` connection 추가만으로 완성된다.
- **자격증명 암호화 (로컬)**: `clientSecretEnc`, `accessTokenEnc`는 평문 저장 금지. 사용자 **패스프레이즈에서 Web Crypto(PBKDF2/Argon2 → AES-GCM)로 키를 파생**해 암호화한다. 키/패스프레이즈는 어디에도 전송하지 않는다. 패스프레이즈 분실 시 자격증명만 재입력(보유 데이터 손실 없음). `settings.verifier`로 패스프레이즈 정확성 검증.
- **현재가 (AUTO+MANUAL 공통)**: 프록시의 `/prices`(토스 MARKET_DATA) 호출로 모든 보유 종목 현재가를 받아 `priceCache`에 저장. 평가금·수익률은 `portfolio-service`가 priceCache 기준으로 계산하므로 수동 종목도 동일하게 반영된다.
- **일간손익(daily P&L)**: AUTO 종목은 토스 holdings의 `dailyProfitLoss`를 그대로 사용. MANUAL 종목은 `priceCache.prevClose` 기준 계산, prevClose가 없으면 표시 생략. prevClose 출처(`/candles` vs 전일 종가를 클라이언트가 이월 저장)는 plan에서 확정.
- **토큰 캐시 (로컬)**: 무상태 프록시는 토큰을 보관하지 않으므로 `tokenCache`에 로컬 저장. 토스는 "client당 유효 토큰 1개, 재발급 시 이전 토큰 즉시 무효" → connectionId 단위로 만료 시 프록시에 재발급 요청.
- **섹터**: 토스 holdings/StockInfo에 섹터 없음 → `sector-map`으로 직접 관리. 기존 stock-scraper의 `SECTOR_MAP`을 시드로 재활용, 신규 종목은 "미분류" 후 수동 분류.
- **자동 holdings upsert**: 동기화 시 `source=AUTO` 종목을 connectionId+symbol 기준 upsert. 수동(`MANUAL`) 종목은 사용자 편집만 반영.

---

## 4. 데이터 흐름

### 4-1. 갱신 (수동 버튼 / 클라이언트 주기)

모든 단계는 **클라이언트가 주도**하고, 토스 호출만 프록시를 경유한다. 자산 데이터는 IndexedDB에만 기록된다.

1. 클라이언트: `local-store`에서 connection 로드 → `crypto`로 `clientSecretEnc` 복호화(메모리 한정)
2. 클라이언트: `toss-token`이 유효 토큰 확인 → 없으면 프록시 `POST /api/toss/token`(자격증명 전달)로 발급 → `tokenCache`에 로컬 저장
3. 프록시 경유 `accounts` → accountSeq 목록
4. accountSeq별 프록시 경유 `holdings`(`X-Tossinvest-Account`) → `holding`(source=AUTO) upsert (IndexedDB)
5. **AUTO+MANUAL 전체 distinct symbol 수집** → 프록시 경유 `prices`(MARKET_DATA, 최대 200/요청 배치) → `priceCache` 갱신. **수동 종목도 현재가 반영**
6. 프록시 경유 `exchange-rate` → USDKRW → `fxRate` 갱신
7. `portfolio-service`: AUTO+MANUAL 병합 → 섹터 매핑 → KRW 환산 → 비율 → 뷰모델
8. `snapshot-service`: 오늘자 스냅샷이 없으면(`settings.lastSnapshotDate` 비교) `dailySnapshot` 1건 저장

> **무상태 프록시 계약**: 프록시는 요청마다 자격증명/토큰을 받아 토스를 호출하고 결과만 돌려준다. **요청 본문·자격증명·응답을 로그/저장하지 않는다.** HTTPS 전송 중에만 존재.

> **시세 의존성**: `prices`는 토스 OAuth 토큰을 요구한다(계좌 헤더 불필요). 시세 갱신에는 **최소 1개의 `TOSS_API` connection이 필요**하다. 토스 connection이 없으면 수동 종목은 `holding.manualPrice`(사용자 입력 현재가)로 평가금을 계산하는 폴백으로 동작한다. 토스 시세가 있는 종목은 `priceCache`가 우선한다.

> **프록시 라우트 컨벤션**: 우리 프록시 엔드포인트는 `/api/toss/*` 네임스페이스를 쓴다(`/api/toss/token`, `/api/toss/accounts`, `/api/toss/holdings`, `/api/toss/prices`, `/api/toss/exchange-rate`). 본 문서에서 `accounts`/`holdings`/`prices`는 그 프록시가 호출하는 **토스 측 엔드포인트**를 가리키는 이름이다.

### 4-2. 조회 (화면 로드)

IndexedDB의 `holding` + `priceCache` + `fxRate`로 뷰모델 계산 후 렌더. "마지막 갱신 시각" 표시.

### 4-3. 갱신 트리거 전략 (로컬 우선)

서버에 데이터가 없으므로 모든 트리거는 클라이언트 측이다.

- **수동 갱신**: 버튼 → 4-1 실행
- **자동 주기**: 앱이 열려있는 동안 React Query가 장중 N분마다 4-1 refetch ("실시간감")
- **일별 스냅샷**: 앱 진입 시 `lastSnapshotDate`가 오늘이 아니면 4-1 후 스냅샷 1건 저장. (앱을 연 날에만 기록 — 매일 자동 기록 아님, 로컬 우선의 트레이드오프)
- 서버 cron 없음. 백그라운드 자동 기록이 꼭 필요하면 후속에서 자체 호스팅(B 단계)로 검토.

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

### 4-5. 프라이버시 & 데이터 소유 (local-first)

- **자산 데이터는 기기를 벗어나지 않는다.** 보유 종목·평가금·스냅샷·자격증명은 IndexedDB에만 저장. 서버 DB·계정 없음.
- **프록시는 무상태.** 토스 토큰 교환·시세/계좌/보유 조회만 중계하고 무엇도 저장하지 않는다(4-1 계약).
- **자격증명 암호화.** client_secret·토큰은 패스프레이즈 파생 키로 로컬 암호화(Web Crypto). 패스프레이즈는 전송하지 않는다.
- **백업/이동/공유는 JSON.** `backup` 모듈로 전체 로컬 데이터를 JSON으로 내보내고 다른 기기에서 불러온다. 앱 자체는 계정/DB가 없어 누구나 배포본을 자기 로컬 데이터로 사용 가능.
- **트레이드오프 (수용함)**:
  - 기기 간 **자동 동기화 없음** → 수동 JSON export/import
  - 스냅샷은 **앱을 연 날만** 기록 (백그라운드 자동 기록 없음)
  - 백업은 사용자 책임 → 앱이 주기적으로 내보내기를 권유(배너)
  - IndexedDB는 브라우저 데이터 삭제 시 사라질 수 있음 → 정기 내보내기 안내로 보완

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
- 입력한 symbol은 다음 시세 갱신 대상(`prices`)에 자동 포함되어 현재가·평가금·수익률이 채워진다 (저장 직후 즉시 1회 갱신 트리거). 토스 connection이 없으면 `manualPrice` 입력란으로 현재가를 직접 받는다

### 5-3. 설정 — API 프리셋 & 데이터 관리

- 토스 API 프리셋(connection) 추가/수정/삭제 — 입력: label, 구성원(member), client_id, client_secret (마스킹 + 로컬 암호화 저장)
- 패스프레이즈 설정/변경 (앱 잠금 + 자격증명 암호화 키)
- **JSON 내보내기 / 불러오기** (백업·기기 이동·공유). 불러오기는 병합/덮어쓰기 선택
- 로컬 데이터 전체 삭제

### 5-4. 앱 잠금 (패스프레이즈)

- 최초 진입 시 패스프레이즈 설정, 이후 진입 시 입력 → 자격증명 복호화 키 확보. (서버 로그인 아님)

### 5-5. (후속 placeholder) 추이 그래프

`dailySnapshot` 기반 수익률·자산 성장 그래프 — B 대시보드에서 본격 활용.

---

## 6. 에러 처리

- **토큰 만료/무효**: 401 감지 시 재발급 후 1회 재시도
- **Rate limit (429)**: 지수 백오프 재시도
- **부분 실패 격리**: 한 connection/계좌 실패해도 나머지는 정상 표시 + 해당 항목에 경고 표시
- **API 다운**: 마지막 `priceCache`/`holding`로 표시 + 상단 경고 배너 ("토스 동기화 실패, 마지막 갱신: …")
- **환율 조회 실패**: 직전 `fxRate` 사용
- **자격증명 오류**: 설정 화면에서 명확한 에러 메시지 (잘못된 client_id/secret)
- **패스프레이즈 오류**: `settings.verifier` 불일치 시 복호화 시도 없이 안내
- **JSON 불러오기 오류**: schemaVersion·형식 검증 실패 시 거부 + 사유 안내 (기존 데이터 보존)

---

## 7. 테스트 (TDD)

- **`portfolio-service` (핵심)**: 병합·섹터 매핑·KRW 환산·비율 계산 순수 함수 단위 테스트. AUTO+MANUAL 혼합, USD/KRW 혼합, 미분류 섹터, 일간손익(AUTO=토스값 / MANUAL=prevClose 기반 / prevClose 없음=생략) 케이스 포함.
- **`toss-proxy`**: 토스 응답 목킹 — 토큰 발급/재발급(401), 429 백오프, 부분 실패. **무저장 보장**(요청/응답 미기록) 검증.
- **`crypto`**: 패스프레이즈 파생 키 암복호화 라운드트립 + 오답 패스프레이즈 거부.
- **`backup`**: export→import 라운드트립 동일성, schemaVersion 불일치/손상 JSON 거부.
- **`snapshot-service`**: 하루 1건 보장 (`lastSnapshotDate` 비교, 재실행 시 덮어쓰기).
- **`local-store`**: IndexedDB CRUD (fake-indexeddb로 테스트).

---

## 8. 열린 항목 (구현 단계에서 확정)

- IndexedDB 래퍼 선정 (Dexie vs idb) 및 스키마 마이그레이션 전략
- 패스프레이즈 KDF 선택 (PBKDF2 vs Argon2-wasm) 및 파라미터
- prevClose 출처 (`/candles` vs 전일 종가 클라이언트 이월)
- JSON 불러오기 정책 (병합 vs 덮어쓰기) 세부 규칙
- PWA 아이콘/매니페스트 에셋
- 토스 API rate limit 그룹별 정확한 한도 (구현 시 실측)
- 프록시 남용 방지 (개인 배포라 영향 적으나, 공개 배포 시 레이트리밋/오리진 제한 검토)
- `sector-map` 시드 확보 — 과거 stock-scraper의 `SECTOR_MAP`은 이 저장소에 없음. 구현 시 재작성하거나 외부에서 가져온다 (없어도 "미분류" 폴백으로 동작)
