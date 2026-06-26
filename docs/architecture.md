# dotori — 아키텍처 / 개발 가이드

토스 스타일의 **로컬 퍼스트(local-first) PWA 주식 포트폴리오 앱**. 토스인베스트 Open API로 보유 종목·시세·환율을 가져오고, 직접 추가한 종목과 합쳐 포트폴리오를 보여준다. 모든 데이터는 브라우저 IndexedDB에 저장되며, 민감정보는 비밀번호 파생 키로 암호화한다. **서버 DB가 없다.**

> 패키지명은 `dotori`.

---

## 기술 스택

| 영역 | 사용 |
| --- | --- |
| 프레임워크 | **Next.js 16.2.9** (App Router) — ⚠️ 학습 데이터와 다른 버전. [AGENTS.md](../AGENTS.md) 참고, `node_modules/next/dist/docs/` 확인 |
| UI | React 19, TypeScript 5, Tailwind CSS v4 |
| 비동기 상태 | `@tanstack/react-query` 5 (포트폴리오 쿼리/갱신) |
| 로컬 저장 | `dexie` 4 (IndexedDB 래퍼) |
| 전역 상태 | `zustand` 5 (잠금·세션 키·마지막 갱신, 인메모리) |
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

```
app/                       App Router 라우트 (모두 "use client")
  layout.tsx               QueryProvider + LockGate + ServiceWorker 등록
  page.tsx                 포트폴리오 대시보드 (홈)
  holdings/new/page.tsx    종목 직접 추가 (MANUAL 생성)
  holdings/[id]/page.tsx   종목 상세 — 섹터 편집, MANUAL 종목 수정·삭제
  settings/page.tsx        토스 연동 / 백업 / 비밀번호 변경
  api/toss/*/route.ts      토스 API 서버 프록시 (token·holdings·prices·exchange-rate·accounts)
  globals.css, manifest.json

components/
  ui/                      디자인 시스템 프리미티브
                           (Button, Card, Dialog, TextInput, Chip, Banner, ReturnBadge, AmountText, SectorField)
  portfolio/               대시보드 위젯
                           (SummaryHero, SectorDonut, HoldingWeightBars, HoldingsTable, RefreshBar, SectorDialog)
  holdings/HoldingForm.tsx 종목 추가/편집 폼
  settings/                ConnectionForm, BackupPanel
  LockGate, BottomTabBar, ServiceWorkerRegister

lib/
  toss/                    toss-client(API 호출·정규화·재시도), toss-token(토큰 발급/캐시)
  sync/refresh.ts          전체 갱신 오케스트레이션 (토큰→보유→시세→환율→DB)
  db/                      schema(Dexie 정의), local-store(CRUD 헬퍼)
  portfolio/               순수 계산 함수: portfolio-service(buildPortfolio), pnl, fx, merge, ratios
  sector/                  seed(종목→섹터 시드), sector-map(resolveSector + KNOWN_SECTORS)
  crypto/                  crypto(PBKDF2/AES-GCM), rekey(비밀번호 변경 재암호화)
  snapshot/                일별 스냅샷 저장
  backup/                  전체 export/import (JSON)
  query/                   client(QueryProvider), use-portfolio(usePortfolio/useRefresh)
  format.ts, types.ts

stores/app-store.ts        zustand — locked, sessionKey(CryptoKey, 비추출·세션 볼트 동기화), lastRefreshAt
test/                      모듈 구조를 미러링한 단위/UI 테스트
docs/                      본 문서 + superpowers/(스펙·플랜)
```

---

## 레이어 & 데이터 흐름

```
[LockGate] 비밀번호 잠금 해제 → sessionKey(CryptoKey) 메모리 + 세션 볼트(10분) 보관
     │
[useRefresh → refreshAll] 토스 동기화
     │   connection별 getValidToken → /api/toss/* 프록시 → toss-client 정규화
     │   → local-store upsert (AUTO holdings · priceCache · fxRates), prevClose 롤오버
     ▼
[IndexedDB]  holdings · priceCache · fxRates · sectorOverrides · snapshots · settings ...
     │
[usePortfolio] DB 로드 → buildPortfolio(순수) → PortfolioVM
     │   merge(중복 합산) + pnl + fx(원화 환산) + ratios(bySector/byHolding) + resolveSector
     ▼
[components/portfolio/*] 대시보드 렌더링
```

- **순수 계산 레이어**: `lib/portfolio/`의 함수들은 DB·비동기·`Date` 없이 입력만으로 결과를 낸다 ([portfolio-service.ts](../lib/portfolio/portfolio-service.ts) 헤더 주석 참고). 테스트가 쉽고 결정적이다.
- **직접 추가(MANUAL)**: [HoldingForm](../components/holdings/HoldingForm.tsx)이 `upsertManualHolding` + `sectorOverride`를 기록한다. 토스 연동과 독립적으로 동작한다. 추가는 `holdings/new`, 수정·삭제는 상세 화면 `holdings/[id]`에서 한다(별도 관리 목록 페이지는 없다).
- **갱신 트리거**: 홈의 `RefreshBar` 새로고침 → `useRefresh` 뮤테이션 → 성공 시 `["portfolio"]` 쿼리 무효화. 종목 추가/수정/삭제·섹터 변경 후에도 같은 쿼리를 무효화해 대시보드를 갱신한다.

---

## 보안 모델

- 비밀번호는 **저장하지 않는다.** PBKDF2(310k, SHA-256)로 AES-GCM 256 키를 파생하고, `salt` + `verifier`만 `settings`에 저장한다 ([crypto.ts](../lib/crypto/crypto.ts), [LockGate](../components/LockGate.tsx)). 파생 키는 `extractable: false`(비추출)라 원본 키 바이트를 JS·디스크 어디로도 꺼낼 수 없다.
- **세션 키(CryptoKey)는 평상시 메모리(zustand)에** 둔다. 자동 잠금(10분 유휴 슬라이딩)을 위해 비추출 핸들 + 만료시각을 세션 볼트(IndexedDB)에 동기화한다 ([session-vault.ts](../lib/db/session-vault.ts), [use-session-guard.ts](../lib/auth/use-session-guard.ts)). 만료 또는 잠금 시 폐기된다. 새로고침해도 만료 전이면 비밀번호 없이 자동 잠금 해제되지만, 원본 키 바이트는 평문으로 남지 않는다.
  - 트레이드오프: 만료 전(최대 10분)에는 **같은 기기·브라우저**에서 비밀번호 없이 복호화가 가능하다. 디스크/백업 유출이나 다른 origin·기기로부터는 여전히 보호된다(비추출 키 + same-origin).
- 암호화 대상: `connections.clientSecretEnc`, `tokenCache.accessTokenEnc`. 형식은 `iv.ciphertext`(base64).
- 비밀번호 변경 시 [rekey.ts](../lib/crypto/rekey.ts)의 `rekeyVault`로 모든 암호값을 재암호화한다.
- 토스 시크릿/토큰은 브라우저에서 토스로 직접 보내지 않고 **`app/api/toss/*` 프록시**를 경유한다(`runtime = "nodejs"`, `force-dynamic`, `Cache-Control: no-store`).

---

## 도메인 노트

- **일간 손익** ([pnl.ts](../lib/portfolio/pnl.ts)): AUTO = 토스 `dailyPnl` 그대로, MANUAL = `(현재가 − 전일종가) × 수량`. 전일종가(`prevClose`)는 갱신 시 하루 한 번 롤오버.
- **섹터** ([sector-map.ts](../lib/sector/sector-map.ts)): `resolveSector` 우선순위 = `sectorOverrides` > `SECTOR_SEED` > `"미분류"`. 화면 표시는 **항상 `sectorOverrides` 기반**이며 `holding.sector` 필드가 아니다. `KNOWN_SECTORS`는 테마형 기본 목록(반도체·인터넷·2차전지… + 나스닥100/S&P500/코스피).
- **환율**: `USDKRW` 단일 페어, 토스 갱신 시 함께 저장. 표시는 [RefreshBar](../components/portfolio/RefreshBar.tsx).
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
