# 자산 스냅샷 기록 — 설계

작성일: 2026-07-02

## 배경 / 문제

dotori에는 `snapshots` 테이블(`DailySnapshot`)과 `saveDailySnapshotIfNeeded`가 있지만,
**주식만** 하루 1회 자동 저장하고 **화면에 노출되는 곳이 없다**(주식 탭 진입 시 백그라운드 기록만).
사용자는 원하는 시점에 버튼을 눌러 **전체 자산 상태(손익 포함)를 로그처럼 기록**하고,
자산 탭에서 목록·상세를 확인하고 싶어 한다.

## 목표

- 자산 탭에 "스냅샷 기록" 버튼: 누르면 현재 주식·저축·연금·코인·부채 전체 상태를 1건의 스냅샷으로 저장.
- 자산 탭 하단 스냅샷 섹션: 최근 10개 목록(시점 + 순자산 대표 표시), "더보기" → 전체 목록 화면.
- 스냅샷 섹션 상단에 **순자산 추이 콤보 차트**: 최신 20개 스냅샷의 순자산을 선형 차트(Line)로,
  직전 스냅샷 대비 순자산 변화량을 같은 차트의 막대(Bar)로 함께 표시.
- 목록 항목 클릭 → 상세 화면:
  - 주식·연금·코인: 종목명 / 수량 / 매수금액 / 스냅샷 시점 평가금액 / 손익금액 / 수익률 표
  - 저축·부채: 항목명 / 금액 표
- 상세 화면에서 스냅샷 삭제 가능(확인 후).
- 기존 주식 전용 일별 자동 스냅샷 로직은 제거하고 이 기능으로 일원화.

## 비목표 (YAGNI)

- 스냅샷 간 항목별 상세 비교 화면(순자산 추이 콤보 차트는 범위 내, 그 외 비교·분석은 향후 확장).
- 자동/예약 스냅샷(수동 버튼만).
- 스냅샷 수정(기록은 불변, 삭제만 가능).
- 기존 `snapshots` 테이블 데이터 마이그레이션·삭제(테이블·과거 데이터는 그대로 두고 신규 기록만 중단).

## 사용자 결정 사항 (브레인스토밍)

1. **부채 표시**: 상세 화면에 부채도 항목별(항목명+금액) 표로 표시 — 순자산 계산 근거 투명화.
2. **기존 DailySnapshot**: 자동 저장 로직 제거·통합. 테이블/과거 데이터는 유지, 신규 기록 중단.
3. **삭제**: 스냅샷 상세 화면에서 삭제 가능.
4. **배포**: PR 프리뷰 방식(worktree → PR → Vercel 프리뷰 → 머지).
5. **추이 차트**: 스냅샷 순자산 최신 20개를 선형 차트로, 직전 대비 변화량을 같은 차트의
   막대그래프로 표시(브레인스토밍 중 추가 요청, 막대→선형→콤보로 변경 끝에 확정).

## 접근법

- **A. VM 직렬화 스냅샷 (채택)** — 버튼 클릭 시 화면이 이미 계산한 뷰모델
  (`PortfolioVM`·`SavingsVM`·`PensionVM`·`CoinVM`·`DebtVM`)에서 필요한 필드만 추출해
  1건의 레코드로 저장. "그 시점 화면에 보이던 값 그대로"가 보존되고, 조회 시 재계산이
  없어 이후 계산 로직이 바뀌어도 과거 기록이 불변.
- B. 원본 데이터 복사 — holdings·savings 등 원본 레코드 전체 복사 후 조회 시 재계산.
  저장량 크고, 계산 로직 변경 시 과거 기록 값이 바뀌어 "기록" 의미 훼손. 기각.
- C. 기존 `DailySnapshot` 확장 — 키가 날짜라 하루 여러 번 기록 불가(로그 요구와 충돌),
  주식 전용 구조. 기각.

## 상세 설계

### 1) 데이터 모델 — `lib/types.ts`

```typescript
/** 주식·연금·코인 공용 스냅샷 상세 행 */
export interface AssetSnapshotRow {
  name: string;       // 종목명
  quantity: number;   // 수량
  costKrw: number;    // 매수금액 (KRW)
  valueKrw: number;   // 스냅샷 시점 평가금액 (KRW)
  pnlKrw: number;     // 손익금액 (KRW)
  returnPct: number;  // 수익률 (%)
}

/** 저축·부채 공용 스냅샷 행 */
export interface AssetSnapshotSimpleRow {
  name: string;       // 항목명
  amountKrw: number;  // 금액 (KRW)
}

/** 손익 있는 자산군(주식·연금·코인)의 스냅샷 섹션 */
export interface AssetSnapshotPnlSection {
  totalValueKrw: number;
  totalCostKrw: number;
  totalPnlKrw: number;
  returnPct: number;
  rows: AssetSnapshotRow[];
}

/** 금액만 있는 자산군(저축·부채)의 스냅샷 섹션 */
export interface AssetSnapshotAmountSection {
  totalKrw: number;
  rows: AssetSnapshotSimpleRow[];
}

/** 수동 전체 자산 스냅샷 1건 (버튼 클릭 시점의 상태 고정) */
export interface AssetSnapshot {
  id: string;              // uuid (key)
  createdAt: number;       // epoch ms — 목록 정렬 기준
  netWorthKrw: number;     // 순자산 = totalAssetsKrw - totalDebtKrw (대표값)
  totalAssetsKrw: number;  // 주식+저축+연금+코인 평가금 합
  totalDebtKrw: number;    // 부채 잔액 합
  stocks: AssetSnapshotPnlSection;
  pension: AssetSnapshotPnlSection;
  coin: AssetSnapshotPnlSection;
  savings: AssetSnapshotAmountSection;
  debt: AssetSnapshotAmountSection;
}
```

- 금액은 기존 `snapshots` 테이블과 동일하게 **평문 저장**(현행 보안 수준 유지, 시크릿 아님).
- 저축 USD 항목은 스냅샷 시점 환율로 **원화 환산값**(`SavingsAccountView.amountKrw`)을 저장.
- 주식 행의 매수금액·평가금액도 VM이 이미 환산해둔 KRW 값(`PortfolioRow.costKrw`·`valueKrw`)을 사용.

### 2) DB — `lib/db/schema.ts`

- 스키마 버전 v6 → **v7** 추가.
- `assetSnapshots!: Table<AssetSnapshot, string>;` 선언.
- `this.version(7).stores({ assetSnapshots: "id, createdAt" });`
- 기존 `snapshots` 테이블 정의는 그대로 유지(과거 데이터 보존).

### 3) 순수 빌더 — `lib/snapshot/asset-snapshot.ts`

```typescript
export function buildAssetSnapshot(input: {
  id: string;
  createdAt: number;
  portfolio?: PortfolioVM;
  savings?: SavingsVM;
  pension?: PensionVM;
  coin?: CoinVM;
  debt?: DebtVM;
}): AssetSnapshot
```

- 핵심 규칙 "순수 계산" 준수: DB·비동기·`Date` 없음. `id`·`createdAt`은 호출부에서 주입.
- VM이 `undefined`(해당 자산 미등록/로딩 실패)면 빈 섹션(`rows: []`, 합계 0)으로 처리.
- 행 매핑:
  - 주식: `PortfolioRow` → `{ name: holding.name, quantity: holding.quantity, costKrw, valueKrw, pnlKrw, returnPct }`
  - 연금: `PensionVM.groups[].accounts[]`(`PensionAccountView`) → 동일 매핑 (`quantity`, `costKrw`…)
  - 코인: `CoinVM.holdings[]`(`CoinHoldingView`) → 동일 매핑
  - 저축: `SavingsVM.groups[].accounts[]`(`SavingsAccountView`) → `{ name, amountKrw }`
  - 부채: `DebtVM.items[]`(`LoanAccount`) → `{ name, amountKrw: balance }`
- 합계는 각 VM의 total 필드를 그대로 사용. `netWorthKrw = totalAssetsKrw − totalDebtKrw`.

### 4) 저장소 CRUD — `lib/db/local-store.ts`

- `addAssetSnapshot(snapshot: AssetSnapshot)` — put.
- `listAssetSnapshots(limit?: number)` — `createdAt` 내림차순, limit 지정 시 상위 N개.
- `getAssetSnapshot(id: string)` — 단건.
- `deleteAssetSnapshot(id: string)` — 삭제.

### 5) 쿼리 훅 — `lib/query/use-asset-snapshots.ts`

- `useAssetSnapshots(limit?)` — 목록 쿼리 (queryKey: `["assetSnapshots", limit ?? "all"]`).
- `useAssetSnapshot(id)` — 단건 쿼리.
- `useTakeSnapshot()` — mutation: 현재 5개 VM 쿼리 데이터로 `buildAssetSnapshot` 실행
  (`id`: `crypto.randomUUID()`, `createdAt`: `Date.now()` — 훅/호출부에서 주입) 후
  `addAssetSnapshot`, 성공 시 `["assetSnapshots"]` 무효화.
- `useDeleteSnapshot()` — mutation: 삭제 후 무효화.

### 6) 기존 자동 스냅샷 제거

- `lib/snapshot/snapshot-service.ts`(`saveDailySnapshotIfNeeded`)와
  `app/assets/stocks/page.tsx`의 호출부 제거.
- `test/snapshot/snapshot-service.test.ts` 제거(새 빌더 테스트로 대체).
- `Settings.lastSnapshotDate`는 타입에 남겨두되 더 이상 갱신하지 않음(기존 데이터 호환).
- `lib/backup`의 `snapshots` export/import는 유지(과거 데이터 백업 호환).

### 7) UI

#### 자산 탭 하단 섹션 — `components/snapshot/SnapshotSection.tsx`

- 위치: `app/assets/page.tsx`의 `DebtSection` 아래.
- 데이터: `useAssetSnapshots(21)` 한 번으로 차트(최신 20개 + 변화량 계산용 직전 1개)·목록(상위 10개 slice)을 함께 충당.
- 헤더: "스냅샷" 타이틀 + "기록" 버튼.
  - 버튼은 5개 자산 쿼리 중 하나라도 로딩 중이면 비활성.
  - 클릭 → `useTakeSnapshot` 실행 → 목록 즉시 갱신.
- 헤더 아래 **순자산 추이 콤보 차트** — `components/snapshot/SnapshotTrendChart.tsx`:
  - 최신 20개 스냅샷 대상, 좌→우 = 과거→최신(시간순). 하나의 SVG에 선 + 막대를 겹쳐 그린다.
  - **선(Line)**: `netWorthKrw` 추이. 각 지점에 포인트 마커. 색은 브랜드 토큰.
    y 스케일은 표시 구간의 순자산 최소~최대값 기준 상대 스케일(차트 상단 영역 사용).
  - **막대(Bar)**: 변화량 = 해당 스냅샷 `netWorthKrw` − 직전 스냅샷 `netWorthKrw`.
    증가는 `up`(빨강)·감소는 `down`(파랑) 시맨틱 색. 0 기준선에서 위/아래로 뻗는 형태이며,
    변화량 절대값 최대 기준의 **독립 상대 스케일**(차트 하단 영역 사용, 선과 축을 공유하지 않음).
  - 변화량 계산을 위해 최신 21개를 조회해 표시 구간(20개) 각각의 직전 값을 확보한다.
    직전 스냅샷이 없는 항목(전체에서 첫 기록)은 막대를 그리지 않는다.
  - 스냅샷 2개 미만이면 차트 숨김(점 1개는 추이 의미 없음).
  - SVG 기반(외부 라이브러리 없음, `DonutChart`와 동일 접근). 색은 DESIGN.md 토큰.
  - 금액 축 라벨은 생략(상대 스케일). `PrivacyAmount`(금액 숨기기) ON이어도
    선·막대는 상대 비율이라 그대로 표시.
- 목록: 최근 10개. 각 행 = 시점(`YYYY.MM.DD HH:mm`) + 순자산(`PrivacyAmount` 적용).
  행 클릭 → `/assets/snapshots/[id]`.
- 스냅샷이 하나도 없으면 빈 상태 문구(예: "아직 기록한 스냅샷이 없어요").
- 10개 초과 존재 시 "더보기" 링크 → `/assets/snapshots`.

#### 전체 목록 — `app/assets/snapshots/page.tsx`

- 스냅샷 전체를 `createdAt` 내림차순 목록으로 표시(행 구성은 섹션과 동일).
- 뒤로 가기로 자산 탭 복귀.

#### 상세 — `app/assets/snapshots/[id]/page.tsx`

- Next 16: `params`는 Promise → `use(params)`로 해제.
- 상단 요약 카드: 시점, 순자산(대표), 자산 총액 · 부채 총액.
- 자산군별 섹션(값이 있는 것만 표시):
  - 주식 / 연금 / 코인: 표 — 종목명 · 수량 · 매수금액 · 평가금액 · 손익 · 수익률.
    손익·수익률 색상은 `PnlText`(상승=빨강 `up`, 하락=파랑 `down`).
    섹션 헤더에 자산군 합계(평가금·손익·수익률).
  - 저축 / 부채: 표 — 항목명 · 금액. 섹션 헤더에 합계.
- 하단 삭제 버튼: 확인(confirm) 후 `useDeleteSnapshot` → 진입 경로와 무관하게 `/assets/snapshots` 목록으로 복귀.
- 존재하지 않는 id면 안내 문구 + 목록으로 이동 링크.
- DESIGN.md 토큰·기존 `components/ui/` 프리미티브(Card, PnlText, PrivacyAmount) 재사용.
  표가 좁은 화면에서 넘치면 컨테이너에 가로 스크롤 적용.

### 8) 백업 — `lib/backup/backup.ts`

- `BackupData`에 `assetSnapshots: AssetSnapshot[]` 추가.
- `exportAll()`/`importAll()`에 처리 추가(없으면 빈 배열 폴백해 구버전 호환).
- `importAll`의 overwrite 모드에서는 `pension`·`debts`와 동일하게 `assetSnapshots`를 **clear 후 bulkPut**
  (기존 `snapshots`는 merge 전례지만, 스냅샷 로그는 백업본으로 완전 교체가 "복원" 의미에 부합).
  merge 모드는 bulkPut만(id 충돌 시 백업본 우선, 그 외 병합).
- `SCHEMA_VERSION` bump + `SUPPORTED_VERSIONS`에 신규 버전 추가.

### 9) 문서 동기화

- `docs/architecture.md`: 스냅샷 데이터 흐름·새 라우트 반영, 기존 일별 자동 스냅샷 서술 갱신.
- `docs/backup.md`: `assetSnapshots` 테이블 추가.
- `AGENTS.md`: 디렉토리 요약에 `assets/snapshots` 라우트·`components/snapshot/` 반영.

## 테스트

- `test/snapshot/asset-snapshot.test.ts` — 빌더 순수 함수:
  - 5개 VM 모두 있는 정상 케이스(행 매핑·합계·순자산).
  - 일부 VM `undefined`(빈 섹션 폴백).
  - 부채 없음(순자산 = 자산 총액).
  - 저축 USD 환산값(`amountKrw`) 사용 확인.
- `test/db/local-store.test.ts`(또는 신규 파일) — CRUD: 추가/최근 N개 정렬/단건/삭제 (fake-indexeddb).
- `test/db/schema.test.ts` — v7 `assetSnapshots` 테이블 존재.
- 백업 테스트 — export/import 라운드트립에 `assetSnapshots` 포함, 필드 없는 구버전 import 호환.

## 검증

- `npm run typecheck && npm run lint && npm test` 통과.
- 수동: 기록 → 목록 표시 → 상세 표 확인 → 삭제 → 목록 갱신.
  자산 없음 상태에서도 기록 허용(합계 0원 스냅샷 저장 — 빌더의 빈 섹션 폴백과 일관).
  추이 차트: 스냅샷 0~1개(숨김) / 2개 이상(표시) / 20개 초과(최신 20개만, 가장 오래된 막대도
  21번째 값으로 변화량 계산) / 변화량 증가(빨강)·감소(파랑)·첫 기록(막대 없음) 확인.
