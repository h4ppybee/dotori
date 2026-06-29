# 하단 네비게이션(중첩 탭) 리팩토링 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2개뿐인 하단 탭을 5개 메인 탭 + '자산' 중첩 서브탭(토스 증권 스타일)으로 개편한다.

**Architecture:** URL을 단일 진실 원천으로 삼아 `usePathname()`에서 활성 상태를 파생한다. 탭 정의는 `lib/nav/nav-config.ts` 선언 배열, 활성 판정은 `lib/nav/active.ts` 순수 함수로 분리한다. `AppNav` 컨테이너가 경로별로 (메인 바 / 중첩 바 / 동적 패딩 / 상세화면 네비 숨김)을 조립하고, LockGate의 잠금 해제 분기에서만 렌더된다. 중첩 바 등장/사라짐은 CSS transform 트랜지션으로만 처리(신규 의존성 0). `lastMainTabPath`만 zustand에 둔다.

**Tech Stack:** Next.js 16 App Router(client components), React 19, TypeScript 5, Tailwind v4, zustand 5, vitest 4 + Testing Library.

**Spec:** [docs/superpowers/specs/2026-06-29-bottom-navigation-refactor-design.md](../specs/2026-06-29-bottom-navigation-refactor-design.md)

**관련 규칙:** DESIGN.md 토큰 준수(임의 색·간격 금지, 기존 `bg-surface-card`·`border-hairline`·`text-ink`·`text-muted` 재사용), 커밋은 @dtr-git-commit-convention. 각 Task 끝에 `npm run typecheck && npm run lint && npm test` 통과 가정.

---

## File Structure

**신규**
- `lib/nav/nav-config.ts` — 메인 탭 / 자산 서브탭 선언 배열 + `TabDef` 타입 + 아이콘
- `lib/nav/active.ts` — `resolveActiveMain(pathname)`, `resolveActiveSub(pathname)`, `isAssetsRoute`, `isDetailRoute` 순수 함수
- `stores/nav-store.ts` — `lastMainTabPath` zustand 스토어
- `components/nav/MainTabBar.tsx` — 메인 5탭 (기존 BottomTabBar 대체)
- `components/nav/AssetSubTabBar.tsx` — 중첩 바(← + 서브탭, CSS 애니메이션)
- `components/nav/AppNav.tsx` — 두 바 조립 + 동적 패딩 + 숨김 판정 컨테이너
- `components/nav/DummyPage.tsx` — 제목만 있는 더미 페이지 프리미티브
- 더미 라우트: `app/assets/page.tsx`, `app/assets/savings/page.tsx`, `app/assets/pension/page.tsx`, `app/assets/crypto/page.tsx`, `app/plan/page.tsx`, `app/ledger/page.tsx`
- 신규 페이지: `app/assets/stocks/page.tsx` (기존 포트폴리오 내용 이전)
- 테스트: `test/nav/active.test.ts`, `test/nav/nav-store.test.ts`, `test/ui/MainTabBar.test.tsx`, `test/ui/AssetSubTabBar.test.tsx`, `test/ui/AppNav.test.tsx`

**수정**
- `app/page.tsx` — 포트폴리오 내용 제거, 홈 더미로 교체
- `components/LockGate.tsx` — `BottomTabBar` 대신 `AppNav` 렌더(잠금 해제 분기)
- `test/ui/LockGate.test.tsx` — import/기대 조정
- `DESIGN.md` — 중첩 바 규격 + 모션 토큰 추가
- 삭제: `components/BottomTabBar.tsx` (MainTabBar로 대체 후)

---

## Task 1: 활성 판정 순수 함수 (`lib/nav/active.ts`)

가장 안쪽 의존 없는 순수 로직부터. nav-config 없이 경로 상수만으로 동작하도록 작성한다.

**Files:**
- Create: `lib/nav/active.ts`
- Test: `test/nav/active.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// test/nav/active.test.ts
import { describe, it, expect } from "vitest";
import {
  resolveActiveMain,
  resolveActiveSub,
  isAssetsRoute,
  isDetailRoute,
} from "@/lib/nav/active";

describe("resolveActiveMain", () => {
  it("홈은 정확히 / 일 때만", () => {
    expect(resolveActiveMain("/")).toBe("home");
    expect(resolveActiveMain("/plan")).toBe("plan");
    expect(resolveActiveMain("/ledger")).toBe("ledger");
    expect(resolveActiveMain("/settings")).toBe("settings");
  });
  it("/assets 이하 모든 경로는 자산 탭 활성", () => {
    expect(resolveActiveMain("/assets")).toBe("assets");
    expect(resolveActiveMain("/assets/stocks")).toBe("assets");
    expect(resolveActiveMain("/assets/crypto")).toBe("assets");
  });
  it("매칭 없으면 null", () => {
    expect(resolveActiveMain("/holdings/123")).toBeNull();
  });
});

describe("resolveActiveSub — 가장 긴 prefix 우선", () => {
  it("/assets 는 overview", () => {
    expect(resolveActiveSub("/assets")).toBe("overview");
  });
  it("/assets/stocks 는 overview가 아니라 stocks", () => {
    expect(resolveActiveSub("/assets/stocks")).toBe("stocks");
    expect(resolveActiveSub("/assets/savings")).toBe("savings");
    expect(resolveActiveSub("/assets/pension")).toBe("pension");
    expect(resolveActiveSub("/assets/crypto")).toBe("crypto");
  });
  it("자산 경로가 아니면 null", () => {
    expect(resolveActiveSub("/settings")).toBeNull();
  });
});

describe("경로 분류", () => {
  it("isAssetsRoute", () => {
    expect(isAssetsRoute("/assets")).toBe(true);
    expect(isAssetsRoute("/assets/stocks")).toBe(true);
    expect(isAssetsRoute("/plan")).toBe(false);
  });
  it("isDetailRoute(holdings)", () => {
    expect(isDetailRoute("/holdings/new")).toBe(true);
    expect(isDetailRoute("/holdings/abc")).toBe(true);
    expect(isDetailRoute("/assets/stocks")).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인** — Run: `npm test -- active` / Expected: FAIL (모듈 없음)

- [ ] **Step 3: 최소 구현**

```ts
// lib/nav/active.ts
/** URL pathname에서 네비게이션 활성 상태를 파생하는 순수 함수들. */

export function isAssetsRoute(pathname: string): boolean {
  return pathname === "/assets" || pathname.startsWith("/assets/");
}

export function isDetailRoute(pathname: string): boolean {
  return pathname.startsWith("/holdings");
}

/** 활성 메인 탭 key. 홈은 정확히 "/", 자산은 /assets 이하 전체, 나머지는 정확 매칭. */
export function resolveActiveMain(pathname: string): string | null {
  if (pathname === "/") {
    return "home";
  }
  if (isAssetsRoute(pathname)) {
    return "assets";
  }
  if (pathname === "/plan" || pathname.startsWith("/plan/")) {
    return "plan";
  }
  if (pathname === "/ledger" || pathname.startsWith("/ledger/")) {
    return "ledger";
  }
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return "settings";
  }
  return null;
}

/** 활성 자산 서브탭 key. 가장 긴 prefix 우선(/assets/stocks > /assets). */
export function resolveActiveSub(pathname: string): string | null {
  if (!isAssetsRoute(pathname)) {
    return null;
  }
  if (pathname.startsWith("/assets/stocks")) {
    return "stocks";
  }
  if (pathname.startsWith("/assets/savings")) {
    return "savings";
  }
  if (pathname.startsWith("/assets/pension")) {
    return "pension";
  }
  if (pathname.startsWith("/assets/crypto")) {
    return "crypto";
  }
  return "overview";
}
```

- [ ] **Step 4: 테스트 통과 확인** — Run: `npm test -- active` / Expected: PASS

- [ ] **Step 5: 커밋** — `git add lib/nav/active.ts test/nav/active.test.ts && git commit -m "feat(nav): 경로 기반 활성 탭 판정 순수 함수 추가"`

---

## Task 2: 탭 선언 설정 (`lib/nav/nav-config.ts`)

확장의 핵심. 메인/서브 탭을 배열로 정의한다. 아이콘은 기존 BottomTabBar 패턴(`(active)=>ReactNode`)을 따른다. 설정·주식 아이콘은 기존 것 재사용, 홈·자산·계획·가계부 4종 신규.

**Files:**
- Create: `lib/nav/nav-config.ts`
- (이 Task는 선언 데이터라 별도 단위 테스트 대신 Task 1의 active.ts와 key가 일치하는지 컴포넌트 테스트에서 검증)

- [ ] **Step 1: 작성** — 아이콘은 DESIGN.md 아이콘 규칙(단순 stroke, viewBox 0 0 24 24, active일 때 strokeWidth 굵게)을 따른다. 기존 `components/BottomTabBar.tsx`의 `PortfolioIcon`/`SettingsIcon` SVG를 그대로 옮겨 재사용한다.

```ts
// lib/nav/nav-config.ts
import type { ReactNode } from "react";

// 참고: spec의 TabDef에는 선택적 match? 예측자가 있었으나, 활성 판정 로직을
// lib/nav/active.ts 한 곳으로 단일화하기 위해 여기선 match를 두지 않는다(의도된 단순화).
export interface TabDef {
  key: string;
  href: string;
  label: string;
  icon?: (active: boolean) => ReactNode;
}

// ── 아이콘 (단순 stroke, DESIGN.md 규칙) ──────────────────────────────
function HomeIcon(active: boolean): ReactNode {
  const w = active ? 2.4 : 2;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 11 12 4l8 7" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v9h12v-9" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function AssetsIcon(active: boolean): ReactNode {
  const w = active ? 2.4 : 2;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth={w} />
      <path d="M3 10h18" stroke="currentColor" strokeWidth={w} strokeLinecap="round" />
    </svg>
  );
}
function PlanIcon(active: boolean): ReactNode {
  const w = active ? 2.4 : 2;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 4h14v16l-7-3-7 3z" stroke="currentColor" strokeWidth={w} strokeLinejoin="round" />
    </svg>
  );
}
function LedgerIcon(active: boolean): ReactNode {
  const w = active ? 2.4 : 2;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth={w} />
      <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth={w} strokeLinecap="round" />
    </svg>
  );
}
function StocksIcon(active: boolean): ReactNode {
  const w = active ? 2.4 : 2;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 13.5 9 9l3.5 3 6-6" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.5 6h4v4" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function SettingsIcon(active: boolean): ReactNode {
  const w = active ? 2.4 : 2;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={w} />
      <path d="M12 3v2.5M12 18.5V21M21 12h-2.5M5.5 12H3M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8M18.4 18.4l-1.8-1.8M7.4 7.4 5.6 5.6" stroke="currentColor" strokeWidth={w} strokeLinecap="round" />
    </svg>
  );
}

// ── 탭 정의 (key는 lib/nav/active.ts 반환값과 일치) ────────────────────
export const mainTabs: TabDef[] = [
  { key: "home", href: "/", label: "홈", icon: HomeIcon },
  { key: "assets", href: "/assets", label: "자산", icon: AssetsIcon },
  { key: "plan", href: "/plan", label: "계획", icon: PlanIcon },
  { key: "ledger", href: "/ledger", label: "가계부", icon: LedgerIcon },
  { key: "settings", href: "/settings", label: "설정", icon: SettingsIcon },
];

export const assetSubTabs: TabDef[] = [
  { key: "overview", href: "/assets", label: "자산" },
  { key: "stocks", href: "/assets/stocks", label: "주식", icon: StocksIcon },
  { key: "savings", href: "/assets/savings", label: "저축/현금성" },
  { key: "pension", href: "/assets/pension", label: "연금" },
  { key: "crypto", href: "/assets/crypto", label: "코인" },
  // 향후 확장: { key: "insurance", href: "/assets/insurance", label: "보험" } ...
];
```

> 이 파일은 JSX를 포함하므로 확장자는 `.tsx`가 맞다. 파일명을 `lib/nav/nav-config.tsx`로 둔다. (이 plan의 다른 import 경로 `@/lib/nav/nav-config`는 확장자 없이 동작.)

- [ ] **Step 2: typecheck** — Run: `npm run typecheck` / Expected: 통과
- [ ] **Step 3: 커밋** — `git add lib/nav/nav-config.tsx && git commit -m "feat(nav): 메인/자산 서브탭 선언 설정 추가"`

---

## Task 3: lastMainTabPath 스토어 (`stores/nav-store.ts`)

**Files:**
- Create: `stores/nav-store.ts`
- Test: `test/nav/nav-store.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// test/nav/nav-store.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useNavStore } from "@/stores/nav-store";

beforeEach(() => {
  useNavStore.setState({ lastMainTabPath: "/" });
});

describe("useNavStore", () => {
  it("초기값은 /", () => {
    expect(useNavStore.getState().lastMainTabPath).toBe("/");
  });
  it("setLastMainTab으로 경로를 저장한다", () => {
    useNavStore.getState().setLastMainTab("/plan");
    expect(useNavStore.getState().lastMainTabPath).toBe("/plan");
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npm test -- nav-store` / Expected: FAIL

- [ ] **Step 3: 구현**

```ts
// stores/nav-store.ts
import { create } from "zustand";

interface NavState {
  /** 자산 탭 진입 직전에 보던 메인 탭 경로. 중첩 바 ← 버튼의 복귀 대상. */
  lastMainTabPath: string;
  setLastMainTab: (path: string) => void;
}

export const useNavStore = create<NavState>((set) => ({
  lastMainTabPath: "/",
  setLastMainTab: (path) => set({ lastMainTabPath: path }),
}));
```

- [ ] **Step 4: 통과 확인** — Run: `npm test -- nav-store` / Expected: PASS
- [ ] **Step 5: 커밋** — `git add stores/nav-store.ts test/nav/nav-store.test.ts && git commit -m "feat(nav): lastMainTabPath 스토어 추가"`

---

## Task 4: 더미 페이지 프리미티브 + 더미 라우트

**Files:**
- Create: `components/nav/DummyPage.tsx`, `app/assets/page.tsx`, `app/assets/savings/page.tsx`, `app/assets/pension/page.tsx`, `app/assets/crypto/page.tsx`, `app/plan/page.tsx`, `app/ledger/page.tsx`

- [ ] **Step 1: DummyPage 작성** (DESIGN.md 타이포 토큰 사용)

```tsx
// components/nav/DummyPage.tsx
"use client";

/** 아직 구현되지 않은 화면용 더미. 제목만 중앙에 표시한다. */
export function DummyPage({ title }: { title: string }) {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-5">
      <h1 className="text-[22px] font-bold tracking-[-0.3px] text-ink">{title}</h1>
      <p className="mt-2 text-[15px] text-muted">곧 준비될 화면이에요</p>
    </main>
  );
}
```

- [ ] **Step 2: 더미 라우트 6개 작성** — 각 파일은 동일 패턴:

```tsx
// app/assets/page.tsx
"use client";
import { DummyPage } from "@/components/nav/DummyPage";
export default function AssetsOverviewPage() {
  return <DummyPage title="자산" />;
}
```

나머지: `app/assets/savings/page.tsx`→`"저축/현금성"`, `app/assets/pension/page.tsx`→`"연금"`, `app/assets/crypto/page.tsx`→`"코인"`, `app/plan/page.tsx`→`"계획"`, `app/ledger/page.tsx`→`"가계부"` (컴포넌트명만 각각 다르게).

- [ ] **Step 3: typecheck** — Run: `npm run typecheck` / Expected: 통과
- [ ] **Step 4: 커밋** — `git add components/nav/DummyPage.tsx app/assets app/plan app/ledger && git commit -m "feat(nav): 더미 페이지 프리미티브와 더미 라우트 추가"`

---

## Task 5: 포트폴리오 페이지를 /assets/stocks로 이동, 홈은 더미로

**Files:**
- Create: `app/assets/stocks/page.tsx` (기존 `app/page.tsx` 내용)
- Modify: `app/page.tsx` (홈 더미로 교체)

- [ ] **Step 1: 기존 page.tsx를 stocks로 이동**

```bash
git mv app/page.tsx app/assets/stocks/page.tsx
```

내부 코드 변경 불필요(내부 링크 `/holdings/*`, `/settings`는 그대로 유효). 컴포넌트 default export 이름은 그대로 둬도 무방.

- [ ] **Step 2: 새 홈 더미 작성**

```tsx
// app/page.tsx
"use client";
import { DummyPage } from "@/components/nav/DummyPage";
export default function HomePage() {
  return <DummyPage title="홈" />;
}
```

- [ ] **Step 3: 기존 포트폴리오 테스트 영향 확인** — `test/ui/portfolio.test.tsx`는 페이지가 아니라 하위 컴포넌트를 직접 import하므로 **현재는 변경 불필요**(확인만). 만약 `app/page`를 직접 import하는 테스트가 있다면 `app/assets/stocks/page`로 경로만 수정. Run: `npm test -- portfolio` / Expected: PASS
- [ ] **Step 4: typecheck + lint + test** — Run: `npm run typecheck && npm run lint && npm test` / Expected: 통과
- [ ] **Step 5: 커밋** — `git add -A && git commit -m "feat(nav): 포트폴리오를 /assets/stocks로 이동하고 홈을 더미로 교체"`

---

## Task 6: MainTabBar (기존 BottomTabBar 대체)

**Files:**
- Create: `components/nav/MainTabBar.tsx`
- Test: `test/ui/MainTabBar.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성** (usePathname 모킹, 5탭 렌더 + 자산 클릭 시 setLastMainTab)

```tsx
// test/ui/MainTabBar.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const push = vi.fn();
let pathname = "/plan";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));

import { MainTabBar } from "@/components/nav/MainTabBar";
import { useNavStore } from "@/stores/nav-store";

beforeEach(() => {
  push.mockClear();
  useNavStore.setState({ lastMainTabPath: "/" });
  pathname = "/plan";
});

describe("MainTabBar", () => {
  it("5개 탭을 렌더한다", () => {
    render(<MainTabBar />);
    ["홈", "자산", "계획", "가계부", "설정"].forEach((t) =>
      expect(screen.getByText(t)).toBeInTheDocument()
    );
  });
  it("현재 경로(/plan)의 탭이 활성(aria-current)이다", () => {
    render(<MainTabBar />);
    expect(screen.getByText("계획").closest("a")).toHaveAttribute("aria-current", "page");
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npm test -- MainTabBar` / Expected: FAIL

- [ ] **Step 3: 구현** — 기존 BottomTabBar 스타일/접근성을 계승하되 `mainTabs`와 `resolveActiveMain`을 사용. 자산 탭 클릭 시(현재가 자산 경로가 아니면) `setLastMainTab(현재 pathname)` 저장.

```tsx
// components/nav/MainTabBar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { mainTabs } from "@/lib/nav/nav-config";
import { resolveActiveMain, isAssetsRoute } from "@/lib/nav/active";
import { useNavStore } from "@/stores/nav-store";

/**
 * 메인 하단 탭(5개). 고정 하단, surface-card 배경, active=ink/inactive=muted.
 * 자산 탭 진입 시 직전 메인 탭 경로를 저장해 중첩 바 ← 복귀에 사용한다.
 */
export function MainTabBar() {
  const pathname = usePathname();
  const activeKey = resolveActiveMain(pathname);
  const setLastMainTab = useNavStore((s) => s.setLastMainTab);

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-surface-card border-t border-hairline"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="주요 화면"
    >
      <ul className="mx-auto flex w-full max-w-[480px] items-stretch">
        {mainTabs.map((tab) => {
          const active = tab.key === activeKey;
          const onClick = () => {
            // 자산 탭으로 진입할 때, 현재가 자산 경로가 아니면 복귀 지점으로 기록
            if (tab.key === "assets" && !isAssetsRoute(pathname)) {
              setLastMainTab(pathname);
            }
          };
          return (
            <li key={tab.key} className="flex-1">
              <Link
                href={tab.href}
                onClick={onClick}
                aria-current={active ? "page" : undefined}
                className={`flex h-[56px] flex-col items-center justify-center gap-[3px] transition-colors ${
                  active ? "text-ink" : "text-muted"
                }`}
              >
                {tab.icon?.(active)}
                <span className="text-[12px] font-semibold leading-[1.4]">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 4: 통과 확인** — Run: `npm test -- MainTabBar` / Expected: PASS
- [ ] **Step 5: 커밋** — `git add components/nav/MainTabBar.tsx test/ui/MainTabBar.test.tsx && git commit -m "feat(nav): 5탭 MainTabBar 추가"`

---

## Task 7: AssetSubTabBar (중첩 바)

**Files:**
- Create: `components/nav/AssetSubTabBar.tsx`
- Test: `test/ui/AssetSubTabBar.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성** — (1) 서브탭 렌더, (2) `/assets/stocks`에서 주식 활성, (3) ← 클릭 시 `lastMainTabPath`로 push.

```tsx
// test/ui/AssetSubTabBar.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
let pathname = "/assets/stocks";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));

import { AssetSubTabBar } from "@/components/nav/AssetSubTabBar";
import { useNavStore } from "@/stores/nav-store";

beforeEach(() => {
  push.mockClear();
  pathname = "/assets/stocks";
  useNavStore.setState({ lastMainTabPath: "/plan" });
});

describe("AssetSubTabBar", () => {
  it("자산 서브탭들을 렌더한다", () => {
    render(<AssetSubTabBar visible />);
    ["자산", "주식", "저축/현금성", "연금", "코인"].forEach((t) =>
      expect(screen.getByText(t)).toBeInTheDocument()
    );
  });
  it("← 버튼은 lastMainTabPath로 push한다", async () => {
    const user = userEvent.setup();
    render(<AssetSubTabBar visible />);
    await user.click(screen.getByRole("button", { name: "이전" }));
    expect(push).toHaveBeenCalledWith("/plan");
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npm test -- AssetSubTabBar` / Expected: FAIL

- [ ] **Step 3: 구현** — `visible` prop으로 노출/숨김 클래스 토글. 숨김 시 `aria-hidden` + `pointer-events-none`로 접근성 누수 방지. 메인 바(56px+safe-area) 위에 고정(`bottom: calc(56px + env(...))`), 높이 48px.

```tsx
// components/nav/AssetSubTabBar.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { assetSubTabs } from "@/lib/nav/nav-config";
import { resolveActiveSub } from "@/lib/nav/active";
import { useNavStore } from "@/stores/nav-store";

/**
 * 자산 중첩 하단 바. 메인 바 바로 위에 쌓인다. visible=false면 아래로 슬라이드되어 숨겨진다.
 * 항상 마운트하고 transform/opacity만 토글해 등장·사라짐 양방향 애니메이션을 만든다.
 */
export function AssetSubTabBar({ visible }: { visible: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const activeKey = resolveActiveSub(pathname);
  const lastMainTabPath = useNavStore((s) => s.lastMainTabPath);

  return (
    <div
      aria-hidden={visible ? undefined : true}
      className={`fixed inset-x-0 z-40 bg-surface-card border-t border-hairline transition-[transform,opacity] duration-[250ms] ease-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none"
      }`}
      style={{ bottom: "calc(56px + env(safe-area-inset-bottom))" }}
    >
      <ul className="mx-auto flex w-full max-w-[480px] items-center h-[48px] px-1">
        <li className="shrink-0">
          <button
            type="button"
            aria-label="이전"
            tabIndex={visible ? 0 : -1}
            onClick={() => router.push(lastMainTabPath || "/")}
            className="flex h-[48px] w-[40px] items-center justify-center text-muted"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </li>
        {assetSubTabs.map((tab) => {
          const active = tab.key === activeKey;
          return (
            <li key={tab.key} className="flex-1">
              <Link
                href={tab.href}
                tabIndex={visible ? 0 : -1}
                aria-current={active ? "page" : undefined}
                className={`flex h-[48px] flex-col items-center justify-center transition-colors ${
                  active ? "text-ink" : "text-muted"
                }`}
              >
                <span className="text-[12px] font-semibold leading-[1.3] whitespace-nowrap">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인** — Run: `npm test -- AssetSubTabBar` / Expected: PASS
- [ ] **Step 5: 커밋** — `git add components/nav/AssetSubTabBar.tsx test/ui/AssetSubTabBar.test.tsx && git commit -m "feat(nav): 자산 중첩 서브탭 바 추가"`

---

## Task 8: AppNav 컨테이너 (조립 + 동적 패딩 + 숨김)

**Files:**
- Create: `components/nav/AppNav.tsx`
- Test: `test/ui/AppNav.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성** — (1) `/holdings/*`에선 두 바 모두 숨김, (2) `/assets/*`에선 중첩 바 노출, (3) 일반 경로에선 메인 바만.

```tsx
// test/ui/AppNav.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
}));

import { AppNav } from "@/components/nav/AppNav";

function setPath(p: string) { pathname = p; }

describe("AppNav", () => {
  it("/holdings 상세에서는 네비를 숨긴다", () => {
    setPath("/holdings/123");
    render(<AppNav><div>본문</div></AppNav>);
    expect(screen.queryByRole("navigation", { name: "주요 화면" })).not.toBeInTheDocument();
  });
  it("일반 경로에서는 메인 바를 표시한다", () => {
    setPath("/plan");
    render(<AppNav><div>본문</div></AppNav>);
    expect(screen.getByRole("navigation", { name: "주요 화면" })).toBeInTheDocument();
  });
  it("자산 경로에서는 중첩 바(자산 서브탭)도 노출된다", () => {
    setPath("/assets/stocks");
    render(<AppNav><div>본문</div></AppNav>);
    // 중첩 바의 ← 버튼이 보이고 pointer-events가 살아있는지(visible)로 판단
    const back = screen.getByRole("button", { name: "이전" });
    expect(back).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npm test -- AppNav` / Expected: FAIL

- [ ] **Step 3: 구현** — 상세 경로면 children만(패딩 0) 렌더. 그 외엔 두 바 + 동적 하단 패딩.

```tsx
// components/nav/AppNav.tsx
"use client";

import { usePathname } from "next/navigation";
import { MainTabBar } from "@/components/nav/MainTabBar";
import { AssetSubTabBar } from "@/components/nav/AssetSubTabBar";
import { isAssetsRoute, isDetailRoute } from "@/lib/nav/active";

/**
 * 하단 네비게이션 컨테이너. 경로에 따라:
 * - /holdings/* (상세): 모든 네비 숨김, 패딩 0 (풀스크린)
 * - /assets/*: 메인 바 + 중첩 바, 하단 패딩 56+48
 * - 그 외: 메인 바만, 하단 패딩 56
 * AssetSubTabBar를 MainTabBar보다 먼저 렌더해 슬라이드다운 시 메인 바에 가려지게 한다.
 */
export function AppNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isDetailRoute(pathname)) {
    return <>{children}</>;
  }

  const assets = isAssetsRoute(pathname);
  const padBottom = assets
    ? "calc(56px + 48px + env(safe-area-inset-bottom))"
    : "calc(56px + env(safe-area-inset-bottom))";

  return (
    <>
      <div style={{ paddingBottom: padBottom }}>{children}</div>
      <AssetSubTabBar visible={assets} />
      <MainTabBar />
    </>
  );
}
```

- [ ] **Step 4: 통과 확인** — Run: `npm test -- AppNav` / Expected: PASS
- [ ] **Step 5: 커밋** — `git add components/nav/AppNav.tsx test/ui/AppNav.test.tsx && git commit -m "feat(nav): AppNav 컨테이너(조립·동적 패딩·상세 숨김) 추가"`

---

## Task 9: LockGate 연결 + BottomTabBar 제거

**Files:**
- Modify: `components/LockGate.tsx`
- Modify: `test/ui/LockGate.test.tsx`
- Delete: `components/BottomTabBar.tsx`

- [ ] **Step 1: LockGate가 AppNav를 쓰도록 수정** — `components/LockGate.tsx`의 import와 잠금 해제 분기 교체:

```tsx
// import 교체
import { AppNav } from "@/components/nav/AppNav";

// 잠금 해제 분기 교체 (기존 75-83행)
if (!locked) {
  return <AppNav>{children}</AppNav>;
}
```

> 동적 패딩은 AppNav가 책임지므로 기존 `<div style={{ paddingBottom: ... }}>` 래퍼는 제거한다.

- [ ] **Step 2: LockGate 테스트 보강** — `test/ui/LockGate.test.tsx`의 `next/navigation` 모킹에 `useRouter` 추가(AppNav 하위가 사용). 기존:

```tsx
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: () => {} }),
}));
```

잠금 해제 후 "앱 콘텐츠"가 보이는 기존 단언은 그대로 통과해야 한다. `useNavStore` 초기화도 afterEach에 추가하면 안전.

- [ ] **Step 3: BottomTabBar 삭제** — `git rm components/BottomTabBar.tsx` (참조가 MainTabBar/nav-config로 모두 이전됐는지 `grep -rn BottomTabBar` 로 확인 후)
- [ ] **Step 4: 전체 검증** — Run: `npm run typecheck && npm run lint && npm test` / Expected: 전부 통과
- [ ] **Step 5: 커밋** — `git add -A && git commit -m "feat(nav): LockGate를 AppNav로 연결하고 BottomTabBar 제거"`

---

## Task 10: DESIGN.md 반영 + 최종 검증

**Files:**
- Modify: `DESIGN.md`

- [ ] **Step 1: DESIGN.md에 추가** — 다음 규격을 컴포넌트/모션 섹션에 문서화:
  - 메인 탭 바: 높이 56px, `bg-surface-card`, 상단 `border-hairline`, active `text-ink`/inactive `text-muted`, safe-area-inset-bottom 패딩.
  - 자산 중첩 바: 높이 48px, 메인 바 위 `bottom: calc(56px + safe-area)`에 고정, 동일 surface/hairline 토큰.
  - 모션 토큰: 중첩 바 등장/사라짐 = `transition-[transform,opacity] duration-[250ms] ease-out` (translate-y 슬라이드). 이 토큰을 "모션" 항목으로 명시.
  - 더미 페이지: 제목 `text-[22px] font-bold text-ink` + 보조문구 `text-muted`.
- [ ] **Step 2: 수동 확인(선택)** — `npm run dev`로 홈→자산→주식→← 흐름과 슬라이드 애니메이션, 상세 진입 시 네비 숨김을 눈으로 확인.
- [ ] **Step 3: 전체 검증** — Run: `npm run typecheck && npm run lint && npm test` / Expected: 전부 통과
- [ ] **Step 4: 커밋** — `git add DESIGN.md && git commit -m "docs: 하단 네비/중첩 바 규격과 모션 토큰을 DESIGN.md에 반영"`

---

## 완료 기준

- 메인 5탭(홈·자산·계획·가계부·설정)이 모든 화면 하단에 표시된다.
- 자산 탭 진입 시 중첩 바가 슬라이드업으로 등장하고 `/assets`(자산 개요)가 기본 활성.
- 주식 서브탭이 기존 포트폴리오 페이지를 보여준다.
- ← 버튼이 직전 메인 탭으로 복귀하고, 중첩 바가 슬라이드다운으로 사라진다.
- `/holdings/*` 상세화면에서는 하단 네비가 숨겨진다.
- 설정 탭은 기존 설정 페이지 그대로.
- `typecheck · lint · test` 전부 통과.
- 새 자산 카테고리는 `nav-config.tsx` 배열 + 더미 라우트 추가만으로 확장 가능.
