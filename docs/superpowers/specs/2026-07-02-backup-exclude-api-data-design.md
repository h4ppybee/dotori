# 백업에서 API 설정·자동 데이터 분리

- 작성일: 2026-07-02
- 대상 모듈: `lib/backup/backup.ts`, `components/settings/BackupPanel.tsx`, `test/backup/*`

## 배경 / 문제

현재 `exportAll`/`importAll`은 IndexedDB의 거의 모든 테이블을 그대로 내보내고 되돌린다(`tokenCache`만 예외).
그 결과 두 가지 문제가 있다.

1. **API 설정이 백업에 섞인다.** `connections`의 `TOSS_API`/`UPBIT_API` 연결(clientId·`clientSecretEnc`·계좌번호)까지
   내보내지고, 불러오기(특히 덮어쓰기)에서 덮어써진다. API 설정은 기기별 민감정보라 백업 파일로 옮겨다닐
   대상이 아니다.
2. **API로 가져온 데이터까지 백업된다.** `source: "AUTO"` 행(토스 보유종목·업비트 코인·업비트 원화예수금)과
   재조회 가능한 캐시(`priceCache`·`fxRates`)가 내보내진다. 이들은 재연결 + 새로고침으로 언제든 복구되므로
   백업 파일에 담을 이유가 없다.

## 목표

- 백업 = **사용자가 직접 입력한 수동 데이터만**.
- API 설정(`TOSS_API`/`UPBIT_API` 연결·토큰)은 내보내지도, 불러오기로 덮어쓰지도 않는다.
- API로 가져온 데이터(AUTO 행·시세/환율 캐시)는 내보내지 않는다.
- 구버전(v1~v3) 백업 파일도 계속 불러올 수 있고, 그 안에 든 API 설정·AUTO·캐시·settings는 **무시**한다.

## 비목표

- 백업 파일 포맷(JSON 구조 `{ schemaVersion, exportedAt, data }`)은 바꾸지 않는다.
- 암호화 방식·세션 볼트·잠금 로직 자체는 바꾸지 않는다(불러오기 후 강제 잠금 호출만 제거).
- API 설정을 별도 파일로 내보내는 기능은 만들지 않는다(YAGNI).

## 테이블 분류

| 구분 | 테이블 / 조건 | 내보내기 | 불러오기 |
|---|---|---|---|
| 수동 데이터 | `members`, `connections`(type `MANUAL`), `holdings`(source `MANUAL`), `savings`(source `MANUAL`), `coin`(source `MANUAL`), `pension`, `debts`, `snapshots`, `sectorOverrides` | 포함 | 기록 |
| API 설정 | `connections`(type `TOSS_API`/`UPBIT_API`), `tokenCache` | 제외 | 건드리지 않음 |
| 자동 데이터 | `holdings`/`savings`/`coin` 중 `source === "AUTO"` | 제외 | 건드리지 않음 |
| 재조회 캐시 | `priceCache`, `fxRates` | 제외 | 건드리지 않음 |
| 보안 앵커 | `settings`(kdfSalt/verifier/privacyAmounts) | 제외 | 건드리지 않음 |
| 세션 | `session` | 제외(기존) | 건드리지 않음(기존) |

### `settings`(salt) 제외 근거

현재는 `settings`를 내보내고 덮어쓰므로 불러오기 후 salt가 바뀌고, `BackupPanel`이 `lock()`으로 재잠금해
새 salt로 세션키를 다시 파생한다.

새 설계에서는 **API 연결을 보존**한다. 그 `clientSecretEnc`는 기존 salt에서 파생한 키로 암호화돼 있으므로,
salt를 백업 파일의 값으로 덮으면 보존된 API 연결을 다시 복호화할 수 없게 되는 **조용한 데이터 손상**이 발생한다.
따라서 `settings`(salt/verifier/privacyAmounts)는 기기 로컬 보안 앵커로 두고 백업에서 완전히 제외한다.

수동 데이터는 평문이라 복호화가 필요 없다. 새 기기에서 복원할 때는 사용자가 먼저 비밀번호를 설정해 그 기기의
salt/verifier를 만든 뒤(로컬), 평문 수동 데이터를 불러온다.

## 상세 설계

### `SCHEMA_VERSION`

- `3` → `4`로 올린다. `SUPPORTED_VERSIONS`에 `4` 추가(`{1,2,3,4}`). 구버전 호환 유지.

### `exportAll`

- "수동 데이터" 테이블만 조회한다.
- mixed 테이블은 조회 후 필터:
  - `connections`: `type === "MANUAL"`
  - `holdings` / `savings` / `coin`: `source === "MANUAL"`
- `priceCache`·`fxRates`·`settings`·`tokenCache`는 payload `data`에서 제외한다.
- payload의 `schemaVersion`은 `4`.

### `importAll`

입력 정제(구버전 백업에도 새 규칙 적용):

- `connections`: `type === "MANUAL"`인 행만 통과. API 연결은 버린다.
- `holdings` / `savings` / `coin`: source 백필(`source ?? "MANUAL"`) 후 `source === "MANUAL"`인 행만 통과.
  AUTO 행은 버린다. (savings/coin의 기존 `withSource` 백필 로직 재사용)
- `priceCache`·`fxRates`·`settings`·`tokenCache`는 어느 모드에서도 기록하지 않는다.

모드별 동작:

- **merge**: 정제된 수동 데이터를 `bulkPut`(기존 행 대체 + 신규 추가, 무관한 행 유지).
- **overwrite**: 아래 테이블만 "기존 행 삭제 후 삽입"으로 완전 교체한다.
  - `connections`: `type === "MANUAL"`인 행만 삭제(API 연결 보존) 후 삽입
  - `holdings` / `coin` / `savings`: `source === "MANUAL"`인 행만 삭제(AUTO 행 보존) 후 삽입
  - `pension` / `debts`: 전체 `clear()` 후 삽입(AUTO 변형 없음)
  - `members` / `sectorOverrides` / `snapshots`: clear 없이 `bulkPut`(upsert).
    - `members`: API 연결의 `memberId`가 dangling 되지 않도록 clear하지 않는다.
    - `sectorOverrides`: symbol 키로 AUTO 종목 섹터도 담기므로 clear하지 않는다(백업의 override는 symbol 단위로 대체).
    - `snapshots`: date 키 일별 히스토리, clear 없이 병합해도 무방.
  - `priceCache`·`fxRates`·`settings`·`tokenCache`·`session`·AUTO 행·API 연결: **어느 모드에서도 미변경**.

기존 `db.transaction("rw", db.tables, ...)`는 유지하되, `overwrite`의 전체 `db.tables.map(t => t.clear())`는
위 선택적 삭제로 대체한다.

MANUAL 행 삭제 방법은 인덱스 활용:
- `connections`는 `type` 인덱스 존재 → `db.connections.where("type").equals("MANUAL").delete()`
- `holdings`/`coin`/`savings`는 `source` 인덱스 존재 → `.where("source").equals("MANUAL").delete()`

### `BackupPanel`

- 불러오기 성공 후 `lock()` 호출 제거. 대신 `useQueryClient().invalidateQueries()`(전체 무효화)로 UI를 갱신한다.
  (salt가 불변이므로 세션키는 유효하고 재잠금이 불필요하다.)
- 다이얼로그 문구 조정:
  - 하단 "불러온 뒤에는 보안을 위해 다시 잠금을 해제해야 해요." 문구 제거.
  - 대신 "API 연동 설정과 자동으로 불러온 자산은 그대로 유지돼요." 취지의 안내 한 줄 추가.
  - 병합/덮어쓰기 설명의 "모든 데이터" 표현이 수동 데이터 기준임을 반영(예: 덮어쓰기 = "직접 입력한 데이터를
    백업 파일로 교체해요").
  - 성공 메시지 "모든 데이터를 JSON 파일로 저장해요."도 수동 데이터 기준 문구로 조정.
- DESIGN.md의 UX 라이팅 규칙(토스 라이팅)을 따른다.

## 데이터 흐름

내보내기: `exportAll()` → 수동 테이블 조회 + MANUAL 필터 → JSON(schemaVersion 4) → Blob 다운로드.

불러오기: 파일 선택 → 병합/덮어쓰기 선택 → `importAll(json, {mode})` → 입력 정제(MANUAL만) →
모드별 기록(API 설정·AUTO·캐시·settings 미변경) → `invalidateQueries()`로 UI 갱신.

## 에러 처리

- JSON 파싱 실패: 기존 "백업 파일을 읽을 수 없어요" 유지.
- 미지원 버전: 기존 "백업 버전이 호환되지 않아요" 유지.
- 트랜잭션 실패: `BackupPanel`이 catch해 에러 배너 표시(기존 흐름 유지).

## 테스트 계획 (`test/backup/*`)

기존 테스트를 새 규칙에 맞게 갱신/추가한다.

1. **export 제외**: seed에 API 연결·AUTO holding·priceCache·fxRate·settings를 넣고 `exportAll` 결과에
   `connections`에 API 연결이 없고, AUTO 행/`priceCache`/`fxRates`/`settings`가 없음을 검증.
2. **export 포함**: MANUAL 연결·MANUAL holding·pension·debts·snapshots·sectorOverrides가 포함됨을 검증.
3. **schemaVersion 4**: `JSON.parse(json).schemaVersion === 4`.
4. **overwrite 보존**: DB에 API 연결 + AUTO holding + priceCache를 둔 상태에서 수동 데이터만 담긴 백업을
   overwrite로 불러오면, API 연결·AUTO holding·priceCache가 그대로 남고 MANUAL 행만 교체됨을 검증.
5. **import 정제(구버전)**: API 연결·AUTO 행·settings·priceCache가 든 v3 백업을 불러와도 그 항목들이
   기록되지 않음을 검증.
6. **구버전 호환**: 기존 v1 백업 로딩 테스트 유지(존재하지 않는 테이블 빈 배열 처리).
7. **tokenCache 제외**: 기존 테스트 유지.
8. **merge**: 기존 merge 동작(수동 행 대체/추가/유지) 유지.

## 검증

`npm run typecheck && npm run lint && npm test` 통과.

## 메모리 관련

`backup-coverage-for-new-data` 메모리(새 Dexie 테이블 추가 시 lib/backup 갱신)와 상충하지 않는다.
이 변경은 "어떤 테이블을 백업할지" 정책을 명확히 하는 것으로, 향후 새 테이블 추가 시 "수동 데이터인지
API/자동/캐시인지"로 분류해 포함 여부를 결정한다는 기준을 세운다.
