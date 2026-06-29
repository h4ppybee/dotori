# 금액 숨기기(프라이버시) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설정의 "금액 숨기기" 토글을 켜면 홈의 총평가금이 블러로 가려지고, 탭하면 선명해진다.

**Architecture:** 프라이버시 플래그를 IndexedDB `Settings`(단일 소스)에 영속화하고, react-query `useSettings`/`usePrivacyAmounts` 훅으로 반응형 노출한다. 재사용 가능한 `PrivacyAmount` 래퍼가 블러 + 탭-노출(로컬 state, 리마운트 시 초기화)을 담당하고, `SummaryHero`의 총평가금에 첫 적용한다. 설정 화면엔 신규 `Switch` 프리미티브를 쓰는 "프라이버시" 섹션을 신설한다.

**Tech Stack:** Next.js 16 App Router(클라이언트), React 19, TypeScript, Tailwind v4, @tanstack/react-query 5, Dexie 4(IndexedDB), vitest 4 + Testing Library + fake-indexeddb.

**참조 문서:** 설계 스펙 [docs/superpowers/specs/2026-06-29-privacy-amount-masking-design.md](../specs/2026-06-29-privacy-amount-masking-design.md) · 디자인 토큰 [DESIGN.md](../../../DESIGN.md)

**공통 규칙:** 각 Task 완료 시 `npm run typecheck && npm run lint && npm test` 통과 후 커밋한다. 커밋 메시지는 `dtr-git-commit-convention`을 따른다. UI 작업 전 DESIGN.md 토큰을 따른다.

---

## File Structure

| 파일 | 책임 | 생성/수정 |
| --- | --- | --- |
| `lib/types.ts` | `Settings`에 `privacyAmounts?` 플래그 | 수정 |
| `test/utils/query.tsx` | 테스트용 QueryClientProvider 래퍼/헬퍼 | 생성 |
| `lib/query/use-settings.ts` | `useSettings`/`usePrivacyAmounts` 반응형 훅 | 생성 |
| `components/ui/Switch.tsx` | 토글 스위치 프리미티브 | 생성 |
| `components/ui/PrivacyAmount.tsx` | 재사용 마스킹 래퍼(블러+탭 노출) | 생성 |
| `components/portfolio/SummaryHero.tsx` | 총평가금을 `PrivacyAmount`로 감쌈 | 수정 |
| `app/settings/page.tsx` | `PrivacySection` 신설 + 섹션 목록 추가 | 수정 |
| `DESIGN.md` | Switch 규격 + PrivacyAmount 블러 마스킹 규칙 | 수정 |
| `test/...` | 위 단위 테스트 | 생성/수정 |

작업 순서는 의존성 순(타입 → 테스트 헬퍼 → 훅 → 프리미티브 → 소비처)으로 둔다.

---

## Task 1: Settings 타입에 privacyAmounts 추가

**Files:**
- Modify: `lib/types.ts` (Settings 인터페이스)
- Test: `test/db/local-store.test.ts` (라운드트립 검증 추가)

- [ ] **Step 1: 실패하는 테스트 작성**

`test/db/local-store.test.ts`에 아래 테스트를 추가한다(기존 import에 `getSettings, putSettings`가 없으면 추가).

```tsx
import { getSettings, putSettings } from "@/lib/db/local-store";

it("privacyAmounts 플래그를 저장하고 다시 읽는다", async () => {
  await putSettings({
    id: "app",
    kdfSalt: "s",
    verifier: "v",
    schemaVersion: 1,
    privacyAmounts: true,
  });
  const got = await getSettings();
  expect(got?.privacyAmounts).toBe(true);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- test/db/local-store.test.ts`
Expected: FAIL — TypeScript 타입 에러(`privacyAmounts`가 Settings에 없음) 또는 타입 빌드 실패.

- [ ] **Step 3: 타입 필드 추가**

`lib/types.ts`의 `Settings` 인터페이스에 필드를 추가한다.

```ts
export interface Settings {
  id: "app";
  kdfSalt: string;
  verifier: string;
  lastSnapshotDate?: string;
  schemaVersion: number;
  privacyAmounts?: boolean;   // 금액 숨기기 ON/OFF. undefined === OFF
}
```

(Dexie 스키마는 인덱스 변경이 없으므로 버전 업 불필요.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- test/db/local-store.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/types.ts test/db/local-store.test.ts
git commit -m "feat: Settings에 privacyAmounts 플래그 추가"
```

---

## Task 2: 테스트용 QueryClient 래퍼 헬퍼

react-query 훅/컴포넌트를 테스트에서 렌더하려면 `QueryClientProvider`가 필요하다. 재사용 헬퍼를 만든다.

**Files:**
- Create: `test/utils/query.tsx`

- [ ] **Step 1: 헬퍼 작성**

```tsx
import { type ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** 테스트마다 격리된 QueryClient(재시도/캐시 끔). */
export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  });
}

/** renderHook/render의 wrapper로 쓸 Provider. */
export function QueryWrapper({ children }: { children: ReactNode }) {
  const client = makeTestQueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** QueryClientProvider로 감싸 렌더한다. */
export function renderWithQuery(ui: ReactNode) {
  return render(<QueryWrapper>{ui}</QueryWrapper>);
}
```

> 주의: `QueryWrapper`는 매 렌더마다 새 client를 만든다. `renderHook`/`render`의 `wrapper`로 쓸 때는 한 번만 마운트되므로 안전하다.

- [ ] **Step 2: 타입체크 통과 확인**

Run: `npm run typecheck`
Expected: PASS (이 파일은 아직 소비처 없음)

- [ ] **Step 3: 커밋**

```bash
git add test/utils/query.tsx
git commit -m "test: react-query 테스트용 QueryClient 래퍼 헬퍼 추가"
```

---

## Task 3: useSettings / usePrivacyAmounts 훅

**Files:**
- Create: `lib/query/use-settings.ts`
- Test: `test/query/use-settings.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/query/use-settings.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { db } from "@/lib/db/schema";
import { putSettings } from "@/lib/db/local-store";
import { useAppStore } from "@/stores/app-store";
import { usePrivacyAmounts } from "@/lib/query/use-settings";
import { QueryWrapper } from "@/test/utils/query";

afterEach(async () => {
  await db.delete();
  await db.open();
  useAppStore.setState({ locked: true, sessionKey: null, lastRefreshAt: null });
});

describe("usePrivacyAmounts", () => {
  it("Settings가 없으면 false를 반환한다", async () => {
    useAppStore.setState({ locked: false });
    const { result } = renderHook(() => usePrivacyAmounts(), { wrapper: QueryWrapper });
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("privacyAmounts=true면 true를 반환한다", async () => {
    await putSettings({ id: "app", kdfSalt: "s", verifier: "v", schemaVersion: 1, privacyAmounts: true });
    useAppStore.setState({ locked: false });
    const { result } = renderHook(() => usePrivacyAmounts(), { wrapper: QueryWrapper });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("잠금 상태에서는 쿼리가 비활성이라 false를 반환한다", async () => {
    await putSettings({ id: "app", kdfSalt: "s", verifier: "v", schemaVersion: 1, privacyAmounts: true });
    useAppStore.setState({ locked: true });
    const { result } = renderHook(() => usePrivacyAmounts(), { wrapper: QueryWrapper });
    // enabled:false → 데이터 미조회 → 기본 false 유지
    await waitFor(() => expect(result.current).toBe(false));
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- test/query/use-settings.test.tsx`
Expected: FAIL — `@/lib/query/use-settings` 모듈 없음.

- [ ] **Step 3: 훅 구현**

`lib/query/use-settings.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { getSettings } from "@/lib/db/local-store";

export const SETTINGS_KEY = ["settings"] as const;

/** 앱 설정(Settings)을 로컬 DB에서 읽는다. 잠금 상태에서는 비활성. */
export function useSettings() {
  const locked = useAppStore((s) => s.locked);
  return useQuery({
    queryKey: SETTINGS_KEY,
    enabled: !locked,
    queryFn: () => getSettings(),
  });
}

/** 금액 숨기기 플래그만 반환하는 편의 훅. 미설정/잠금 시 false. */
export function usePrivacyAmounts(): boolean {
  const { data } = useSettings();
  return data?.privacyAmounts ?? false;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- test/query/use-settings.test.tsx`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/query/use-settings.ts test/query/use-settings.test.tsx
git commit -m "feat: useSettings/usePrivacyAmounts 훅 추가"
```

---

## Task 4: Switch 프리미티브

**Files:**
- Create: `components/ui/Switch.tsx`
- Test: `test/ui/Switch.test.tsx`
- Modify: `DESIGN.md` (Switch 규격 추가)

- [ ] **Step 1: 실패하는 테스트 작성**

`test/ui/Switch.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Switch } from "@/components/ui/Switch";

describe("Switch", () => {
  it("role=switch와 aria-checked를 반영한다", () => {
    render(<Switch checked onChange={() => {}} label="금액 숨기기" />);
    const sw = screen.getByRole("switch", { name: "금액 숨기기" });
    expect(sw).toHaveAttribute("aria-checked", "true");
  });

  it("클릭하면 반대값으로 onChange를 호출한다", () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="토글" />);
    fireEvent.click(screen.getByRole("switch", { name: "토글" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("disabled면 onChange를 호출하지 않는다", () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="토글" disabled />);
    fireEvent.click(screen.getByRole("switch", { name: "토글" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ON이면 브랜드 색 트랙(bg-primary)을 쓴다", () => {
    render(<Switch checked onChange={() => {}} label="토글" />);
    expect(screen.getByRole("switch", { name: "토글" })).toHaveClass("bg-primary");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- test/ui/Switch.test.tsx`
Expected: FAIL — `@/components/ui/Switch` 모듈 없음.

- [ ] **Step 3: 컴포넌트 구현**

`components/ui/Switch.tsx`:

```tsx
"use client";

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;        // 접근성 라벨
  disabled?: boolean;
}

/**
 * 토스풍 토글 스위치. ON일 때 브랜드 보이스(bg-primary), OFF일 때 중립 트랙.
 * role=switch + aria-checked로 접근성 보장, 클릭/키보드로 토글.
 */
export function Switch({ checked, onChange, label, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[28px] w-[48px] shrink-0 items-center rounded-full transition-colors duration-150 disabled:opacity-40 ${
        checked ? "bg-primary" : "bg-surface-strong"
      }`}
    >
      <span
        className={`inline-block h-[22px] w-[22px] rounded-full bg-surface-card shadow-sm transition-transform duration-150 ${
          checked ? "translate-x-[23px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- test/ui/Switch.test.tsx`
Expected: PASS

- [ ] **Step 5: DESIGN.md에 Switch 규격 추가**

`DESIGN.md`의 컴포넌트 규격 섹션(`button-primary` 등이 정의된 곳 근처)에 Switch 항목을 추가한다. 내용:
- 크기: 트랙 48×28, 노브 22, radius full.
- 색: ON `colors.primary`(#A87342), OFF `colors.surface-strong`(#EDE7DD), 노브 `colors.surface-card`(흰색) + soft shadow.
- 접근성: `role="switch"` + `aria-checked`, disabled 시 opacity 40%.
- 용도: 설정 화면의 on/off 환경설정 토글.

- [ ] **Step 6: 커밋**

```bash
git add components/ui/Switch.tsx test/ui/Switch.test.tsx DESIGN.md
git commit -m "feat: Switch 토글 프리미티브 추가 (DESIGN.md 규격 포함)"
```

---

## Task 5: PrivacyAmount 마스킹 래퍼

**Files:**
- Create: `components/ui/PrivacyAmount.tsx`
- Test: `test/ui/PrivacyAmount.test.tsx`
- Modify: `DESIGN.md` (블러 마스킹 패턴 추가)

- [ ] **Step 1: 실패하는 테스트 작성**

`test/ui/PrivacyAmount.test.tsx`. 프라이버시 플래그는 `usePrivacyAmounts`에 의존하므로 모킹한다.

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";

const mockPrivacy = vi.fn();
vi.mock("@/lib/query/use-settings", () => ({
  usePrivacyAmounts: () => mockPrivacy(),
}));

beforeEach(() => {
  mockPrivacy.mockReset();
});

describe("PrivacyAmount", () => {
  it("프라이버시 OFF면 children을 그대로 노출하고 버튼이 없다", () => {
    mockPrivacy.mockReturnValue(false);
    render(<PrivacyAmount revealLabel="총평가금 보기"><span>₩1,234</span></PrivacyAmount>);
    expect(screen.getByText("₩1,234")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "총평가금 보기" })).toBeNull();
  });

  it("프라이버시 ON이면 초기엔 노출 버튼을 렌더한다", () => {
    mockPrivacy.mockReturnValue(true);
    render(<PrivacyAmount revealLabel="총평가금 보기"><span>₩1,234</span></PrivacyAmount>);
    expect(screen.getByRole("button", { name: "총평가금 보기" })).toBeInTheDocument();
  });

  it("프라이버시 ON에서 탭하면 선명해진다(버튼 사라짐)", () => {
    mockPrivacy.mockReturnValue(true);
    render(<PrivacyAmount revealLabel="총평가금 보기"><span>₩1,234</span></PrivacyAmount>);
    fireEvent.click(screen.getByRole("button", { name: "총평가금 보기" }));
    expect(screen.queryByRole("button", { name: "총평가금 보기" })).toBeNull();
    expect(screen.getByText("₩1,234")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- test/ui/PrivacyAmount.test.tsx`
Expected: FAIL — `@/components/ui/PrivacyAmount` 모듈 없음.

- [ ] **Step 3: 컴포넌트 구현**

`components/ui/PrivacyAmount.tsx`:

```tsx
"use client";

import { type ReactNode, useState } from "react";
import { usePrivacyAmounts } from "@/lib/query/use-settings";

interface PrivacyAmountProps {
  children: ReactNode;       // 이미 포맷된 금액 노드
  revealLabel?: string;      // 접근성 라벨 (기본: "금액 보기")
}

/**
 * 금액을 감싸 프라이버시(금액 숨기기)를 적용하는 재사용 래퍼.
 * - 플래그 OFF: children 그대로 노출.
 * - 플래그 ON: 초기엔 블러 + 탭하면 선명. 노출 상태는 로컬이라 리마운트 시 초기화된다.
 * 주의: 블러는 DOM에 실제 값이 남는다. "어깨너머 시선 차단" 목적이며 완전한 비밀 보장은 아니다.
 */
export function PrivacyAmount({ children, revealLabel = "금액 보기" }: PrivacyAmountProps) {
  const privacy = usePrivacyAmounts();
  const [revealed, setRevealed] = useState(false);

  if (!privacy || revealed) {
    return <>{children}</>;
  }

  return (
    <button
      type="button"
      aria-label={revealLabel}
      onClick={() => setRevealed(true)}
      className="inline-flex cursor-pointer select-none blur-[7px]"
    >
      {children}
    </button>
  );
}
```

> 참고(스펙): `components/ui/AmountText.tsx`의 `size="hero"`가 동일 타이포를 제공한다. 본 래퍼는 children을 그대로 받으므로 호출부에서 raw span이든 AmountText든 감쌀 수 있다. SummaryHero는 현행 raw span을 유지한다(Task 6).

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- test/ui/PrivacyAmount.test.tsx`
Expected: PASS

- [ ] **Step 5: DESIGN.md에 블러 마스킹 패턴 추가**

`DESIGN.md`에 "프라이버시 금액 마스킹" 규칙을 추가한다:
- 가려진 금액은 `filter: blur(7px)` + `select-none` + 포인터 커서로 표시.
- 탭/클릭 시 선명. 노출 상태는 비영속(화면 재진입 시 재마스킹).
- 접근성: 가려진 상태는 `aria-label`을 가진 button으로 감싼다.
- 한계: DOM에 실제 값이 남으므로 시선 차단 용도.

- [ ] **Step 6: 커밋**

```bash
git add components/ui/PrivacyAmount.tsx test/ui/PrivacyAmount.test.tsx DESIGN.md
git commit -m "feat: PrivacyAmount 블러 마스킹 래퍼 추가 (DESIGN.md 규칙 포함)"
```

---

## Task 6: SummaryHero에 적용 + 기존 테스트 Provider 래핑

**Files:**
- Modify: `components/portfolio/SummaryHero.tsx`
- Modify: `test/ui/portfolio.test.tsx` (SummaryHero 렌더를 Provider로 래핑)

- [ ] **Step 1: 실패하는 테스트 작성**

`test/ui/portfolio.test.tsx`에 SummaryHero 관련 테스트를 추가/수정한다. SummaryHero가 이제 react-query 훅을 쓰므로 **모든 SummaryHero 렌더를 `renderWithQuery`로 바꾼다.** 기본(프라이버시 미설정)에서는 총평가금이 그대로 보여야 한다.

이 파일은 현재 `afterEach`도, `useAppStore` import도 없으므로 **둘 다 새로 추가한다.** 또한 기존 VM 생성 헬퍼명은 `makeVm`(소문자 v)이므로 아래 스니펫도 `makeVm`을 쓴다.

```tsx
// 상단 import에 추가
import { afterEach } from "vitest";
import { renderWithQuery } from "@/test/utils/query";
import { useAppStore } from "@/stores/app-store";
import { db } from "@/lib/db/schema";

// 파일에 afterEach가 없으면 추가 (DB·store 초기화)
afterEach(async () => {
  await db.delete();
  await db.open();
  useAppStore.setState({ locked: true, sessionKey: null, lastRefreshAt: null });
});

// (기존 SummaryHero 테스트의 render(...) 호출을 renderWithQuery(...)로 교체)

it("프라이버시 미설정이면 총평가금이 그대로 보인다", async () => {
  useAppStore.setState({ locked: false });
  renderWithQuery(<SummaryHero vm={makeVm({ totalValueKrw: 1234000 })} />);
  expect(await screen.findByText("₩1,234,000")).toBeInTheDocument();
});
```

> 기존 테스트의 VM 생성 헬퍼(`makeVm`)를 그대로 재사용한다. 잠금 해제 상태(`locked:false`)를 세팅해 쿼리가 활성화되도록 한다. (헬퍼명이 실제 파일과 다르면 실제 이름을 따른다.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- test/ui/portfolio.test.tsx`
Expected: FAIL — SummaryHero가 아직 PrivacyAmount/훅을 쓰지 않거나, Provider 없이 렌더하던 기존 테스트가 깨짐.

- [ ] **Step 3: SummaryHero 수정**

총평가금 span을 `PrivacyAmount`로 감싼다.

```tsx
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
// ...
<div className="flex flex-col gap-1">
  <span className="text-[13px] font-normal leading-[1.45] text-muted">
    총평가금
  </span>
  <PrivacyAmount revealLabel="총평가금 보기">
    <span className="text-[36px] font-bold leading-[1.2] tracking-[-0.5px] tabular-nums text-ink">
      {formatKrw(vm.totalValueKrw)}
    </span>
  </PrivacyAmount>
</div>
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- test/ui/portfolio.test.tsx`
Expected: PASS

- [ ] **Step 5: 전체 검증 + 커밋**

```bash
npm run typecheck && npm run lint && npm test
git add components/portfolio/SummaryHero.tsx test/ui/portfolio.test.tsx
git commit -m "feat: 홈 총평가금에 PrivacyAmount 적용"
```

---

## Task 7: 설정에 프라이버시 섹션 신설

**Files:**
- Modify: `app/settings/page.tsx` (`PrivacySection` 추가 + 섹션 목록 삽입)
- Modify: `test/ui/SettingsPage.test.tsx` (렌더를 Provider로 래핑 + 토글 테스트)

- [ ] **Step 1: 실패하는 테스트 작성**

`test/ui/SettingsPage.test.tsx`에서 `renderSettings`를 QueryProvider로 감싸도록 수정하고(설정 페이지가 이제 useSettings/useQueryClient를 씀), 프라이버시 섹션·토글 테스트를 추가한다.

```tsx
import { QueryWrapper } from "@/test/utils/query";
import { putSettings, getSettings } from "@/lib/db/local-store";

// renderSettings 수정:
async function renderSettings() {
  const { default: SettingsPage } = await import("@/app/settings/page");
  return render(<QueryWrapper><SettingsPage /></QueryWrapper>);
}

it("프라이버시 섹션이 렌더링된다", async () => {
  await renderSettings();
  await waitFor(() => {
    expect(screen.getByRole("heading", { level: 2, name: "프라이버시" })).toBeInTheDocument();
  });
});

it("금액 숨기기 토글을 켜면 Settings에 저장된다", async () => {
  await putSettings({ id: "app", kdfSalt: "s", verifier: "v", schemaVersion: 1 });
  await renderSettings();
  const sw = await screen.findByRole("switch", { name: "금액 숨기기" });
  fireEvent.click(sw);
  await waitFor(async () => {
    const s = await getSettings();
    expect(s?.privacyAmounts).toBe(true);
  });
});
```

> 기존 섹션 테스트들도 `renderSettings`가 Provider로 감싸지므로 그대로 통과해야 한다. `seedSessionKey`로 `locked:false`가 세팅되어 useSettings가 활성화된다. fixtures가 Settings 없이 동작하던 테스트는 그대로 둔다(토글은 OFF로 표시).

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- test/ui/SettingsPage.test.tsx`
Expected: FAIL — "프라이버시" 섹션/스위치 없음.

- [ ] **Step 3: PrivacySection 구현 + 페이지에 삽입**

`app/settings/page.tsx` 상단 import 추가:

```tsx
import { Switch } from "@/components/ui/Switch";
import { useSettings } from "@/lib/query/use-settings";
import { useQueryClient } from "@tanstack/react-query";
```

`PassphraseSection` 위(또는 아래)에 새 섹션 컴포넌트를 추가한다:

```tsx
// ─── 프라이버시 섹션 ──────────────────────────────────────────────────────────

function PrivacySection() {
  const { data: settings } = useSettings();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const enabled = settings?.privacyAmounts ?? false;

  async function handleToggle(next: boolean) {
    if (!settings || saving) {
      return;
    }
    setSaving(true);
    try {
      await putSettings({ ...settings, privacyAmounts: next });
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink mb-2">
        프라이버시
      </h2>
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-[15px] font-medium leading-[1.5] text-ink">
            금액 숨기기
          </span>
          <span className="text-[13px] text-body-soft leading-[1.5]">
            켜면 총평가금이 가려지고, 탭하면 보여요.
          </span>
        </div>
        <Switch
          checked={enabled}
          onChange={handleToggle}
          label="금액 숨기기"
          disabled={!settings || saving}
        />
      </div>
    </Card>
  );
}
```

섹션 목록(`SettingsPage`의 `flex flex-col gap-4`)에 `<PrivacySection />`을 `BackupPanel`과 `PassphraseSection` 사이에 추가한다:

```tsx
<ConnectionForm />
<BackupPanel />
<PrivacySection />
<PassphraseSection />
<DeleteAllSection />
```

> 메모: `putSettings`는 이미 import되어 있다(파일 상단 확인). 없으면 추가한다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- test/ui/SettingsPage.test.tsx`
Expected: PASS

- [ ] **Step 5: 전체 검증 + 커밋**

```bash
npm run typecheck && npm run lint && npm test
git add app/settings/page.tsx test/ui/SettingsPage.test.tsx
git commit -m "feat: 설정에 금액 숨기기(프라이버시) 섹션 추가"
```

---

## Task 8: 통합 검증 및 수동 확인

- [ ] **Step 1: 전체 검증**

Run: `npm run typecheck && npm run lint && npm test`
Expected: 전부 PASS.

- [ ] **Step 2: 수동 동작 확인 (선택)**

`npm run dev`로 띄워:
1. 설정 → 프라이버시 → "금액 숨기기" ON → 홈 진입 시 총평가금 블러 확인.
2. 총평가금 탭 → 선명해짐 확인.
3. 다른 탭 갔다 홈 재진입 → 다시 블러 확인.
4. 설정에서 OFF → 홈 총평가금 평소대로 노출 확인.
5. 새로고침 후에도 ON/OFF 상태 유지 확인.

- [ ] **Step 3: 배포 흐름**

`dtr-deploy` 스킬을 따른다. 푸시/머지 전 사용자 확인 필수.

---

## 완료 기준 (Definition of Done)

- 설정에 "프라이버시 > 금액 숨기기" 토글이 있고, ON/OFF가 새로고침 후에도 유지된다.
- ON이면 홈 총평가금이 블러로 가려지고 탭하면 선명, 탭 재진입 시 재마스킹된다.
- OFF면 총평가금이 평소대로 노출된다.
- `PrivacyAmount`/`Switch`/`useSettings`가 재사용 가능한 단위로 존재한다.
- DESIGN.md에 Switch 규격 + 블러 마스킹 규칙이 반영되어 코드와 일치한다.
- `npm run typecheck && npm run lint && npm test` 전부 통과.
