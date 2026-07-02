# 외부 API 연동 — 토스인베스트 · 업비트 (OpenAPI)

시세·보유·환율은 두 개의 외부 OpenAPI에서 가져온다. 시크릿·토큰은 **브라우저에서 외부로 직접 나가지 않고 서버(프록시 또는 릴레이)를 경유**한다. 클라이언트는 정규화된 결과만 받는다.

| 소스 | 가져오는 것 | 인증 | 프록시 경로 |
| --- | --- | --- | --- |
| **토스인베스트** | 계좌·보유(주식)·시세(주식/연금)·USDKRW 환율 | OAuth2 client_credentials → Bearer 토큰 | `app/api/toss/*` |
| **업비트** | 코인 보유·예수금(KRW)·현재가·마켓명 | Access/Secret 키 → 요청별 HS256 JWT | `app/api/upbit/*` |

> 📄 이 문서는 외부 연동과 함께 유지한다. 프록시 경로·정규화·토큰/JWT·릴레이 분기·재시도 규칙을 바꾸면 **같은 작업에서 이 문서도 갱신**한다.

관련 파일: [lib/toss/](../lib/toss/) · [lib/upbit/](../lib/upbit/) · [lib/sync/](../lib/sync/) · [app/api/](../app/api/)

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
