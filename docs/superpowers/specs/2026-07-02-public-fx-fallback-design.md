# 공개 환율 API 폴백 — 설계

작성일: 2026-07-02

## 배경 / 문제

USDKRW 환율은 토스 릴레이 `/exchange-rate`를 **인증 토큰**으로만 가져온다
(`lib/sync/refresh.ts`). 토스 연동이 없으면 환율을 얻을 방법이 없어:

- 백업 불러오기 직후(백업은 `fxRates` 캐시 제외) USD 종목이 있으면 `toKrw`가
  예외를 던져 주식 표시·자산 스냅샷 기록이 실패한다.
- 토스 연동 없이 USD 자산만 수동 관리하는 사용자는 환산이 불가능하다.

## 목표

- 토스 연동 없이도 USDKRW 환율을 확보한다: **전체 새로고침 마지막에 오늘자
  환율이 없으면** 공개 환율 API로 가져와 기존 `fxRates` 테이블에 저장.
- 토스 환율이 그날 성공했으면 폴백을 타지 않는다(토스 값 우선).
- 폴백 실패는 기존 동작과 동일하게 조용히 기존 환율 유지.

## 비목표 (YAGNI)

- 환율 수동 입력 UI(폴백으로 충분, 필요 시 추후).
- 주식 탭 단독 새로고침(`useRefresh`)에의 적용(전체 새로고침 경로만).
- USDKRW 외 통화쌍.

## 사용자 결정 사항

1. 접근: 공개 환율 API 폴백(수동 입력·백업 포함 안 대비 채택).
2. API: `open.er-api.com/v6/latest/USD` — 키·인증 불필요, CORS 허용, 일 1회 갱신.
   자산 평가 용도로 일 단위면 충분.
3. 시크릿이 없으므로 프록시 없이 클라이언트에서 직접 호출.
4. 별도 브랜치·PR(`feat/public-fx-fallback`, main 기준).

## 상세 설계

### 1) `lib/sync/fx-fallback.ts` (신규)

- `fetchPublicUsdKrw(): Promise<number>` — 공개 API 호출, `rates.KRW`가
  양의 유한수가 아니면 예외.
- `ensureFxFallback(now?: number): Promise<boolean>` —
  `getFx()`의 `asOf`가 오늘(UTC, `refresh.ts`의 `dayOf`와 동일 기준)이면 스킵(false).
  아니면 공개 API로 가져와 `putFx({ pair: "USDKRW", rate, asOf: now })` 후 true.
  호출 실패는 catch해 false(기존 환율 유지).

### 2) 호출부 — `lib/query/use-assets-refresh.ts`

`refreshAll → refreshPensionPrices → refreshUpbit` **앞에** `await ensureFxFallback()`.
당초 "마지막에" 두려 했으나, `refreshAll`이 끝에서 `buildPortfolio`를 실행하므로
USD 종목 + 환율 부재 상태로 들어가면 폴백에 도달하기 전에 `toKrw` 예외로 죽는다
(구현 중 실구동 검증에서 발견). 시작 시점으로 이동해도 토스 우선순위는 유지된다 —
토스가 그날 성공하면 같은 흐름에서 나중에 환율을 덮어쓴다.
쿼리 무효화는 기존 onSuccess 그대로(portfolio·savings가 새 환율로 재계산).

### 3) 문서 — `docs/external-api.md`

공개 환율 API(무인증·클라이언트 직접 호출·폴백 조건) 연동 절 추가.

## 테스트

- `test/sync/fx-fallback.test.ts` (fetch 모킹 + fake-indexeddb):
  - 정상 응답 → rate 반환 / 저장.
  - HTTP 실패·rates.KRW 비정상(누락, 0, 음수, NaN) → 예외 / ensure는 false·기존 유지.
  - 오늘자 환율 존재 → fetch 미호출 스킵.
  - 어제자(스테일) 환율 → 교체.

## 검증

- `npm run typecheck && npm run lint && npm test` 통과.
- 수동: 환율 없는 상태에서 새로고침 → `fxRates` 채워지고 USD 자산 표시 확인.
