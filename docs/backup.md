# 백업 — 내보내기 / 불러오기

로컬 퍼스트 앱이라 서버 DB가 없다. 기기 교체·초기화에 대비해 데이터를 **JSON 파일 하나로 내보내고 다시 불러오는** 것이 유일한 이관 수단이다. 구현은 [lib/backup/backup.ts](../lib/backup/backup.ts), UI는 설정 화면의 [BackupPanel](../components/settings/BackupPanel.tsx).

> 📄 이 문서는 백업 동작과 함께 유지한다. `exportAll`/`importAll`의 포함·제외 대상, payload 버전, 정제 규칙을 바꾸면 **같은 작업에서 이 문서도 갱신**한다.

---

## 설계 원칙 — "수동 데이터만 백업한다"

백업 payload는 **사용자가 직접 입력한(MANUAL) 데이터만** 담는다. 나머지는 의도적으로 제외한다.

| 구분 | 대상 | 백업? | 이유 |
| --- | --- | --- | --- |
| 수동 입력 | `members`, MANUAL `connections`, MANUAL `holdings`, `savings`(MANUAL), `pension`, `coin`(MANUAL), `debts`, `sectorOverrides`, `snapshots`, `assetSnapshots`, `goal`, `envelopeItems`, `envelopeConfig` | ✅ 포함 | 재생성 불가 — 사용자가 직접 넣은 값 |
| API 설정 | `connections`(TOSS_API/UPBIT_API), `tokenCache` | ❌ 제외 | 기기별 민감정보. 재연결로 복구 |
| 자동 데이터 | `holdings`/`savings`/`coin` 중 `source === "AUTO"` | ❌ 제외 | 재연결 + 새로고침으로 복구 |
| 재조회 캐시 | `priceCache`, `fxRates` | ❌ 제외 | 새로고침으로 복구 |
| 보안 앵커 | `settings`(`kdfSalt`/`verifier`) | ❌ 제외 | **덮으면 기존 API 연결 복호화 키가 손상됨**(아래) |
| 세션 | `session` | ❌ 제외 | 자동 잠금용 휘발 데이터 |
| 시트 내보내기 설정 | `sheetExport`(웹앱 URL·암호화된 비밀키) | ❌ 제외 | 기기별 민감 설정 — 재연결로 복구 |

**왜 `settings`를 제외하나:** 보존된 API 연결의 시크릿은 현재 기기의 `kdfSalt`에서 파생한 키로 암호화돼 있다. 백업으로 `kdfSalt`/`verifier`를 덮으면 그 키를 다시 파생할 수 없어 기존 암호값이 복호화 불능이 된다. 그래서 보안 앵커는 절대 백업·복원 대상이 아니다.

---

## payload 형식

```jsonc
{
  "schemaVersion": 7,          // 백업 스키마 버전 (Dexie DB 버전과 독립)
  "exportedAt": 1751...,       // Date.now()
  "data": {
    "members": [...],
    "connections": [...],      // type === "MANUAL" 만
    "holdings": [...],         // source === "MANUAL" 만
    "snapshots": [...],
    "sectorOverrides": [...],
    "savings": [...],          // source === "MANUAL" 만
    "pension": [...],
    "coin": [...],             // source === "MANUAL" 만
    "debts": [...],
    "assetSnapshots": [...],
    "goal": [...],             // 순자산 목표 단일 행 (있으면 1건)
    "envelopeItems": [...],    // 통장 쪼개기 항목 전량
    "envelopeConfig": [...]    // 커스텀 태그·은행 프리셋 전량
  }
}
```

- `SCHEMA_VERSION`(현재 **7**)은 **백업 payload 전용 네임스페이스**로, `lib/db/schema.ts`의 Dexie DB 버전과 별개다. 헷갈리지 말 것.
- 파일명은 `dotori-backup-YYYY-MM-DD.json` 관례.

### 버전 히스토리

| payload 버전 | 변경 |
| --- | --- |
| v1 | 초기(주식 중심) |
| v2 | 저축·연금·코인 포함 |
| v3 | 대출(부채) 포함 |
| v4 | 수동 데이터만 백업 — API 설정·AUTO·캐시·`settings` 제외 |
| **v5** | 자산 스냅샷(`assetSnapshots`) 포함 |
| **v6** | 순자산 목표(`goal`) 포함 |
| **v7** | 통장 쪼개기(`envelopeItems`·`envelopeConfig`) 포함 |

`SUPPORTED_VERSIONS = {1,2,3,4,5,6,7}`. **구버전 백업도 계속 불러올 수 있다.** 단, 구버전이 담고 있던 API 설정·AUTO 행·캐시·`settings`·`tokenCache`는 불러오기 시 **정제 단계에서 무시**된다.

---

## 내보내기 (`exportAll`)

각 테이블을 `MANUAL` 필터로 읽어 payload로 직렬화해 JSON 문자열을 반환한다. `connections`는 `type === "MANUAL"`, `holdings`/`savings`/`coin`은 `source === "MANUAL"`만 담는다. `pension`·`debts`·`snapshots`·`assetSnapshots`·`sectorOverrides`·`members`·`goal`·`envelopeItems`·`envelopeConfig`은 전량 포함(자동 소스 개념이 없음).

## 불러오기 (`importAll`)

`importAll(json, { mode })` — 두 모드.

- **merge**: 기존 데이터 위에 `bulkPut`(같은 id는 덮어씀, 없는 id는 추가).
- **overwrite**: 먼저 **수동 데이터만 삭제**(MANUAL `connections`/`holdings`/`coin`/`savings` + `pension`/`debts`/`assetSnapshots`/`goal`/`envelopeItems`/`envelopeConfig` 전체)한 뒤 `bulkPut`. API 설정·AUTO 행·캐시·`settings`·`session`은 **보존**한다.

### 안전장치

1. **JSON 파싱 실패** → `"백업 파일을 읽을 수 없어요"`.
2. **미지원 버전** → `"백업 버전이 호환되지 않아요"`(`SUPPORTED_VERSIONS`에 없을 때).
3. **입력 정제**: 불러온 데이터도 다시 필터링한다. 구버전 백업이 담은 API 설정·AUTO·캐시·`settings`·`tokenCache`는 통과시키지 않는다.
   - `connections`는 `type === "MANUAL"`, `holdings`는 `source === "MANUAL"`만 통과.
   - `savings`/`coin`은 **source 백필** 후 필터: v4 이전 백업엔 `source` 필드가 없으므로 `source ?? "MANUAL"`로 채운 뒤 `MANUAL`만 통과(`withSource` 헬퍼).
   - `savings`의 금액 기준일 `balanceAsOf`(예적금 자동 증가용)는 행에 그대로 실려 왕복한다. 이 필드가 없는 예전 백업을 불러오면 다음 통합 갱신 때 소급 없이 오늘로 초기화된다.
4. **단일 트랜잭션**: 삭제 + 삽입 전체를 `db.transaction("rw", db.tables, …)` 한 번으로 감싼다. 중간 실패 시 롤백. 선택적 삭제가 여러 테이블에 걸쳐 스코프를 전체 테이블로 잡는다.

---

## 새 데이터를 추가할 때 (체크리스트)

새 Dexie 테이블이나 영속 데이터를 추가하면 백업도 함께 갱신해야 한다. 안 하면 사용자의 새 데이터가 백업에서 조용히 누락된다.

1. `exportAll`의 `Promise.all`과 `payload.data`에 새 테이블을 추가한다(자동 소스가 있으면 `MANUAL` 필터).
2. `importAll`의 정제·삭제(overwrite)·`bulkPut`에 새 테이블을 추가한다.
3. `BackupData` 인터페이스에 필드를 추가한다.
4. payload 형식이 바뀌면 `SCHEMA_VERSION`을 올리고 `SUPPORTED_VERSIONS`·버전 히스토리·이 문서를 갱신한다.
5. 하위호환: 구버전 백업에 새 필드가 없을 때의 기본값(백필)을 정한다.
