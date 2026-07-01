# 업비트 Open API 연동 설계

작성일: 2026-07-01

## 배경 / 목표

dotori는 토스인베스트 Open API로 주식·연금 보유를 자동 동기화하고, 코인·저축은 수동 입력한다. 사용자가 업비트에 소량 보유한 코인(비트코인 등)을 **수동 입력 대신 업비트 Open API로 자동 연동**해, 새로고침 한 번에 잔고·현재가가 갱신되도록 한다.

기존 토스 연동 구조(3계층 + 릴레이)를 최대한 재사용하고, 업비트에 맞는 차이(요청별 JWT 서명, 원화 마켓, 예수금)를 흡수한다.

## 확정된 요구사항 (브레인스토밍 결과)

1. **자동 + 수동 공존**: 업비트에서 가져온 코인은 `AUTO`, 손으로 넣은 코인은 `MANUAL`로 공존한다. 주식 `holdings`의 AUTO/MANUAL·prune 패턴을 코인에 적용한다.
2. **원화 예수금은 현금성으로 분리**: 업비트 계좌의 KRW 잔고는 코인이 아니라 `savings`(현금성) 항목으로 집계한다. **"계좌 현금 → savings AUTO" 흐름을 범용으로 설계**해 향후 토스 예수금도 같은 경로로 붙일 수 있게 한다(이번엔 업비트만 채움).
3. **릴레이 필수 + 릴레이에서 서명**: 업비트도 IP 화이트리스트가 있어 유동 IP인 Vercel(`/api/upbit/*`)로는 프로덕션에서 통과 못 함. 토스처럼 고정 IP 릴레이 서버를 경유하고, **Secret Key를 릴레이로 전송해 릴레이가 JWT를 생성·서명**한다(토스 `relay-handlers`와 대칭). `/api/upbit/*`는 로컬 개발 폴백.

## 업비트 API 특성 (설계 근거)

- 인증: **Access Key + Secret Key**. 요청마다 `HS256` JWT를 만들어 `Authorization: Bearer <jwt>`로 전송. 잔고 조회는 **파라미터 없는 요청**이라 JWT payload가 `{ access_key, nonce }`뿐이며 `query_hash`가 불필요 → 서명이 단순하다.
- `GET /v1/accounts` (서명 필요): 전체 자산. 각 항목 `{ currency, balance, locked, avg_buy_price, avg_buy_price_modified, unit_currency }`.
  - `currency === "KRW"` → **원화 예수금**(가용 `balance` + 주문잠금 `locked`).
  - 그 외 `currency`(예 `"BTC"`) → **코인**. 보유수량 = `balance + locked`, 매수단가 = `avg_buy_price`(unit_currency 기준, 보통 KRW).
- `GET /v1/ticker?markets=KRW-BTC,KRW-ETH` (공개): 현재가 `trade_price`. 여러 마켓 일괄 조회.
- `GET /v1/market/all` (공개): 마켓 목록 → `korean_name`으로 종목 한글명 매핑.
- 통화: 원화(KRW) 마켓 기준이라 **환율 불필요**. 이번 범위는 KRW 마켓 코인만 지원(BTC 마켓 등은 제외, 아래 미포함 범위 참고).

## 데이터 모델 변경 (`lib/types.ts`, `lib/db/schema.ts`)

### ConnectionType
```ts
export type ConnectionType = "TOSS_API" | "UPBIT_API" | "MANUAL";
```
`UPBIT_API` 연결: `clientId` = Access Key, `clientSecretEnc` = 암호화된 Secret Key. 업비트는 요청별 JWT이므로 `tokenCache`를 쓰지 않는다(`accountSeqs`도 미사용).

### CoinHolding 확장
```ts
export interface CoinHolding {
  id: string;
  name: string;
  exchange?: string;
  quantity: number;
  buyPrice: number;
  currentPrice: number;
  note?: string;
  sortOrder: number;
  updatedAt: number;
  // 신규
  source: HoldingSource;      // "AUTO" | "MANUAL"
  connectionId?: string;      // AUTO 행만: 소속 업비트 연결
  market?: string;            // AUTO 행만: 업비트 마켓 코드 "KRW-BTC"
}
```
- 마이그레이션에서 기존 행은 모두 `source: "MANUAL"`로 채운다.
- AUTO 행의 안정적 키: `id = "upbit:" + connectionId + ":" + market`. 재조회 시 같은 id로 upsert → 수량/매수가/현재가 갱신.
- `buildCoinVM`은 변경 없이 그대로 재사용(AUTO 행도 `quantity·buyPrice·currentPrice`만 있으면 계산됨).

### SavingsAccount 확장
```ts
export interface SavingsAccount {
  // ...기존 필드...
  source: HoldingSource;      // "AUTO" | "MANUAL"
  connectionId?: string;      // AUTO 행만
}
```
- 기존 행은 `source: "MANUAL"`로 마이그레이션.
- 업비트 KRW 예수금 → `category: "CHECKING"`(입출금/파킹), `currency: "KRW"`, `amount` = 예수금, `source: "AUTO"`.
- AUTO 예수금 행의 안정적 키: `id = "upbit-krw:" + connectionId` (업비트 연결당 1행).

### Dexie 스키마 v5
```ts
// v5: 코인/저축 AUTO 연동 필드 인덱스 추가
this.version(5).stores({
  coin: "id, sortOrder, connectionId, source",
  savings: "id, category, sortOrder, connectionId, source",
});
```
Dexie는 인덱스만 선언; 신규 속성 자체는 스키마 선언에 없어도 저장된다. `connectionId`·`source` 인덱스는 prune 쿼리를 위해 추가.

## 업비트 클라이언트 (`lib/upbit/`)

토스 `lib/toss/*`와 대응하는 구조. 서버(릴레이/Next 라우트)에서 실행되는 코드다.

### `lib/upbit/upbit-jwt.ts`
- `buildUpbitJwt(accessKey, secretKey): string` — `{ access_key, nonce }` payload로 HS256 JWT 생성. `nonce`는 UUID. Node `crypto`(HMAC-SHA256)로 헤더·페이로드·서명을 직접 조합(외부 의존성 없이). 파라미터 없는 요청 전용이라 `query_hash` 미포함.

### `lib/upbit/upbit-client.ts`
- 타입:
  ```ts
  export interface NormalizedUpbitCoin {
    market: string;      // "KRW-BTC"
    currency: string;    // "BTC"
    name: string;        // korean_name 매핑 결과, 실패 시 currency
    quantity: number;    // balance + locked
    avgBuyPrice: number; // avg_buy_price
    currentPrice: number;// ticker trade_price (조회 실패 시 avgBuyPrice 폴백)
  }
  export interface NormalizedUpbitCash { currency: "KRW"; amount: number; } // balance + locked
  export interface UpbitAccountsResult { coins: NormalizedUpbitCoin[]; cash: NormalizedUpbitCash | null; }
  ```
- `fetchUpbitAccounts(accessKey, secretKey): Promise<{ raw account rows }>` — JWT 서명 후 `GET /v1/accounts`.
- `fetchUpbitTickers(markets: string[]): Promise<Record<market, price>>` — 공개 `GET /v1/ticker`.
- `fetchUpbitMarketNames(): Promise<Record<market, koreanName>>` — 공개 `GET /v1/market/all`.
- `normalizeUpbitAccounts(rows)` — KRW는 `cash`, 나머지는 `coins`로 분리. `KRW-<currency>` 마켓만 코인으로 채택.
- `UpbitError`(status 보유) — 토스 `TossError`와 동일 정책(원문 미노출, status 전파).
- 429 재시도·타임아웃은 토스 `toss-client`의 패턴 재사용.

### `lib/upbit/relay-endpoint.ts`
토스 `relay-endpoint.ts`와 동일 분기:
```ts
export function upbitEndpoint(path: string): { url: string; headers } {
  const base = process.env.NEXT_PUBLIC_RELAY_URL;
  const secret = process.env.NEXT_PUBLIC_RELAY_SECRET;
  // base 있으면 `${base}/upbit${path}` + X-Relay-Secret, 없으면 `/api/upbit${path}`
}
```

## 서버 프록시

### 릴레이 (`relay/src/`) — 프로덕션 경로
- `relay/src/upbit-handlers.ts`:
  ```ts
  export const upbitHandlers = {
    accounts: (b: { accessKey: string; secretKey: string }) =>
      fetchUpbitAccounts(b.accessKey, b.secretKey).then((rows) => ({ rows })),
    tickers: (b: { markets: string[] }) => fetchUpbitTickers(b.markets).then((prices) => ({ prices })),
    markets: () => fetchUpbitMarketNames().then((names) => ({ names })),
  };
  ```
- `relay/src/routes.ts`: `/upbit/accounts`, `/upbit/tickers`, `/upbit/markets` 등록. Fastify body schema(accessKey/secretKey minLength·maxLength, markets 배열 상한). `run()` 헬퍼로 `UpbitError` status 전파, 원문 미노출.

### Next 라우트 (`app/api/upbit/`) — 로컬 개발 폴백
- `accounts/route.ts`(POST `{accessKey, secretKey}`), `tickers/route.ts`(POST `{markets}`), `markets/route.ts`(POST).
- 토스 라우트와 동일: `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `Cache-Control: no-store`, 에러 status 전파.

## 동기화 (`lib/sync/`)

### `refreshUpbit({ key, now })` 신설
`lib/sync/refresh.ts`(또는 `lib/sync/refresh-upbit.ts`)에 추가. `upbitEndpoint` 기반 `proxyPost` 헬퍼 사용(토스 `proxyPost`와 대칭, 토큰 재시도 로직은 불필요).

흐름 (connection별 try/catch로 부분 실패 격리):
1. `listConnections()`에서 `type === "UPBIT_API"` 필터.
2. 각 연결마다:
   - `decrypt(clientSecretEnc, key)` → Secret Key.
   - `proxyPost("/accounts", { accessKey: clientId, secretKey })` → 계좌 rows.
   - `normalizeUpbitAccounts(rows)` → `{ coins, cash }`.
   - 코인 현재가: `proxyPost("/tickers", { markets })`, 한글명: `proxyPost("/markets")`(라운드당 1회 캐시).
   - 코인 반영: 각 코인 `upsertAutoCoin({ connectionId, market, name, quantity, buyPrice, currentPrice, exchange: "업비트" })` → `pruneAutoCoins(connectionId, seenMarkets)`.
   - 예수금 반영: `cash` 있으면 `upsertAutoSavings({ connectionId, ... })`, 없으면(예수금 0) `pruneAutoSavings(connectionId)`로 AUTO 행 제거.
3. 실패는 `failures` 배열에 누적하고 다른 연결은 계속 진행.

### prune 정책 (토스 `pruneAutoHoldings`와 동일 원칙)
- **매도/출금으로 사라진 자산은 정리한다**: `accounts` 응답에 없는 해당 연결의 AUTO 코인 행은 삭제(`pruneAutoCoins(connId, seenMarkets)`), 예수금이 0이면 AUTO savings 행 삭제(`pruneAutoSavings(connId)`).
- **성공 경로에서만 prune**: prune은 `/accounts` 조회가 **성공한 경우에만** 실행한다. connection이 인증 오류·네트워크 오류 등으로 실패해 `catch`로 빠지면 prune을 **건너뛰어**, 일시적 API 오류로 보유가 통째로 삭제되는 사고를 막는다(토스와 동일).
- **MANUAL 행은 보존**: prune은 `source === "AUTO" && connectionId === <해당 연결>` 행만 대상으로 한다. 손으로 넣은 코인·저축, 그리고 **다른 연결**의 AUTO 행은 건드리지 않는다.
- **현재가(ticker)·한글명(markets) 실패는 prune에 영향 없음**: 보유목록·수량·prune 판단은 `/accounts` 응답만으로 확정한다. ticker 조회가 실패하면 그 코인의 **기존 `currentPrice`를 유지**(신규 행이면 `avgBuyPrice`로 폴백)하되, 코인 행 자체는 upsert하고 prune 대상에서 제외한다. 즉 시세 API 장애가 보유목록을 흔들지 않는다.

### `lib/db/local-store.ts` 추가 함수
- `upsertAutoCoin(row)` — id `upbit:<connId>:<market>`로 upsert. AUTO 필드 세팅.
- `pruneAutoCoins(connectionId, seenMarkets)` — 해당 연결의 AUTO 코인 중 이번 응답에 없는 행 삭제(토스 `pruneAutoHoldings` 패턴).
- `upsertAutoSavings(row)` — id `upbit-krw:<connId>`로 upsert(`category: "CHECKING"`, `source: "AUTO"`).
- `pruneAutoSavings(connectionId)` — 해당 연결의 AUTO savings 행 삭제.
- 기존 수동 CRUD(`upsertCoin`/`upsertSavings` 등)는 MANUAL 행만 다루도록 유지(AUTO 행은 UI 편집 잠금).

### React Query (`lib/query/use-assets-refresh.ts`)
`useAssetsRefresh`의 `mutationFn`에 `refreshUpbit({ key })` 합류(주식 `refreshAll`·연금 `refreshPensionPrices`와 함께). `onSuccess`에서 `["portfolio"]`·`["pension"]`에 더해 `["coin"]`·`["savings"]` invalidate 추가. 실패는 기존 `failures` 집계에 병합.

## UI

### 설정 — `components/settings/ConnectionForm.tsx`
- 연동 추가 시 **타입 선택**(토스 / 업비트).
- 업비트 선택 시 입력 필드: 연동 이름, 멤버, **Access Key**, **Secret Key**. 저장 시 Secret Key를 `encrypt(sessionKey, ...)` → `clientSecretEnc`. 기존 시크릿 마스킹·변경 시에만 재암호화(토스 폼 규칙 재사용).
- 목록에서 타입 배지(토스/업비트) 표시.

### 코인 탭 — `app/assets/crypto/*`, `components/coin/*`
- `CoinManageList`: **AUTO 행은 수량·매수가·현재가 편집 잠금**(업비트가 관리) + "업비트" 배지. MANUAL 행만 인라인 편집·삭제. 추가 다이얼로그는 MANUAL 전용.
- 뷰모델/도넛은 그대로(AUTO·MANUAL 합산).

### 현금성 탭 — `app/assets/savings/*`, `components/savings/*`
- 업비트 KRW 예수금 AUTO 행 표시(편집·삭제 잠금 + "업비트" 배지). 일괄 편집·삭제는 MANUAL 행만.

### DESIGN.md
- AUTO 연동 배지·잠금 표기 규칙을 새로 추가한다면 DESIGN.md에 토큰/규칙을 함께 반영(기존 색·컴포넌트 재사용 우선, 신규 규칙 시 문서 동기화).

## 백업 (`lib/backup/backup.ts`)
- `coin`·`savings`·`connections`는 이미 export/import 대상이라 **신규 필드는 자동 포함**된다(전체 객체 bulkPut).
- 복원된 AUTO 행은 다음 새로고침 시 upsert/prune으로 최신화되므로 stale 위험 낮음. `importAll`의 누락 필드 기본값 처리(구버전 호환)만 점검.
- `SCHEMA_VERSION`은 필드 추가만으로는 올릴 필요 없으나, 구버전(누락 `source`) 복원 시 `source` 기본값을 `"MANUAL"`로 채우는 보정 추가.

## 테스트 (`test/` 미러링)
- `upbit-jwt`: payload 구조·서명 검증(고정 key로 결정적 결과, HMAC 재검증).
- `upbit-client`: `normalizeUpbitAccounts` — KRW→cash / 코인 분리, `balance+locked` 합산, `KRW-` 외 마켓 제외, 한글명 매핑·폴백.
- `refreshUpbit`: 프록시 목으로 upsert/prune 호출 검증, connection별 부분 실패 격리, 예수금 없을 때 prune.
- `buildCoinVM`: AUTO+MANUAL 혼재 시 합산·비중 정상.
- 마이그레이션: v4→v5 후 기존 coin/savings 행 `source === "MANUAL"`.

## 컴포넌트 경계 (요약)
- `upbit-jwt` — 서명만. 입력: keys, 출력: JWT. 의존: Node crypto.
- `upbit-client` — API 호출 + 정규화. 입력: keys/markets, 출력: 정규화 구조. 의존: fetch, upbit-jwt.
- `refreshUpbit` — 오케스트레이션. 입력: sessionKey, 출력: failures. 의존: local-store, proxy.
- `local-store` AUTO 헬퍼 — DB 반영. 입력: 정규화 행, 출력: 없음(부수효과).
- UI — 표시·MANUAL 편집. AUTO 행은 읽기 전용.

## 미포함 범위 (YAGNI)
- KRW 마켓 외 코인(BTC/USDT 마켓 페어), 스테이킹·Web3 지갑 잔고.
- 토스 예수금 실제 수집(구조만 범용화, 채우는 건 이번 범위 아님).
- 거래내역·입출금 이력, 실시간(WebSocket) 시세.
- 코인 매수/매도 등 쓰기 API(읽기 전용 연동만).
