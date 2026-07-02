# PIN 잠금 (넘버패드) 설계

- 날짜: 2026-07-02
- 상태: 설계 확정 (사용자 승인)

## 배경과 목표

dotori의 잠금 화면은 자유 형식 문자 비밀번호를 텍스트 입력으로 받는다. 모바일(PWA)에서
텍스트 키보드는 불편하므로, 토스처럼 화면에 넘버패드를 그리고 **6자리 숫자 PIN**으로
전면 전환한다.

사용자가 인지하고 수용한 트레이드오프: PIN(경우의 수 10^6)은 문자 비밀번호보다
오프라인 무차별 대입에 약하다. 로컬 퍼스트 구조라 서버 측 시도 제한이 없다.
개인용 앱으로서 UX를 우선해 수용한다.

확정된 선택:

- PIN 자릿수: **6자리 고정**
- 넘버패드 배열: **고정 배열** (1–9, 0 순서, 셔플 없음)

## 범위

### 1. 새 UI 프리미티브 (`components/ui/`)

- **`NumberPad`**: 3×4 고정 그리드 — 1~9, 좌하단 빈칸, 0, 우하단 백스페이스.
  - props: `onPress(digit: string)`, `onDelete()`, `disabled?`.
  - 스타일(DESIGN.md 토큰): 셀은 투명 배경 + `text-ink` 숫자 22px, 탭 시
    `bg-surface-soft` 하이라이트, radius `rounded-lg` 이상. 각 키 `aria-label`
    (숫자, "지우기").
- **`PinDots`**: 6개 점 인디케이터.
  - props: `length`(총 자릿수, 6), `filled`(입력된 자릿수).
  - 입력된 자리 `bg-primary`, 빈 자리 `bg-surface-strong`. 에러 표현은 점이 아니라
    기존 인라인 에러 메시지(`role="alert"`)로 유지.
- 두 컴포넌트 규격을 **DESIGN.md**에 추가한다.

### 2. 데이터 모델

- `Settings` 인터페이스(lib/types.ts, lib/db/schema 재수출)에
  `lockType?: "pin" | "passphrase"` 추가. 비인덱스 필드라 Dexie 버전 업 불필요.
  - 기존 레코드는 필드 없음 → **passphrase로 간주** (기본값 분기).
  - 신규 설정·PIN 전환 시 `"pin"` 저장.
- 키 파생은 기존 `deriveKey(secret, salt)`를 PIN 문자열로 그대로 호출 —
  `lib/crypto` 변경 없음.
- **백업 동기화**: settings 테이블이 백업 export/import에 `lockType`을 포함하는지
  확인하고 `lib/backup`·docs/backup.md를 함께 갱신한다.

### 3. LockGate 개편 (`components/LockGate.tsx`)

- **setup 모드(설정 없음)**: 도토리 아이콘 + 타이틀 + PinDots + NumberPad.
  1. PIN 6자리 입력 → 자동으로 확인 단계 전환("한 번 더 입력해요")
  2. 두 입력이 일치하면 **자동 제출**(별도 버튼 없음) — salt/verifier 생성,
     `lockType: "pin"` 저장, 잠금 해제. 기존 setup과 동일하게 **최초 멤버("나")
     생성(`upsertMember`)을 유지**한다(회귀 금지).
  3. 불일치 시 에러 메시지 + **두 입력 모두 초기화하고 1단계부터 재시작**.
  - 백스페이스는 현재 단계의 마지막 자리만 지운다(확인 단계에서 1단계로 되돌아가지
    않음).
- **unlock 모드(설정 있음)**:
  - `lockType === "pin"`: PinDots + NumberPad, 6자리가 차면 자동 검증.
    실패 시 에러 메시지 + 입력 초기화.
  - passphrase(필드 없음 포함): **기존 텍스트 입력 화면 유지** + "설정에서 PIN으로
    바꿀 수 있어요" 안내 문구. 이 분기가 없으면 기존 사용자가 잠금 해제를 못 한다.
- 기존 동작 유지: 세션 볼트 자동 해제, 10분 유휴 자동 잠금, 도토리 아이콘 헤더.

### 4. 설정 화면 (`app/settings/page.tsx` PassphraseSection)

- "비밀번호 변경" → "PIN 설정/변경"으로 개편.
  - 현재 잠금 수단 입력: `lockType`에 따라 문자 비밀번호(텍스트) 또는 PIN
    (숫자 전용 입력).
  - 새 PIN 입력·확인: 넘버패드 없이 `inputMode="numeric"` + 6자리 숫자 검증
    (`/^\d{6}$/`). 기존 "8자 이상" 검증 대체.
  - 검증 통과 시 기존 `rekeyVault(oldKey, newKey)` 재사용 → 새 salt/verifier +
    `lockType: "pin"` 저장 → 세션 키 교체(잠금 유지).
- UX 라이팅은 DESIGN.md 규칙(해요체·긍정형) 준수. 사용자 노출 용어는 "PIN" 또는
  "비밀번호" — "패스프레이즈" 금지.

### 5. 문서

- DESIGN.md: NumberPad·PinDots 컴포넌트 규격 추가.
- docs/architecture.md: 잠금 흐름(lockType 분기, PIN 설정/전환) 갱신.
- docs/backup.md: settings 백업 커버리지에 lockType 반영(해당 시).

### 6. 테스트 (`test/` 미러 구조)

- `NumberPad`: 키 탭 → `onPress`/`onDelete` 호출, aria 라벨.
- `PinDots`: filled 개수 렌더링.
- `LockGate`:
  - setup: PIN 입력 → 확인 → 잠금 해제, 불일치 에러.
  - unlock(pin): 올바른/틀린 PIN 자동 검증.
  - unlock(passphrase, lockType 없음): 기존 텍스트 흐름 회귀 테스트.
- 설정: passphrase → PIN 전환 시 rekey + lockType 저장.

## 범위 밖 (YAGNI)

- 넘버패드 배열 셔플(보안 키패드), 생체 인증(WebAuthn), PIN 시도 횟수 제한,
  4자리 옵션, 잠금 화면 외 다른 화면의 넘버패드 재사용.

## 완료 기준

- 신규 설치: 넘버패드로 PIN 설정 → 잠금 해제까지 버튼 없이 진행.
- 기존 사용자: 문자 비밀번호로 잠금 해제 가능, 설정에서 PIN 전환 후 넘버패드 잠금.
- `npm run typecheck && npm run lint && npm test` 통과.
