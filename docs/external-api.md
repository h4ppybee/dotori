# 외부 API 연동 — 토스인베스트 · 업비트 · 구글 Apps Script (OpenAPI)

시세·보유·환율은 두 개의 외부 OpenAPI에서 **가져온다(인바운드)**. 시크릿·토큰은 **브라우저에서 외부로 직접 나가지 않고 서버(프록시 또는 릴레이)를 경유**한다. 클라이언트는 정규화된 결과만 받는다. 반대로 구글 시트 내보내기는 앱 데이터를 사용자의 구글 시트로 **내보내는(아웃바운드) 단방향** 연동이며, 사용자 소유 비밀키만 쓰므로 프록시를 거치지 않는다(아래 [구글 시트 내보내기](#구글-시트-내보내기-apps-script-웹앱) 참고). 같은 Apps Script 웹앱을 거쳐 여러 기기가 수동 데이터를 주고받는 **기기 동기화**(아웃바운드+인바운드, 암호문만 오간다)도 프록시 없이 브라우저가 직접 호출한다(아래 [기기 동기화](#기기-동기화-apps-script-sync) 참고).

| 소스 | 가져오는 것 | 인증 | 프록시 경로 |
| --- | --- | --- | --- |
| **토스인베스트** | 계좌·보유(주식)·시세(주식/연금)·USDKRW 환율 | OAuth2 client_credentials → Bearer 토큰 | `app/api/toss/*` |
| **업비트** | 코인 보유·예수금(KRW)·현재가·마켓명 | Access/Secret 키 → 요청별 HS256 JWT | `app/api/upbit/*` |

> 📄 이 문서는 외부 연동과 함께 유지한다. 프록시 경로·정규화·토큰/JWT·릴레이 분기·재시도 규칙·구글 시트 내보내기 계약·기기 동기화 `sync.*` 계약을 바꾸면 **같은 작업에서 이 문서도 갱신**한다.

관련 파일: [lib/toss/](../lib/toss/) · [lib/upbit/](../lib/upbit/) · [lib/sync/](../lib/sync/) · [app/api/](../app/api/) · [lib/sheet-export/](../lib/sheet-export/) · [lib/device-sync/](../lib/device-sync/) · [lib/apps-script/](../lib/apps-script/) · [integrations/apps-script/](../integrations/apps-script/)

---

## 왜 프록시 경유인가

1. **시크릿 은닉**: 토스 `clientSecret`, 업비트 `secretKey`를 브라우저 네트워크에 노출하지 않는다. 서버에서만 사용한다.
2. **업비트 IP 화이트리스트**: 업비트는 API 키에 **허용 IP**를 등록해야 한다. 브라우저 IP는 매번 바뀌므로 **고정 공인 IP를 가진 릴레이 서버**를 경유해야 한다.
3. **CORS·캐시 제어**: 모든 프록시 라우트는 `runtime = "nodejs"`, `dynamic = "force-dynamic"`, 응답에 `Cache-Control: no-store`.

## 릴레이 분기 — 프록시 vs 릴레이

클라이언트는 직접 URL을 만들지 않고 [tossEndpoint](../lib/toss/relay-endpoint.ts) / [upbitEndpoint](../lib/upbit/relay-endpoint.ts)로 경로를 얻는다. 두 함수가 환경변수로 목적지를 분기한다.

```
NEXT_PUBLIC_RELAY_URL 설정?
  ├─ 예  → 릴레이 서버로. 헤더에 X-Relay-Secret(NEXT_PUBLIC_RELAY_SECRET) 첨부
  │        토스: `${RELAY_URL}/token`,  업비트: `${RELAY_URL}/upbit/accounts` …
  └─ 아니오 → 로컬 Next 라우트 `/api/toss/*` · `/api/upbit/*` (개발/자체 호스팅)
```

- **로컬 개발**: 릴레이 미설정 → Next API 라우트가 직접 외부 API를 호출한다.
- **프로덕션**: 릴레이 설정 → 고정 IP 릴레이가 외부 API를 호출(업비트 화이트리스트 충족). Next 라우트와 릴레이는 **동일한 요청/응답 형태**를 유지해야 한다.
- `relayIpForDisplay()`는 `NEXT_PUBLIC_RELAY_URL`(예: `https://138.2.52.151.nip.io`)에서 `nip.io`를 떼어 **업비트에 등록할 IP**를 설정 화면에 안내한다.

---

## 토스인베스트

### 토큰 ([toss-token.ts](../lib/toss/toss-token.ts))

`getValidToken`이 connection별 액세스 토큰을 관리한다.

- `tokenCache`(IndexedDB)에서 캐시를 읽어 **만료 30초 전(`SKEW_MS`)** 까지 유효하면 복호화해 재사용.
- 만료 임박·미존재면 `/token` 프록시로 `client_credentials` 교환 → 받은 토큰을 **`encrypt`로 암호화해** `tokenCache`에 저장(`accessTokenEnc`, `expiresAt`).
- 토큰은 IndexedDB에 **암호문으로만** 저장된다(원문 미영속).

### 호출 ([toss-client.ts](../lib/toss/toss-client.ts) — 서버/릴레이 측)

- `exchangeToken` — `POST /oauth2/token`(client_credentials).
- `fetchAccounts` — `GET /api/v1/accounts` → `accountSeq[]`.
- `fetchHoldings` — `GET /api/v1/holdings`(헤더 `X-Tossinvest-Account`). 응답은 `{ result: { items } }`로 한 단계 더 중첩.
- `fetchPrices` — `GET /api/v1/prices?symbols=…`. **200개 단위 배치**(`PRICES_BATCH_MAX`).
- `fetchExchangeRate` — `GET /api/v1/exchange-rate?baseCurrency=USD&quoteCurrency=KRW`.

**정규화**(`normalize*`)는 신뢰 경계다. `unknown` 응답을 좁혀 숫자 가드(`toNum`)로 거르고, `currency`가 KRW/USD가 아니거나 필수 수치가 없으면 행을 버린다. 일간손익은 `dailyProfitLoss.amount`를 사용.

**429 처리**: `Retry-After` 헤더(초)만큼 대기 후 **1회 재시도**(`waitForRateLimit`, 기본 500ms). `_sleep`은 테스트에서 `setSleep`으로 교체 가능.

### 갱신 오케스트레이션 ([sync/refresh.ts](../lib/sync/refresh.ts))

`refreshAll` — **클라이언트 주도**, 토스 호출은 전부 프록시 경유.

```
connection(TOSS_API)마다:
  토큰 → /accounts → 계좌별 /holdings → upsertAutoHolding → pruneAutoHoldings(매도분 정리)
시세: 보유 종목의 distinct {symbol,currency} → /prices → prevClose 이월 후 putPrice
환율: /exchange-rate → putFx("USDKRW")   (실패해도 기존 환율 유지 — 비치명적)
→ buildPortfolio(순수)로 뷰모델
```

- **부분 실패 격리**: connection 단위 `try/catch`. 실패는 `RefreshFailure[]`로 모아 UI가 표시하고, 나머지는 계속 진행.
- **401 재시도**: `proxyPostWithTokenRetry`가 401을 만나면 `tokenCache`를 지우고 토큰을 재발급해 **1회 재시도**.
- **prevClose 이월**: 저장된 시세의 날짜가 오늘과 다르면 이전 `lastPrice`를 `prevClose`로 굴린다(일간손익 계산용).
- **AUTO 정리**: 성공 경로에서만 `pruneAutoHoldings` — 전송 실패 시 데이터가 날아가지 않도록.
- `refreshPensionPrices` — `symbol`이 있는 연금 계좌의 현재가를 토스 `/prices`(KRW)로 갱신. KRX 상장 ETF/펀드는 보유 여부와 무관하게 심볼로 조회된다.

---

## 업비트

### JWT ([upbit-jwt.ts](../lib/upbit/upbit-jwt.ts) — 서버 측)

`buildUpbitJwt(accessKey, secretKey)` — **요청마다 새 JWT**를 서버에서 서명한다. HS256, payload는 `{ access_key, nonce: randomUUID() }`. 파라미터 없는 요청(`accounts`) 전용이라 `query_hash`는 미포함. 서명 키(`secretKey`)는 서버 밖으로 나가지 않는다.

### 호출 ([upbit-client.ts](../lib/upbit/upbit-client.ts))

- `fetchUpbitAccounts(accessKey, secretKey)` — `GET /v1/accounts`(JWT). 코인 잔고 + KRW 예수금.
- `fetchUpbitTickers(markets)` — `GET /v1/ticker?markets=…` → `{ market: trade_price }`(인증 불필요).
- `fetchUpbitMarketNames()` — `GET /v1/market/all` → `{ market: korean_name }`.
- 타임아웃 15s(`AbortSignal.timeout`). 실패 시 `UpbitError(status, …)`.

### 갱신 ([sync/refresh-upbit.ts](../lib/sync/refresh-upbit.ts))

`refreshUpbit` — 업비트 계좌를 조회해 코인 보유·예수금(AUTO)을 DB에 반영하고 현재가·마켓명을 채운다. `useAssetsRefresh`가 토스 갱신과 함께 호출한다.

---

## 공개 환율 API 폴백 (무인증)

USDKRW 환율의 기본 소스는 토스 `/exchange-rate`(인증 토큰 필요)다. 토스 연동이
없거나 그날 토스 환율을 얻지 못한 경우를 위해 **공개 환율 API 폴백**을 둔다
(`lib/sync/fx-fallback.ts`). 백업 불러오기 직후(백업은 `fxRates` 캐시 제외)
USD 자산이 있을 때 환산이 막히는 문제를 해결한다.

- **엔드포인트**: `https://open.er-api.com/v6/latest/USD` — 키·인증 불필요,
  CORS 허용, 일 1회 갱신(자산 평가 용도로 충분).
- **호출 방식**: 시크릿이 없으므로 프록시 없이 **클라이언트에서 직접** 호출한다
  (프록시 경유 원칙은 시크릿 보호 목적 — 여기엔 해당 없음).
- **폴백 조건**: `useAssetsRefresh`(전체 새로고침) **시작 시** `ensureFxFallback()` —
  `fxRates.asOf`가 오늘(UTC)이 아니면 공개 API로 가져와 저장. 시작 시점인 이유:
  `refreshAll`이 마지막에 `buildPortfolio`를 실행하므로 USD 종목 + 환율 부재
  상태로 들어가면 폴백에 도달하기 전에 실패한다. 토스 환율이 그날 성공하면
  같은 흐름에서 나중에 덮어쓰므로 토스 값이 우선이다. 폴백 실패는 조용히 기존 환율 유지.
- **응답 검증**: `rates.KRW`가 양의 유한수가 아니면 실패로 처리한다.

---

## 프록시 라우트 규약

`app/api/toss/*`, `app/api/upbit/*` 라우트는 공통 규약을 따른다.

- `export const runtime = "nodejs"; export const dynamic = "force-dynamic";`
- 본문에서 자격증명/토큰을 받아(`await req.json()`) `lib/*/…-client`를 호출하고 **정규화 결과만** 반환.
- 성공/실패 모두 `Cache-Control: no-store`.
- 에러는 도메인 에러(`TossError`/`UpbitError`)의 `status`로 분기해 안정적인 코드(`invalid_credentials`, `upbit_error` 등)를 반환. 원문 시크릿·업스트림 본문을 그대로 흘리지 않는다.

**새 엔드포인트를 추가할 때**: (1) `lib/{toss,upbit}/*-client.ts`에 호출·정규화 추가, (2) `app/api/**/route.ts` 프록시 추가, (3) `tossEndpoint`/`upbitEndpoint` 경로가 릴레이·로컬 양쪽에서 동일하게 매핑되는지 확인, (4) 이 문서 갱신.

---

## 구글 시트 내보내기 (Apps Script 웹앱)

dotori의 자산·부채·통장 쪼개기 데이터를 사용자의 구글 시트로 **단방향(앱 → 시트)** 내보낸다. 시트에서 고친 값은 앱에 반영되지 않는다 — 시트는 보기 전용 출력물이다.

관련 파일: [lib/sheet-export/build-payload.ts](../lib/sheet-export/build-payload.ts)(순수 빌더) · [lib/sheet-export/client.ts](../lib/sheet-export/client.ts)(웹앱 클라이언트) · [lib/sheet-export/export.ts](../lib/sheet-export/export.ts)(조립) · [lib/query/use-sheet-export.ts](../lib/query/use-sheet-export.ts) · [components/settings/SheetExportPanel.tsx](../components/settings/SheetExportPanel.tsx) · [integrations/apps-script/](../integrations/apps-script/)(Apps Script 원본·설치 안내)

### 호출 경로 — 프록시 없이 브라우저가 직접 POST

위 토스·업비트와 달리 이 연동은 **프록시를 거치지 않는다.**

- 숨겨야 할 dotori 소유 시크릿이 없다. 대상은 사용자가 자신의 구글 계정으로 직접 배포한 Apps Script 웹앱이고, 쓰는 비밀키(`DOTORI_SECRET`)도 사용자가 그 스크립트 속성에 직접 넣은 값이다.
- Apps Script 웹앱은 CORS preflight(`OPTIONS`)를 처리하지 못한다. `postSheetExport`(`lib/sheet-export/client.ts`)는 `Content-Type: text/plain;charset=utf-8`으로 보내 preflight를 피한다.
- Apps Script는 HTTP 상태 코드를 지정할 수 없어 **항상 200 + 본문 `{ ok, ... }`** 으로 성공 여부를 판정한다. 타임아웃은 30초(`SHEET_EXPORT_TIMEOUT_MS`), `AbortController`로 제어 — 스크립트의 `LockService.tryLock`(5초) 대기 + 실제 탭 쓰기 시간을 넉넉히 포함하는 값이다(락 대기보다 짧으면 스크립트가 아직 쓰는 중인데 클라이언트가 먼저 네트워크 실패로 오판할 수 있다).
- 전송·타임아웃·응답 파싱은 [lib/apps-script/request.ts](../lib/apps-script/request.ts)의 `postAppsScript`를 기기 동기화와 공유한다.

### 페이로드 계약

```json
{
  "version": 1,
  "secret": "<공유 비밀키>",
  "tabs": [
    { "name": "dotori_자산", "rows": [["자산군", "구분", "..."], ["주식", "NASDAQ", "..."]] }
  ]
}
```

- 셀 값은 `string | number`만 허용(빈 칸은 `""`). 문자열 셀은 스크립트가 쓰기 전 대상 범위에 텍스트 서식(`"@"`)을 걸어 `"005930"` → `5930`, `"=1+1"` → 수식 실행으로 바뀌지 않게 한다. 숫자 셀은 숫자 서식(`"General"`)으로 되돌린다. 셀 타입은 앱이 보낸 JS 타입(string/number)으로 그대로 결정된다.
- 탭 이름이 `dotori_` 접두사로 시작하는 것만 스크립트가 허용한다(다른 탭 덮어쓰기 방지). 현재 앱이 보내는 탭은 `SHEET_TABS`(`lib/sheet-export/build-payload.ts`) 기준 `dotori_자산`·`dotori_부채`·`dotori_통장쪼개기`·`dotori_meta`.
- 스크립트(`writeTab_`, `sheet-export.gs`)는 `tabs` 배열을 **순서대로** 덮어쓰고, `dotori_meta`를 맨 마지막에 쓴다. 즉 `dotori_meta`의 내보낸 시각은 "모든 탭이 끝까지 성공적으로 쓰인 시점"을 뜻한다 — 중간에 실패하면(예: 네 번째 탭에서 예외) 앞선 탭들은 이미 갱신된 채로 남고 `dotori_meta`만 갱신되지 않아, meta 시각과 다른 탭의 실제 반영 시점이 어긋날 수 있다.
- `dotori_자산` 열 순서(A~P): 자산군 · 구분 · 이름 · 기관 · 코드 · 수량 · 매수금액 · 평가금액 · 손익 · 수익률 · 통화 · 섹터·비고 · 월불입액 · 이율 · 만기 · 상품구분. M~P는 부가 정보로 저축(월불입액·이율(소수)·만기)과 연금(상품구분 = `fundType`)만 채우고 나머지 자산군은 빈 칸이다. 사용자 시트의 기존 탭이 이 열 위치를 수식으로 참조하므로 **기존 열의 순서·의미는 바꾸지 않고, 새 열은 맨 뒤에만 추가**한다.
- `buildSheetPayload`는 순수 함수다 — DB·비동기·`Date` 없이 VM 5종(portfolio·savings·pension·coin·debt) + 통장 쪼개기 항목만으로 탭별 2차원 배열을 만든다. 화면과 같은 VM 빌더를 쓰므로 시트 금액과 앱 화면 금액이 일치한다.

### 응답과 오류 메시지 매핑

스크립트 응답 `{ ok: true, writtenAt }` 또는 `{ ok: false, error: "UNAUTHORIZED" | "BAD_REQUEST" | "BUSY" | "<message>" }`를 `postSheetExport`가 `SheetExportResult`로 정규화하고, `SHEET_EXPORT_MESSAGES`(`lib/sheet-export/client.ts`)로 사용자 메시지에 매핑한다.

| 상황 | 사용자 메시지 |
| --- | --- |
| fetch 실패·타임아웃(네트워크) | "시트에 연결하지 못했어요." |
| HTTP 비정상 응답, 또는 JSON 파싱 실패, 또는 `error`가 `BAD_REQUEST`·그 외 문자열이 아닌 값 | "시트 스크립트 응답을 읽지 못했어요. 스크립트를 최신 버전으로 배포했는지 확인해 주세요." |
| `error: "UNAUTHORIZED"`(비밀키 불일치·미설정) | "비밀키가 스크립트 설정과 달라요." |
| `error: "BUSY"`(`LockService.tryLock` 5초 초과) | "다른 내보내기가 진행 중이에요. 잠시 후 다시 시도해 주세요." |
| 그 외 문자열 `error`(스크립트 런타임 오류 등) | "시트에 쓰지 못했어요. `<스크립트가 보낸 메시지>`" |

### 보안

- 웹앱은 "액세스: 모든 사용자"로 배포하므로 **비밀키가 유일한 보호 수단**이다. 비밀키를 아는 사람은 누구나 해당 URL에 써넣을 수 있다.
- 앱은 비밀키를 평문으로 저장하지 않는다 — 세션 키(CryptoKey)로 암호화해 `sheetExport` 테이블의 `secretEnc`에 저장한다(`lib/db/local-store.ts`의 `getSheetExportConfig`/`saveSheetExportConfig`). PIN·비밀번호 변경 시 `rekeyVault`(`lib/crypto/rekey.ts`)가 재암호화한다.
- 스크립트는 `dotori_*` 탭만 쓰므로, 비밀키가 유출돼도 시트의 기존 탭(수식·대시보드 등)은 덮이지 않는다.
- 시트에는 평문 금액이 그대로 올라간다. 시트 공유 범위는 사용자 책임 — 설정 패널 안내 문구에 명시돼 있다.

### 호출 시점

- 통합 갱신(`useAssetsRefresh`) 성공 시 **기다리지 않고(fire-and-forget)** 내보낸다(`runSheetExport`) — 갱신 스피너·쿼리 무효화가 내보내기 때문에 늦어지지 않게 하기 위함. 일부 연결이 실패해도(`failures` 있음) DB의 마지막 값으로 내보낸다. `onSuccess`는 렌더 시점 클로저가 아니라 그 순간의 `useAppStore.getState().sessionKey`를 다시 읽는다 — 갱신 도중 화면을 벗어나고(훅 언마운트) 자동 잠금이 걸려도 stale 키로 내보내지 않기 위함.
- 설정 화면 [SheetExportPanel](../components/settings/SheetExportPanel.tsx)의 "지금 내보내기" 버튼(수동, `useSheetExportNow`). 결과가 `skipped`면(캐시엔 연결 상태인데 DB엔 설정이 없는 경우 — 다른 탭에서 해제 등) 설정 조회를 무효화해 화면을 미연결 상태로 맞춘다.
- 두 경로 모두 `runSheetExport`를 거쳐 결과를 `stores/app-store.ts`의 `lastSheetExport`에 기록한다(자동·수동 공용 단일 원천). 설정이 없으면 `{ status: "skipped" }`로 넘어가고, 이전에 남아있던 성공/실패 기록은 지운다(`clearLastSheetExport`) — 연결 해제 후에도 지난 실패 배너가 남지 않게. 연결 해제(`useClearSheetExportConfig`)·로컬 데이터 전체 삭제 시에도 같은 이유로 기록을 지운다.
- `runSheetExport`는 모듈 스코프에서 진행 중인 호출을 공유하는 single-flight다 — 자동·수동 호출이 겹쳐도 Apps Script에 동시에 두 번 POST하지 않는다(겹치면 `LockService`가 뒤 요청을 `BUSY`로 튕긴다).

### 설치

Apps Script 원본과 설치 절차·수동 확인 체크리스트는 [integrations/apps-script/README.md](../integrations/apps-script/README.md) 참고.

---

## 기기 동기화 (Apps Script sync.*)

같은 Apps Script 웹앱이 구글 시트 내보내기와 **기기 동기화 저장소**를 겸한다. 여러 기기가 같은 웹앱 URL·`DOTORI_SECRET`으로 암호화 봉투를 올리고(`sync.put`) 받는다(`sync.meta`/`sync.get`). 봉투는 앱이 동기화 키로 암호화한 값이라 스크립트도 구글도 내용을 읽지 못한다. 상세 흐름·판단 규칙은 [device-sync.md](device-sync.md) 참고.

관련 파일: [lib/device-sync/client.ts](../lib/device-sync/client.ts) · [lib/apps-script/request.ts](../lib/apps-script/request.ts) · [integrations/apps-script/sheet-export.gs](../integrations/apps-script/sheet-export.gs)

- 공통: 구글 시트 내보내기와 같은 웹앱 URL·`DOTORI_SECRET`을 쓰고, 같은 `Content-Type: text/plain` POST로 호출한다. 본문 상한은 5MB — 앱이 `sync.put` 전송 전 `SYNC_MAX_BODY_CHARS`로 먼저 막고, 스크립트도 `MAX_BODY_CHARS`로 한 번 더 막는다. `doPost`의 분기 순서는 "본문 JSON 파싱 → 객체인지 검사 → 비밀키 대조 → `action` 분기 → 액션별 본문 검증"이다. `action`이 없거나 `"sheet.export"`면 기존 시트 내보내기 핸들러로 간다(하위 호환).
- 요청·응답:

| 액션 | 요청(추가 필드) | 성공 응답 | 그 외 |
| --- | --- | --- | --- |
| `sync.meta` | 없음 | `{ ok, empty: true }` 또는 `{ ok, revision, savedAt, deviceName, keyId }` | — |
| `sync.get` | 없음 | `{ ok, empty: true }` 또는 `{ ok, revision, savedAt, deviceName, keyId, blob }` | `{ ok: false, error: "SYNC_FILE_MISSING" }` |
| `sync.put` | `{ baseRevision, keyId, deviceName, blob, force?, reset? }` | `{ ok, revision, savedAt }` | `{ ok: false, error: "CONFLICT", remote: { revision, savedAt, deviceName } }` \| `KEY_MISMATCH` \| `BUSY` \| `BAD_REQUEST` |

- `sync.put` 규칙: 메타가 아예 없는 빈 서버는 첫 저장이라 `baseRevision`을 검사하지 않고 그대로 받는다(저장되는 `revision`은 1부터 시작 — 빈 서버의 현재 `revision`은 0으로 본다). 메타의 `keyId`와 요청의 `keyId`가 다르고 `reset`이 아니면 `KEY_MISMATCH`. `baseRevision`이 현재 `revision`과 다르고 `force`·`reset` 둘 다 아니면 `CONFLICT`(현재 메타를 `remote`로 돌려준다). 저장 순서는 "새 버전 파일(`v-<revision>.json`) → `current.json` → 10개 초과분 정리 → 메타 갱신" 순이라, 메타가 가리키는 revision의 파일은 항상 존재한다(중간 실패 시 메타는 이전 revision 그대로 남는다). `sync.put`은 `LockService.tryLock(5000)`을 구글 시트 내보내기와 공유한다. `sync.get`은 락 없이 메타가 가리키는 `v-<rev>.json`을 바로 읽는다(메타를 마지막에 쓰므로 그 파일은 항상 있다고 가정한다).
- 오류 → 사용자 메시지(`DEVICE_SYNC_MESSAGES`, [lib/device-sync/messages.ts](../lib/device-sync/messages.ts)):

| 상황 | 사용자 메시지 |
| --- | --- |
| fetch 실패·타임아웃(네트워크) | "동기화 저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요." |
| `error: "UNAUTHORIZED"`(비밀키 불일치) | "비밀키가 스크립트 설정과 달라요." |
| `error: "BUSY"`(락 대기 초과) | "다른 기기가 저장하는 중이에요. 잠시 후 다시 시도해 주세요." |
| `error: "KEY_MISMATCH"`, meta/get의 `keyId` 불일치, 봉투 복호화(인증) 실패 | "동기화 키가 맞지 않아요. 다른 기기의 키를 확인해 주세요." |
| `sync.get`의 `error: "SYNC_FILE_MISSING"` | "동기화 파일을 찾지 못했어요. 다른 기기에서 다시 동기화해 주세요." |
| HTTP 비정상·JSON 파싱 실패, 또는 `error`가 `BAD_REQUEST`·그 외 문자열이 아닌 값(예전 스크립트가 `sync.*` 분기 없이 `BAD_REQUEST`를 돌려주는 경우 포함) | "동기화 스크립트 응답을 읽지 못했어요. 스크립트를 최신 버전으로 배포했는지 확인해 주세요." → 재배포 안내 |
| 그 밖의 문자열 `error`(스크립트 런타임 오류 등) | "동기화 파일을 저장하지 못했어요. `<스크립트가 보낸 메시지>`" |
| `sync.put` 본문이 상한(5MB)을 넘음(`tooLarge`) | "동기화할 데이터가 너무 커요. 오래된 자산 스냅샷을 정리한 뒤 다시 시도해 주세요." |
| 원격 `syncVersion`이 앱보다 높음(`newerVersion`) | "앱을 새로고침해 최신 버전으로 업데이트해 주세요." |
