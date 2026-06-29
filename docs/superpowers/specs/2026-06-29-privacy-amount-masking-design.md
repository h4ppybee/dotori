# 금액 숨기기(프라이버시) 설계

작성일: 2026-06-29

## 목적

설정에 "금액 숨기기" 프라이버시 옵션을 추가한다. 켜면 포트폴리오 홈의 **총평가금**이
첫 진입 시 블러 처리되어 보이지 않고, 사용자가 탭하면 선명하게 드러난다. 어깨너머로
타인이 잔액을 보는 것을 막는 것이 목적이다.

이 설정은 향후 추가될 다른 자산 종류의 금액 표시에도 그대로 적용할 수 있도록 **앱 전역
프라이버시 플래그 + 재사용 가능한 마스킹 컴포넌트**로 설계한다.

## 확정된 동작

- **가릴 대상(이번 범위)**: `SummaryHero`의 총평가금 숫자 1곳. (수익률 배지·총손익·종목별
  금액은 이번엔 가리지 않는다. 단, 마스킹 컴포넌트는 재사용 가능하게 만들어 추후 확장 가능.)
- **기본 상태**: 프라이버시 ON이면 진입 시 블러(가려짐).
- **노출**: 가려진 금액을 탭/클릭하면 그 인스턴스가 선명해진다.
- **재숨김 시점**: 노출 상태는 영속화하지 않는다. 탭을 떠났다 돌아오거나 컴포넌트가
  리마운트되면 다시 블러 상태로 초기화된다. (컴포넌트 로컬 `useState`)
- **표시 방식**: 블러(CSS `filter: blur`)로 흐리게. 프라이버시 OFF면 평소처럼 그대로 노출.
- **프라이버시 ON/OFF 자체**: 새로고침·재실행 후에도 유지되어야 하므로 IndexedDB에 영속화.

## 비목표 (YAGNI)

- 종목별/섹터별 금액, 수익률, 손익 마스킹 — 이번 범위 아님(컴포넌트는 재사용 가능하게만 둠).
- 노출 상태의 영속화·세션 유지.
- 비밀번호/생체인증으로 노출 보호.
- 자동 마스킹 타이머.

## 아키텍처

### 단일 소스: IndexedDB `Settings`

프라이버시 플래그는 기존 `Settings`(`id: "app"`) 레코드에 보관한다. 옵션 필드를 추가하는
것이므로 Dexie 스키마 버전 업은 필요 없다(인덱스 변경이 아님).

```ts
// lib/types.ts
export interface Settings {
  id: "app";
  kdfSalt: string;
  verifier: string;
  lastSnapshotDate?: string;
  schemaVersion: number;
  privacyAmounts?: boolean;   // 신규: 금액 숨기기 ON/OFF. undefined === OFF
}
```

저장/조회는 기존 `getSettings()` / `putSettings()`(`lib/db/local-store.ts`)를 그대로 쓴다.

### 반응형 플래그: `useSettings()` 훅

설정 토글 변경이 홈 화면에 즉시 반영되도록 react-query로 설정을 읽는다. 잠금 상태에서는
비활성화한다(`usePortfolio`와 동일한 패턴).

```ts
// lib/query/use-settings.ts (신규)
const SETTINGS_KEY = ["settings"] as const;

export function useSettings() {
  const locked = useAppStore((s) => s.locked);
  return useQuery({
    queryKey: SETTINGS_KEY,
    enabled: !locked,
    queryFn: () => getSettings(),
  });
}

// 플래그만 필요한 소비자용 편의 훅
export function usePrivacyAmounts(): boolean {
  const { data } = useSettings();
  return data?.privacyAmounts ?? false;
}
```

설정 페이지 토글은 `putSettings({ ...settings, privacyAmounts })` 후
`queryClient.invalidateQueries({ queryKey: ["settings"] })`로 갱신한다.

### 재사용 컴포넌트: `PrivacyAmount`

금액 표시를 감싸는 공용 프리미티브. 향후 다른 자산 화면도 이 컴포넌트만 끼우면 동일한
프라이버시 동작을 얻는다.

```tsx
// components/ui/PrivacyAmount.tsx (신규)
interface PrivacyAmountProps {
  children: React.ReactNode;   // 표시할 금액 노드(이미 포맷된 텍스트/스팬)
  className?: string;          // 금액 자체의 타이포 클래스 위임
  revealLabel?: string;        // 접근성 라벨 (기본: "금액 보기")
}
```

동작:
- `usePrivacyAmounts()`로 전역 플래그를 읽는다.
- 플래그 OFF → `children`을 그대로 렌더.
- 플래그 ON → 로컬 `const [revealed, setRevealed] = useState(false)`.
  - `revealed === false`: `children`을 블러 처리하고, 영역 전체를 `button`(또는 클릭
    가능한 요소)로 감싼다. 클릭/탭/Enter·Space 키 입력 시 `setRevealed(true)`.
    `aria-label`은 `revealLabel`, 시각적으로 "탭하면 보여요" 류 힌트를 곁들일 수 있다.
  - `revealed === true`: `children`을 선명하게 렌더(블러 제거). 다시 가리는 인터랙션은
    없다(탭 재진입 시 리마운트로 초기화).
- 블러는 `filter: blur(...)` + `select-none` + 포인터 커서. 정확한 강도/토큰은 DESIGN.md
  Switch/마스킹 규격에 정의한다.

### 소비처: `SummaryHero`

총평가금 `<span>`을 `PrivacyAmount`로 감싼다. 타이포 클래스는 그대로 유지한다.

```tsx
<PrivacyAmount revealLabel="총평가금 보기">
  <span className="text-[36px] font-bold leading-[1.2] tracking-[-0.5px] tabular-nums text-ink">
    {formatKrw(vm.totalValueKrw)}
  </span>
</PrivacyAmount>
```

`SummaryHero`는 props 변경 없이 자체적으로 `usePrivacyAmounts`를 통해 동작하므로
`app/page.tsx` 호출부는 바꾸지 않는다.

### 설정 화면: "프라이버시" 섹션 신설

`app/settings/page.tsx`에 새 `PrivacySection` Card를 추가한다. 배치는 섹션 목록 안에 둔다
(권장: `BackupPanel`과 `PassphraseSection` 사이 또는 최상단 근처 — 구현 시 자연스러운 위치).

```
설정
 ├─ ConnectionForm
 ├─ BackupPanel
 ├─ PrivacySection   ← 신규
 ├─ PassphraseSection
 └─ DeleteAllSection
```

`PrivacySection`:
- 제목: "프라이버시"(기존 섹션 제목 타이포 동일).
- 행 1개: 라벨 "금액 숨기기" + 보조 설명("켜면 총평가금이 가려지고, 탭하면 보여요.") +
  우측 `Switch`.
- `useSettings()`로 현재 값 로드, `Switch` onChange → `putSettings` →
  `invalidateQueries(["settings"])`. 설정 로드 전(또는 settings 없음)에는 OFF로 표시.

### 신규 UI 프리미티브: `Switch`

`components/ui`에 토글 스위치가 아직 없으므로 추가한다.

```tsx
// components/ui/Switch.tsx (신규)
interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;        // 접근성 라벨
  disabled?: boolean;
}
```

- 접근성: `role="switch"` + `aria-checked`, 키보드 토글 가능.
- 색: ON일 때 브랜드 보이스 `#A87342`(`colors.primary`), OFF일 때 중립 트랙. DESIGN.md
  토큰을 따른다.
- DESIGN.md에 Switch 컴포넌트 규격(크기·색·동작)과 PrivacyAmount 블러 마스킹 패턴을
  새 규칙으로 추가한다.

## 데이터 흐름

```
설정 토글 ── putSettings(privacyAmounts) ──▶ IndexedDB(Settings)
   │                                              │
   └── invalidateQueries(["settings"]) ──▶ useSettings 재조회
                                                  │
                          usePrivacyAmounts() ◀───┘
                                  │
          SummaryHero ▶ PrivacyAmount(플래그 ON) ▶ 블러 + 탭하면 노출
```

## 에러·엣지 케이스

- **Settings 미로드/없음**: 플래그 기본값 OFF(`?? false`). 마스킹하지 않음. 토글은
  로드 완료 후 활성.
- **잠금 상태**: `useSettings`는 `enabled: !locked`로 비활성. 잠금 화면에서는 홈/총평가금이
  애초에 안 보이므로 영향 없음.
- **프라이버시 OFF에서 ON 전환**: 이미 화면에 떠 있는 `PrivacyAmount`가 재렌더되며
  `revealed` 초기값 false로 블러 적용. (전환 즉시 가려짐 — 의도된 동작)
- **블러 한계(명시)**: 블러는 DOM에 실제 값이 남는다. 완전한 비밀 보장이 아니라
  "어깨너머 시선 차단" 목적임을 문서/코드 주석에 남긴다.

## 테스트

순수/단위 테스트 위주(기존 `test/` 구조 미러링).

- `PrivacyAmount`:
  - 플래그 OFF → children 그대로 노출, 블러 없음, 버튼 없음.
  - 플래그 ON → 초기 블러 + 노출용 버튼 존재, children 값은 숨김 처리.
  - 클릭/Enter → `revealed` 전환되어 선명 표시.
  - 리마운트 → 다시 블러로 초기화.
- `useSettings` / `usePrivacyAmounts`: Settings 값에 따라 플래그 반환, 미설정 시 false.
  (fake-indexeddb 활용)
- `Switch`: checked 반영, onChange 호출, 키보드 토글, aria 속성.
- `Settings` 타입에 `privacyAmounts` 추가 후 `putSettings`/`getSettings` 라운드트립.
- `SummaryHero`: 프라이버시 ON일 때 총평가금이 초기 블러, 탭 시 노출.

## 변경 파일 요약

| 파일 | 변경 |
| --- | --- |
| `lib/types.ts` | `Settings.privacyAmounts?: boolean` 추가 |
| `lib/query/use-settings.ts` | 신규: `useSettings`, `usePrivacyAmounts` |
| `components/ui/Switch.tsx` | 신규: 토글 스위치 프리미티브 |
| `components/ui/PrivacyAmount.tsx` | 신규: 재사용 마스킹 래퍼 |
| `components/portfolio/SummaryHero.tsx` | 총평가금을 `PrivacyAmount`로 감쌈 |
| `app/settings/page.tsx` | `PrivacySection` 신설 + 섹션 목록에 추가 |
| `DESIGN.md` | Switch 규격 + PrivacyAmount 블러 마스킹 패턴 토큰/규칙 추가 |
| `test/...` | 위 단위 테스트 |

코드 변경 후 `npm run typecheck && npm run lint && npm test` 통과를 기본으로 한다.
