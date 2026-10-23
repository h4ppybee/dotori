# 기기 동기화 (E2E 암호화)

여러 기기(본인·가족)가 같은 수동 데이터를 공유한다. 브라우저에서 랜덤 동기화 키로 암호화한 뒤, 시트 내보내기와 같은 Apps Script 웹앱을 거쳐 배포자 구글 드라이브 `dotori-sync/`에 저장한다. dotori 서버와 구글은 내용을 볼 수 없다.

> 📄 `lib/device-sync/`·`lib/apps-script/`·`integrations/apps-script/sheet-export.gs`의 sync.* 부분을 바꾸면 이 문서도 함께 고친다.

관련 파일: lib/device-sync/{key,envelope,collect,apply,client,decide,engine,messages,device-name}.ts · lib/apps-script/request.ts · lib/query/use-device-sync.ts · components/settings/DeviceSyncPanel.tsx · components/sync/SyncConflictDialog.tsx

## 단계

- 1단계(현재): 잠금 해제 시 받기, "지금 동기화", 통합 갱신 후 올리기, 충돌 다이얼로그, 설정 패널.
- 2단계(예정): 변경 감지 디바운스 올리기, 화면 복귀 받기, 탭 간 navigator.locks, RefreshBar 실패 표시.

## 동기화 대상

대상은 백업과 같은 수동 데이터(`readManualTables`)에서 `snapshots`(과거 일간 자동 스냅샷, 이미 폐기된 레거시 테이블)만 뺀 12개 테이블이다(`SYNC_TABLES`, `lib/device-sync/collect.ts`). `pension`·`debts`·`assetSnapshots`는 자동/수동 구분이 없어 통째로 동기화 대상이다.

| 테이블 | 대상 행 | 적용 방식 |
| --- | --- | --- |
| `members` | 전체 | 병합 — 아래 "members 병합 규칙" 참고 |
| `connections` | `type === "MANUAL"` | MANUAL만 교체(API 연동 `connections`는 보존) |
| `holdings` | `source === "MANUAL"` | MANUAL만 교체(AUTO 보유는 보존) |
| `savings` | `source === "MANUAL"` | MANUAL만 교체(AUTO 보존) |
| `coin` | `source === "MANUAL"` | MANUAL만 교체(AUTO 보존) |
| `pension` | 전체 | 전체 교체(삭제 전파) |
| `debts` | 전체 | 전체 교체 |
| `assetSnapshots` | 전체 | 전체 교체 |
| `goal` | 전체 | 전체 교체 |
| `envelopeItems` | 전체 | 전체 교체 |
| `envelopeConfig` | 전체 | 전체 교체 |
| `sectorOverrides` | 전체 | 전체 교체 |

**members 병합 규칙**: 이 기기의 setup이 만든 "나" 멤버를 이 기기의 API 연동(`connections`, `type !== "MANUAL"`)이 참조하고 있을 수 있다. `members`를 원격 값으로 통째로 바꾸면 그 참조가 고아가 되므로, 원격 `members` + "이 기기의 API 연동이 참조하면서 원격에는 같은 id가 없는 로컬 멤버"만 함께 남긴다(`lib/device-sync/apply.ts`).

> 알려진 1단계 동작: 각 기기의 setup이 만든 "나" 멤버는 id가 기기마다 다르다. API 연동이 있는 기기는 위 규칙으로 자기 "나"를 남기고, 그 멤버가 다음 올리기에 실려 다른 기기에도 퍼지므로 다른 기기에서는 "나"가 두 번 이상 보일 수 있다. 데이터가 사라지지는 않는다. 필요하면 남는 멤버를 직접 정리하고, 기기별 멤버 매핑은 이후 단계에서 다룬다.

동기화 대상이 아닌 것: `snapshots`(백업에는 포함되지만 동기화에서는 제외), 그리고 기기별 설정 `sheetExport`·`syncConfig`·`session`·`settings`·`tokenCache`(모두 기기마다 다르거나 민감한 값이라 공유하지 않는다).

## 변경 판단 — 내용 해시

- `canonicalize`(`lib/device-sync/collect.ts`)는 테이블을 이름순으로, 각 테이블 안에서는 기본 키순(대부분 `id`, `sectorOverrides`만 `symbol`)으로 정렬하고 객체 키도 사전순으로 정렬한 뒤 `undefined` 값을 뺀 JSON 문자열을 만든다. 순수·동기 함수라 Dexie 트랜잭션 안에서도 바로 쓸 수 있다.
- `HASH_EXCLUDED_FIELDS`는 해시 계산에서만 빼는 휘발성 필드다 — 모든 테이블의 `updatedAt`(기기마다 다른 시각). 여기에 행 조건부 제외가 하나 더 있다: `pension.currentPrice`는 **`symbol`이 공백이 아닌 문자열인 행**(연금 시세 갱신 `refreshPensionPrices`가 기기마다 다른 시세로 채우는 행)에서만 뺀다. `symbol`이 없는 연금 행의 현재가는 사용자가 직접 입력한 값이므로 해시에 포함한다 — 그 값을 고치면 "변경 있음"이 되어 올라간다. 보낼 때는 제외 필드도 그대로 포함하고 "바뀐 게 있는지" 판단할 때만 제외한다. ⚠️ 동기화 대상 테이블에 새 휘발성 필드(시세·자동 갱신 시각 등)를 추가하면 여기도 함께 갱신해야 한다.
- `syncConfig.lastSyncedHash`는 마지막으로 성공한 직후 로컬에서 다시 계산한 해시다. 받기는 적용 트랜잭션 안에서 만든 적용 후 canonical을 해시해 기록한다(`applySyncPayload`가 돌려준 문자열을 트랜잭션 밖에서 해시) — 커밋과 재수집 사이에 사용자가 고친 내용이 "동기화됨"으로 잘못 기록되는 틈을 없앤다.
- 수집·해시·봉인은 같은 수집 결과 객체 하나로 한다 — 그래야 올릴 때 봉인한 내용과 성공 후 기록하는 해시가 항상 같은 스냅샷에서 나온다(`보낸 내용 = 해시 계산 내용`).

## 암호화와 키

- 32바이트 랜덤 키(`generateSyncKey`)를 Crockford base32 4자 그룹(`XXXX-XXXX-…`, 13그룹)으로 표기한다(`lib/device-sync/key.ts`). 입력은 관대하게 파싱한다 — 공백·하이픈·대소문자를 무시하고 헷갈리는 글자를 바로잡는다(`O` → `0`, `I`·`L` → `1`).
- 봉투(`SyncEnvelope`)는 `{ v: 1, alg: "A256GCM", iv, ct, keyId }`(AES-GCM 256, 96비트 랜덤 IV, `iv`·`ct`는 base64). 평문은 `{ syncVersion: 1, data, sentAt }` JSON이다(`lib/device-sync/collect.ts`의 `encodeSyncPayload`/`decodeSyncPayload`).
- `syncConfig`(Dexie v11) 단일 행에 `syncKeyEnc`(동기화 키를 세션 키로 암호화한 문자열)·`keyId`·`deviceName`·`lastRevision`·`lastSyncedHash`를 둔다. 기기별 민감 설정이라 백업·동기화 대상이 아니다. PIN·비밀번호 변경 시 `rekeyVault`(`lib/crypto/rekey.ts`)가 `syncKeyEnc`를 새 키로 재암호화하는데, 복호화·재암호화에 실패하면(예전 키로 암호화된 값이 손상됐거나 깨졌을 때) 행을 통째로 지운다 — 사용자가 설정에서 동기화 키를 다시 입력하면 된다.

## 흐름

- **받기 `pullIfNewer`**: `sync.meta` 호출 → (meta 기준으로 받을 게 없으면 noop | `meta.keyId`가 이 기기 키와 다르면 오류 | 받을 게 있으면 `sync.get`으로 이어감) → 로컬을 수집해 해시를 내고 → `sync.get` 응답을 받아(이후 모든 revision은 이 응답 값을 쓴다 — meta와 get 사이에 다른 기기가 먼저 올렸을 수 있으므로) → 봉투를 열어 → (원격 해시 == 로컬 해시면 자동 해소 | 로컬이 마지막 동기화 이후 그대로면 적용 | 둘 다 바뀌었으면 충돌). 적용은 `applySyncPayload`가 단일 트랜잭션 안에서 "받기 시작 시점의 canonical과 지금이 같은지"(`expectedCanonical`)까지 검사하며 성공하면 엔진이 트랜잭션 밖에서 `invalidateQueries()`를 부른다.
- **올리기 `pushIfChanged`**: 로컬 해시가 `lastSyncedHash`와 같으면 noop. 다르면 `sync.put`. 서버가 `CONFLICT`를 돌려주면(다른 기기가 먼저 올림) 바로 받기 경로(`pullCore`)로 넘어간다.
- **지금 동기화 `syncNow`**: 받기 → (충돌·오류·보류·꺼짐이 아니면) 올리기. 설정의 "지금 동기화하기"와 통합 갱신 성공 후 둘 다 이 경로를 쓴다 — 받기가 먼저라, 갱신 대기 타임아웃으로 보류된 받기도 여기서 다시 시도된다 — 진행 중이던 그 받기에 합류해 `deferred`를 받으면 새 받기를 한 번 더 시작한 뒤 올린다.
- **충돌 선택**(`resolveConflict`): "다른 기기 내용 받기" = 기대값 비교 없이 원격으로 교체(`receiveRemote`). "이 기기 내용으로 덮기" = `force: true`로 올려 서버 값을 그대로 덮어쓴다.
- **충돌 닫기(보류)**(`dismissConflict`): 그 원격 revision을 `app-store.dismissedConflictRevision`(비영속)에 기억한다. 같은 revision의 충돌은 자동 동기화(잠금 해제 받기·통합 갱신 후)에서 다시 띄우지 않고 `lastDeviceSync`에만 남긴다 — meta의 revision이 닫은 revision과 같으면 `sync.get`·복호화도 건너뛴다(설정 패널에 "다른 기기에서 바꾼 내용과 달라요" 표시). 새 revision이 오거나, 사용자가 설정에서 "지금 동기화하기"를 누르면(`syncNow({ reopenDismissedConflict: true })`) 다시 묻는다. 받는 도중 잠긴 경우(`sessionKey === null`)에도 다이얼로그 없이 기록만 남긴다.
- **설정 흐름**(설정 패널): "처음 시작하기"(`startFirstDevice`)는 빈 서버일 때만 새 키로 설정을 저장하고 첫 올리기를 직접 실행한다 — 결과가 `pushed`가 아니면(그사이 다른 기기가 먼저 시작해 `KEY_MISMATCH`, 네트워크 오류 등) 설정을 지우고 오류를 보여준다. "새 키로 다시 시작하기"(`restartWithNewKey`)는 reset put이 `pushed`가 아니면 이전 설정(키·revision·해시)을 그대로 되돌린다. 두 흐름 모두 되돌리기 전에 `sync.meta`를 한 번 더 보고, 서버 `keyId`가 방금 만든 키와 같으면(서버에는 저장됐고 응답만 유실) 새 설정을 유지하고 성공으로 처리한다 — `lastSyncedHash`가 비어 있으므로 다음 받기에서 내용 비교로 자동 해소된다. "다른 기기에서 연결하기"(`connectExistingDevice`)는 받기에 실패하면 설정을 지운다. 모든 설정 흐름은 throw하지 않고 결과(`status: "error"` 포함)를 돌려준다.
- **single-flight**: 모듈 큐(`enqueue`/`exclusive`)로 모든 동기화 작업을 한 번에 하나씩만 실행한다. 받기·올리기는 이미 진행 중이면 그 프로미스를 그대로 돌려준다(탭 안에서만 — 탭 간 동시 실행 방지는 2단계 `navigator.locks` 몫). `syncConfig`를 바꾸는 설정 흐름(처음 시작·연결·새 키·끄기)도 같은 큐에서 실행하므로, 진행 중인 받기가 끈 뒤에 적용·기록되지 않고, 설정 저장 전에 시작된 올리기(`skipped`)를 첫 올리기로 착각하지 않는다.

## 잠금 해제·갱신 순서

- `startDeviceSync`(`QueryProvider`의 `useEffect`에서 등록)는 `sessionKey`가 `null` → 값으로 바뀌는 순간을 `useAppStore.subscribe`로 감지해 **동기적으로** `pullIfNewer()`를 시작한다. zustand 구독 콜백이 `set` 안에서 바로 실행되므로, 같은 틱에 마운트되는 자산 화면의 갱신 effect보다 먼저 `pendingPull`이 잡힌다. 등록 시점에 이미 잠금 해제 상태라면(예: 자동 잠금 해제 복원) 그 자리에서 즉시 시작한다.
- `useAssetsRefresh`(통합 갱신)와 `useRefresh`(주식 갱신) 모두 `mutationFn` 맨 앞에서 `awaitPendingPull(10_000)`을 부른다 — 진행 중인 받기가 끝날 때까지 최대 10초 기다린다. 타임아웃이 나면 그 받기를 "보류"로 표시해, 갱신이 진행되는 동안에는 적용 단계로 넘어가지 않게 한다(갱신이 읽은 값 위에 받기가 끼어드는 것을 막는다).
- `useAssetsRefresh`가 성공하면 `syncNow()`(받기 → 올리기)를 기다리지 않고 부른다(fire-and-forget) — 보류된 받기를 다시 시도하고, 통합 갱신으로 바뀐 내용(예적금 자동 증가 등)을 바로 올려 다른 기기와의 충돌 가능성을 줄인다. 받을 것·바뀐 것이 없으면 `sync.meta` 요청 하나로 끝난다.
- **갱신 쓰기 범위**: 연금 시세 갱신(`lib/sync/refresh.ts`)은 `pension` 행의 `currentPrice`·`updatedAt`만 `update`하고 예적금 자동 증가(`lib/sync/refresh-savings.ts`)는 `savings` 행의 `amount`·`balanceAsOf`·`updatedAt`만 단일 트랜잭션에서 `update`한다 — 행 전체를 다시 쓰지 않는다. 이는 "갱신이 받기를 기다리는" 순서와 함께, 반대 방향(갱신이 먼저 읽고, 그 사이 받기가 적용되고, 갱신이 뒤늦게 전체 행을 써서 받은 내용을 덮는) 경합도 막는다. 새 자동 갱신 경로를 추가할 때도 이 규칙(계산한 필드만 `update`)을 따른다.

## 오류 처리

| 상황 | 처리 |
| --- | --- |
| 동기화 꺼짐·시트 미연결·잠금 상태 | 아무 것도 하지 않음(`{ status: "skipped" }`, 기록하지 않음) |
| 네트워크 실패·타임아웃 | "동기화 저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요." |
| HTTP 비정상·JSON 파싱 실패·예전 스크립트(`action` 분기 없음)의 `BAD_REQUEST` | "동기화 스크립트 응답을 읽지 못했어요. 스크립트를 최신 버전으로 배포했는지 확인해 주세요." |
| `UNAUTHORIZED`(비밀키 불일치) | "비밀키가 스크립트 설정과 달라요." |
| `BUSY`(다른 요청이 락을 쥐고 있음) | "다른 기기가 저장하는 중이에요. 잠시 후 다시 시도해 주세요." |
| `KEY_MISMATCH`·meta/get의 keyId 불일치·봉투 복호화(인증) 실패 | "동기화 키가 맞지 않아요. 다른 기기의 키를 확인해 주세요." — 적용하지 않는다 |
| `sync.get`의 `SYNC_FILE_MISSING`(메타가 가리키는 버전 파일이 드라이브에 없음) | "동기화 파일을 찾지 못했어요. 최신 내용이 있는 기기에서 '새 키로 다시 시작하기'를 눌러 주세요." — 자동으로 이 기기 내용을 덮어 올리지 않는다(아래 참고) |
| 처음 시작·새 키로 다시 시작의 올리기가 `pushed`가 아님(오류가 아닌 결과) | "동기화 내용을 올리지 못했어요. 잠시 후 다시 시도해 주세요." — 처음 시작은 설정을 지우고, 새 키는 이전 설정으로 되돌린다 |
| 그 밖의 스크립트 오류 문자열 | "동기화 파일을 저장하지 못했어요. `<스크립트가 보낸 메시지>`" |
| `sync.put` 본문이 상한(`SYNC_MAX_BODY_CHARS`, 5MB)을 넘음 | "동기화할 데이터가 너무 커요. 오래된 자산 스냅샷을 정리한 뒤 다시 시도해 주세요." |
| 원격 `syncVersion`이 앱보다 높음 | 적용하지 않음 — "앱을 새로고침해 최신 버전으로 업데이트해 주세요." |
| `CONFLICT`(받기에서 두 쪽 다 바뀜) | 자동 해소를 먼저 시도하고, 아니면 충돌 다이얼로그 |
| 적용 도중(수집~적용 사이) 로컬이 바뀜(`expectedCanonical` 불일치) | 트랜잭션 롤백 후 충돌로 전환 |
| 이 기기에 저장한 `syncConfig`/`sheetExport` 복호화 실패 | "이 기기에 저장한 동기화 정보를 읽지 못했어요. 동기화를 끄고 다시 연결해 주세요." |

사용자 메시지 상수는 `DEVICE_SYNC_MESSAGES`(`lib/device-sync/messages.ts`)에 모여 있다.

**`SYNC_FILE_MISSING`을 자동으로 복구하지 않는 이유**: 파일이 사라진 revision은 다른 기기가 올린 최신본일 수 있다. 이 기기가 해시 비교를 건너뛰고 자기 내용을 올리면 새 revision이 생기고, 마지막 동기화 이후 그대로인 다른 기기는 그 (더 오래된) 내용을 다이얼로그 없이 받아 자기 최신 변경을 잃는다. 그래서 사용자가 최신 내용이 있는 기기를 골라 "새 키로 다시 시작하기"(reset put — 파일이 없어도 동작)를 누르고, 나머지 기기는 "동기화 끄기" 뒤 새 키로 다시 연결해 확인 다이얼로그를 거쳐 받게 한다.

## 보안 메모

- 웹앱 URL·비밀키가 유출되면 서버에 저장된 암호화 봉투를 읽을 수는 있지만 동기화 키가 없으면 내용을 해독할 수 없다. 동기화 키 없이 만든 봉투로 덮어쓰면 AES-GCM 인증에 실패해 적용이 거부된다.
- 다만 URL·비밀키를 가진 사람은 예전에 받아 둔 **유효한 봉투를 `force`로 다시 올려(재전송)** 서버 내용을 옛 버전으로 되돌릴 수 있다. 그 봉투는 진짜 키로 만든 것이라 다른 기기가 정상 데이터로 받는다. 서버는 봉투를 해독하지 못하므로 이를 막지 못한다 — URL·비밀키도 동기화 키만큼 비밀로 다루고, 유출이 의심되면 `DOTORI_SECRET`을 바꾸고 "새 키로 다시 시작하기"를 한다. 드라이브에 남은 최근 10개 버전(과 휴지통의 이전 버전)으로 직접 되돌릴 수도 있다.
- 동기화 키·웹앱 URL·비밀키는 저장소 코드·문서·로그에 남기지 않는다(AGENTS.md 개인정보 금지 규칙과 동일).
- 가장 큰 위험은 배포 코드 자체가 변조되는 경우(GitHub·Vercel 계정 탈취 등)다 — 계정에 2단계 인증을 건다.

## 서버(Apps Script)

- 계약은 [external-api.md](external-api.md) "기기 동기화" 절, 설치·재배포·수동 확인 체크리스트는 [integrations/apps-script/README.md](../integrations/apps-script/README.md) 참고.
