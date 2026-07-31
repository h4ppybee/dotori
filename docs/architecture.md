# dotori — 아키텍처 / 개발 가이드

토스 스타일의 **로컬 퍼스트(local-first) PWA 개인 자산 관리 앱**. 주식·저축/현금성·연금·코인 자산과 부채를 한데 모아 **순자산**을 보여준다. 토스인베스트 Open API(주식·연금 시세·환율)와 업비트 API(코인·예수금)로 시세를 가져오고, 직접 입력한 자산과 합친다. 모든 데이터는 브라우저 IndexedDB에 저장되며, 민감정보는 비밀번호 파생 키로 암호화한다. **서버 DB가 없다.**

> 패키지명은 `dotori`. 홈 탭(`app/page.tsx`)은 **순자산 + 목표 자산** 섹션을 보여준다(목표 금액·목표일 설정 → 월 필요 저축액·달성률 진행 링). 가계부(`ledger`)·계획(`plan`) 탭은 아직 플레이스홀더(`components/nav/DummyPage`)다.

> 📄 **문서를 코드와 일치시킨다.** 라우트·`lib` 모듈·`components` 디렉토리·자산 종류·외부 API·Dexie 테이블·데이터 흐름을 추가/변경할 때는 이 문서와 [AGENTS.md](../AGENTS.md)를 **같은 작업에서 함께 갱신**한다. 주제별 상세는 분리 문서로 관리한다 — 백업 [backup.md](backup.md), 외부 연동 [external-api.md](external-api.md). 전체 목록은 [docs/README.md](README.md).

---

## 기술 스택

| 영역 | 사용 |
| --- | --- |
| 프레임워크 | **Next.js 16.2.9** (App Router) — ⚠️ 학습 데이터와 다른 버전. [AGENTS.md](../AGENTS.md) 참고, `node_modules/next/dist/docs/` 확인 |
| UI | React 19, TypeScript 5, Tailwind CSS v4 |
| 비동기 상태 | `@tanstack/react-query` 5 (자산별 쿼리/갱신) |
| 로컬 저장 | `dexie` 4 (IndexedDB 래퍼) |
| 전역 상태 | `zustand` 5 (잠금·세션 키·마지막 갱신·네비, 인메모리) |
| 테스트 | `vitest` 4 + Testing Library + `fake-indexeddb` |

## 명령어

```bash
npm run dev        # 개발 서버 (localhost:3000)
npm run build      # 프로덕션 빌드
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm test           # vitest run
npm run test:watch # vitest watch
```

변경 후에는 `npm run typecheck && npm run lint && npm test`를 통과시키는 것을 기본으로 한다.

---

## 디렉토리 구조

메인 하단 탭 5개(홈·자산·계획·가계부·설정)와 자산 서브탭 5개(자산·주식·저축·연금·코인)로 구성된다. 탭 정의는 [lib/nav/nav-config.tsx](../lib/nav/nav-config.tsx).

```
app/                       App Router 라우트 (모두 "use client")
  layout.tsx               QueryProvider + LockGate + AppNav + ServiceWorker 등록
  page.tsx                 홈 — 순자산 요약 + 목표 자산(GoalCard/GoalForm/GoalProgressRing)
  assets/page.tsx          자산 개요 — 순자산 = 자산 합계 − 부채, 자산별 카드 + DebtSection + SnapshotSection
  assets/stocks/page.tsx   주식 대시보드 (구 홈 — 포트폴리오/섹터/보유)
  assets/savings/page.tsx  저축/현금성 (+ savings/manage 추가·수정)
  assets/pension/page.tsx  연금 (+ pension/manage)
  assets/crypto/page.tsx   코인 (+ crypto/manage)
  assets/snapshots         자산 스냅샷 전체 목록 (+ snapshots/[id] 상세 표+삭제)
  holdings/new, holdings/[id]  주식 직접 추가 / 상세·섹터 편집·MANUAL 수정·삭제
  plan, ledger             계획·가계부 (플레이스홀더 DummyPage)
  settings/page.tsx        연동(토스·업비트) / 백업 / PIN 설정·변경
  api/toss/*/route.ts      토스 프록시 (token·holdings·prices·exchange-rate·accounts)
  api/upbit/*/route.ts     업비트 프록시 (accounts·markets·tickers)
  globals.css, manifest.json

components/
  ui/                      디자인 시스템 프리미티브
                           (Button, Card, Dialog, TextInput, Chip, Switch, Banner,
                            ReturnBadge, AmountText, PrivacyAmount, SectorField, InvestmentHero, DonutChart)
  portfolio/               주식 대시보드 위젯
                           (SummaryHero, SectorDonut, HoldingWeightBars, HoldingsTable, RefreshBar, SectorDialog)
  savings/, pension/, coin/, debt/   자산별 위젯·관리 목록·입력 다이얼로그
  snapshot/                SnapshotSection(기록 버튼+차트+최근 목록), SnapshotListItem, SnapshotTrendChart(추이 콤보 차트)
  goal/                    GoalCard, GoalForm, GoalEmptyState, GoalProgressRing (목표 자산 섹션)
  holdings/HoldingForm.tsx 종목 추가/편집 폼
  nav/                     AppNav, MainTabBar, AssetSubTabBar, DummyPage
  settings/                ConnectionForm, BackupPanel
  LockGate, ServiceWorkerRegister

lib/
  toss/                    toss-client(API 호출·정규화·재시도), toss-token(토큰 발급/캐시)
  upbit/                   upbit-client·normalize·upbit-jwt·relay-endpoint (코인·예수금)
  sync/                    refresh(토스: 토큰→보유→시세→환율→DB), refresh-upbit(코인·예수금)
  db/                      schema(Dexie 정의), local-store(CRUD 헬퍼), session-vault
  portfolio/               순수 계산: portfolio-service(buildPortfolio), pnl, fx, merge, ratios, net-worth
  savings/, pension/, coin/, debt/   자산별 순수 서비스(VM 빌드·집계·카테고리 라벨)
  goal/                    순수 계산: goal-service(buildGoalProgress) — 순자산 목표 진척(월 필요 저축액·달성률)
  sector/                  seed(종목→섹터 시드), sector-map(resolveSector + KNOWN_SECTORS)
  crypto/                  crypto(PBKDF2/AES-GCM), rekey(비밀번호 변경 재암호화)
  snapshot/                수동 전체 자산 스냅샷 — capture(DB 상태→VM 5종→저장), asset-snapshot(순수 빌더), trend(추이 차트 데이터 헬퍼)
  backup/                  수동 데이터 export/import (JSON) — 상세 docs/backup.md
  nav/                     nav-config(탭 정의), active(활성 탭 판정)
  query/                   client(QueryProvider), use-portfolio·use-savings·use-pension·use-coin·use-debt·use-settings, use-assets-refresh, use-asset-snapshots(목록/단건/기록·삭제 뮤테이션), use-goal(목표 조회·저장·삭제 뮤테이션), use-net-worth(순자산 합산 훅)
  format.ts, types.ts

stores/
  app-store.ts             zustand — locked, sessionKey(CryptoKey, 비추출·세션 볼트 동기화), lastRefreshAt
  nav-store.ts             자산 탭 진입 전 메인 탭 경로(복귀 지점)
test/                      모듈 구조를 미러링한 단위/UI 테스트
docs/                      본 문서 + superpowers/(스펙·플랜)
```

---

## 레이어 & 데이터 흐름

```
[LockGate] PIN(6자리 넘버패드)·비밀번호 잠금 해제 → sessionKey(CryptoKey) 메모리 + 세션 볼트(10분) 보관
     │
[useAssetsRefresh] 자산 통합 갱신 (자산 탭 진입 시 10분 경과하면 자동 실행)
     │   refreshAll   : 토스 토큰→보유→시세→환율→DB, prevClose 롤오버
     │   refreshPension: 연금 symbol 보유분 현재가(토스 시세)
     │   refreshUpbit  : 업비트 코인·예수금(AUTO)
     │   (저축 수동 입력분은 갱신 대상 아님)
     ▼
[IndexedDB]  holdings · priceCache · fxRates · sectorOverrides · snapshots · settings
             · savings · pension · coin · debts · assetSnapshots · goal · session
     │
[use-* 훅]   DB 로드 → 자산별 순수 서비스로 VM 빌드
     │   주식: buildPortfolio(merge+pnl+fx+ratios+resolveSector)
     │   저축·연금·코인·부채: 각 *-service의 집계/환산
     ▼
[assets/page]  자산별 값 합산 → 순자산 = 자산 합계 − 부채, 각 화면에서 렌더링
```

- **순수 계산 레이어**: `lib/portfolio/`(및 `savings/`·`pension/`·`coin/`·`debt/`)의 서비스 함수들은 DB·비동기·`Date` 없이 입력만으로 결과를 낸다 ([portfolio-service.ts](../lib/portfolio/portfolio-service.ts) 헤더 주석 참고). 테스트가 쉽고 결정적이다.
- **직접 추가(MANUAL)**: 주식은 [HoldingForm](../components/holdings/HoldingForm.tsx)이 `upsertManualHolding` + `sectorOverride`를 기록한다(추가는 `holdings/new`, 수정·삭제는 `holdings/[id]`). 저축·연금·코인·부채는 각 자산 화면의 `manage`/다이얼로그에서 직접 입력·수정한다.
- **자산 소스**: AUTO(연동)는 토스(주식·연금 시세·환율)와 업비트(코인·예수금), MANUAL(직접 입력)은 저축·부채 및 직접 추가분. 연동·수동을 합쳐 보여준다.
- **갱신 트리거**: 자산 화면의 `RefreshBar` → `useAssetsRefresh` 뮤테이션 → 성공 시 `portfolio`·`pension`·`coin`·`savings` 쿼리 무효화. 각 자산 추가/수정/삭제 후에도 해당 쿼리를 무효화해 화면을 갱신한다.
- **자산 스냅샷(수동 전체)**: 자동 갱신 흐름과 별개로, 자산 탭 하단 [SnapshotSection](../components/snapshot/SnapshotSection.tsx)의 "+ 지금 기록" 버튼을 누르면 [captureAssetSnapshot](../lib/snapshot/capture.ts)이 DB 상태를 화면과 동일한 VM 5종(주식·저축·연금·코인·부채)으로 계산해 순수 빌더 [buildAssetSnapshot](../lib/snapshot/asset-snapshot.ts)에 넘기고, 결과 1건을 `assetSnapshots` 테이블에 저장한다. 이전의 주식 전용 일별 자동 스냅샷(`snapshots` 테이블, `Settings.lastSnapshotDate`)은 제거되어 이 수동 전체 스냅샷으로 일원화됐다 — `snapshots` 테이블과 과거 데이터는 하위호환을 위해 보존만 되고 더 이상 기록되지 않는다. 추이는 [SnapshotTrendChart](../components/snapshot/SnapshotTrendChart.tsx)가 최신 20건을 [buildTrendData](../lib/snapshot/trend.ts)로 가공해 순자산 선(상단 밴드) + 직전 대비 변화량 막대(하단 밴드)로 보여준다. 목록·상세는 `/assets/snapshots`, `/assets/snapshots/[id]`.

---

## 보안 모델

- PIN/비밀번호는 **저장하지 않는다.** PBKDF2(310k, SHA-256)로 AES-GCM 256 키를 파생하고, `salt` + `verifier`만 `settings`에 저장한다 ([crypto.ts](../lib/crypto/crypto.ts), [LockGate](../components/LockGate.tsx)). 파생 키는 `extractable: false`(비추출)라 원본 키 바이트를 JS·디스크 어디로도 꺼낼 수 없다.
- **잠금 수단은 `Settings.lockType`으로 구분한다** — `"pin"`(6자리 숫자, 넘버패드 UI)·`"passphrase"`(기존 문자 비밀번호). 필드가 없는 기존 데이터는 passphrase로 간주해 텍스트 입력으로 잠금 해제하고, 설정의 "PIN 설정"에서 `rekeyVault`를 거쳐 PIN으로 전환한다. 신규 설치는 처음부터 PIN으로 설정된다.
  - 트레이드오프: 6자리 PIN은 문자 비밀번호보다 오프라인 무차별 대입에 약하다(경우의 수 10^6). 로컬 퍼스트 특성상 서버 측 시도 제한이 없음을 인지하고 모바일 UX를 우선해 채택했다.
- **세션 키(CryptoKey)는 평상시 메모리(zustand)에** 둔다. 자동 잠금(10분 유휴 슬라이딩)을 위해 비추출 핸들 + 만료시각을 세션 볼트(IndexedDB)에 동기화한다 ([session-vault.ts](../lib/db/session-vault.ts), [use-session-guard.ts](../lib/auth/use-session-guard.ts)). 만료 또는 잠금 시 폐기된다. 새로고침해도 만료 전이면 비밀번호 없이 자동 잠금 해제되지만, 원본 키 바이트는 평문으로 남지 않는다.
  - 트레이드오프: 만료 전(최대 10분)에는 **같은 기기·브라우저**에서 비밀번호 없이 복호화가 가능하다. 디스크/백업 유출이나 다른 origin·기기로부터는 여전히 보호된다(비추출 키 + same-origin).
- 암호화 대상: `connections.clientSecretEnc`, `tokenCache.accessTokenEnc`. 형식은 `iv.ciphertext`(base64).
- PIN·비밀번호 변경 시 [rekey.ts](../lib/crypto/rekey.ts)의 `rekeyVault`로 모든 암호값을 재암호화한다.
- 토스·업비트 시크릿/토큰은 브라우저에서 외부로 직접 보내지 않고 **`app/api/toss/*`·`app/api/upbit/*` 프록시**를 경유한다(`runtime = "nodejs"`, `force-dynamic`, `Cache-Control: no-store`). 업비트는 서버에서 JWT를 서명해 호출한다([upbit-jwt.ts](../lib/upbit/upbit-jwt.ts)). 프록시·릴레이·토큰 흐름 상세는 [external-api.md](external-api.md).

---

## 도메인 노트

- **일간 손익** ([pnl.ts](../lib/portfolio/pnl.ts)): AUTO = 토스 `dailyPnl` 그대로, MANUAL = `(현재가 − 전일종가) × 수량`. 전일종가(`prevClose`)는 갱신 시 하루 한 번 롤오버.
- **섹터** ([sector-map.ts](../lib/sector/sector-map.ts)): `resolveSector` 우선순위 = `sectorOverrides` > `SECTOR_SEED` > `"미분류"`. 화면 표시는 **항상 `sectorOverrides` 기반**이며 `holding.sector` 필드가 아니다. `KNOWN_SECTORS`는 테마형 기본 목록(반도체·인터넷·2차전지… + 나스닥100/S&P500/코스피).
- **환율**: `USDKRW` 단일 페어, 토스 갱신 시 함께 저장. 표시는 [RefreshBar](../components/portfolio/RefreshBar.tsx).
- **순자산**: 자산 개요([app/assets/page.tsx](../app/assets/page.tsx))에서 `순자산 = 주식+저축+연금+코인 − 부채`로 계산한다. 자산별 값은 각 `use-*` 훅의 VM에서 온다. 순자산 vs 부채 비중은 [NetWorthDonut](../components/portfolio/NetWorthDonut.tsx)이 도넛으로 보여준다(순수 계산 [net-worth.ts](../lib/portfolio/net-worth.ts), 자산이 있으면 노출 — 부채가 없으면 순자산 100% 한 조각). 그 아래 [AssetAllocationDonut](../components/portfolio/AssetAllocationDonut.tsx)이 자산 종류별(주식/저축/연금/코인) 비중을 보여준다. 자산별 행에는 손익 개념이 있는 자산(주식·연금·코인)만 [PnlText](../components/ui/PnlText.tsx)로 `+₩금액 (수익률%)`를 부호 색 텍스트로 표기한다(주식탭 [HoldingsTable](../components/portfolio/HoldingsTable.tsx)과 동일 표기 — 공용 PnlText로 통일).
- **코인**: 업비트 API로 보유·예수금(AUTO)을 가져오고([upbit-client.ts](../lib/upbit/upbit-client.ts)), 수동 보유분과 합친다. 서비스 계산은 [coin-service.ts](../lib/coin/coin-service.ts).
- **부채**: 수동 입력 대출 계좌(`debts` 테이블). 순자산에서 차감하며 자산 개요의 `DebtSection`에서 관리한다([debt-service.ts](../lib/debt/debt-service.ts)).
- **색 시맨틱** ([DESIGN.md](../DESIGN.md)): 상승/수익 = 빨강(`up`), 하락/손실 = 파랑(`down`). 한국 증시 관례.

---

## 주의사항 (Next.js 16 / 환경)

- 동적 라우트 `params`는 **Promise**다 → 클라이언트 컴포넌트에서 `use(params)`로 푼다 ([holdings/[id]/page.tsx](../app/holdings/%5Bid%5D/page.tsx)).
- 네비게이션은 `next/navigation`의 `useRouter`/`Link`.
- IndexedDB는 브라우저 전용 — 서버 컴포넌트/SSR에서 접근 금지. 데이터 접근 페이지·컴포넌트는 `"use client"`.
- 테스트는 `.worktrees`를 수집에서 제외한다([vitest.config.ts](../vitest.config.ts)).

---

## 코딩 스타일

- `if/else` 본문은 한 줄이어도 중괄호로 감싼다.
- 중첩 대신 early return/throw 패턴.
- 기존 컴포넌트의 톤(주석 밀도·네이밍·Tailwind 사용)을 따른다.

자세한 설계 의도는 [docs/superpowers/specs/](superpowers/specs/)의 스펙 문서를 참고한다.
