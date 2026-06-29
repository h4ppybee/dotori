# 하단 네비게이션(중첩 탭) 리팩토링 설계

작성일: 2026-06-29

## 목적

현재 2개(포트폴리오·설정)뿐인 하단 탭을 토스 UX를 참고해 **5개 메인 탭 + '자산' 탭의
중첩(Nested) 하단 네비게이션** 구조로 개편한다. 토스 증권의 "증권 → 증권" 처럼, 자산
탭에 들어가면 메인 바 위로 자산 카테고리 서브 바가 슬라이드업으로 올라온다.

향후 보험·부동산·카드·대출 등 자산 카테고리가 추가돼도 **선언적 설정 배열에 항목만
추가**하면 되도록 확장성을 우선한다. URL을 진실의 원천으로 삼아 Android 뒤로가기·딥링크·
새로고침 복원을 별도 구현 없이 브라우저 히스토리에 위임한다.

## 확정된 동작

### 메인 탭 (항상 표시, 5개)

| 탭 | 경로 | 콘텐츠 |
|---|---|---|
| 홈 | `/` | 더미 (제목만) |
| 자산 | `/assets` | 더미 (자산 개요) |
| 계획 | `/plan` | 더미 |
| 가계부 | `/ledger` | 더미 |
| 설정 | `/settings` | **기존 설정 페이지(유지)** |

### 자산 서브 탭 (`/assets/*` 경로에서만 표시되는 중첩 바)

| 서브탭 | 경로 | 콘텐츠 |
|---|---|---|
| ← (이전) | 직전 메인 탭으로 복귀 | — |
| 자산 | `/assets` | 더미 (기본 활성) |
| 주식 | `/assets/stocks` | **기존 포트폴리오 페이지(이동)** |
| 저축/현금성 | `/assets/savings` | 더미 |
| 연금 | `/assets/pension` | 더미 |
| 코인 | `/assets/crypto` | 더미 |

### 핵심 규칙

- **라우팅 방식**: URL 라우트 기반. 각 탭/서브탭이 실제 Next App Router 경로다.
- **자산 탭 기본 진입**: `/assets`(자산 개요 더미)가 기본 활성. 토스 "증권→증권"과 동일.
- **← 버튼**: 자산 진입 직전에 보던 메인 탭으로 복귀. 히스토리가 없으면 `/` 폴백.
- **중첩 바 노출 조건**: `pathname`이 `/assets`로 시작할 때만.
- **상세화면(`/holdings/*`)**: 주식 하위 풀스크린 상세로 보고 **메인·중첩 네비를 모두 숨긴다**
  (토스 상세화면 관례). 상세화면은 자체 뒤로가기를 사용한다.

## 비목표 (YAGNI)

- 더미 페이지의 실제 기능 구현(계획·가계부·자산개요·저축·연금·코인 콘텐츠) — 이번 범위 아님.
  제목만 있는 더미로 둔다.
- 보험·부동산·카드·대출 등 미래 카테고리의 실제 추가 — 구조만 확장 가능하게 둔다.
- 탭 전환 페이지 트랜지션(슬라이드 등 화면 단위 전환 애니메이션). 중첩 바 등장/사라짐만 애니메이션.
- 네비게이션 상태의 별도 영속화(IndexedDB) — URL이 곧 상태이므로 불필요.
- 탭별 스크롤 위치 복원.

## 아키텍처

### 진실의 원천: URL (pathname)

네비게이션의 활성 상태는 모두 `usePathname()`에서 **파생**한다. 탭 상태를 store에 중복
보관하지 않는다(이중 소스 → 동기화 버그 방지). store에는 ← 복귀에만 필요한 단일 부수
상태 하나만 둔다.

```ts
// stores/nav-store.ts
import { create } from "zustand";

interface NavState {
  /** 자산 탭 진입 직전에 보던 메인 탭 경로. ← 버튼 복귀 대상. */
  lastMainTabPath: string;
  setLastMainTab: (path: string) => void;
}

export const useNavStore = create<NavState>((set) => ({
  lastMainTabPath: "/",
  setLastMainTab: (path) => set({ lastMainTabPath: path }),
}));
```

파생 규칙:

- 활성 메인 탭 = `mainTabs` 중 `isActive(pathname)`가 참인 항목.
  - 자산은 `pathname.startsWith("/assets")`, 홈은 `pathname === "/"`, 나머지는 `startsWith`.
- 활성 자산 서브 탭 = `assetSubTabs` 중 경로가 매칭되는 항목(가장 긴 prefix 우선,
  `/assets/stocks`가 `/assets`보다 우선).
- 중첩 바 노출 = `pathname.startsWith("/assets")`.
- 모든 네비 숨김 = `pathname.startsWith("/holdings")`.

### 선언적 탭 설정

모든 탭을 한 파일의 배열로 정의한다. **카테고리 확장 = 이 배열에 항목 추가 + 더미 라우트
폴더 생성**으로 끝난다.

```ts
// lib/nav/nav-config.ts
import type { ReactNode } from "react";

export interface TabDef {
  key: string;
  href: string;
  label: string;
  icon: (active: boolean) => ReactNode;
  /** 활성 판정 커스터마이즈(없으면 기본 prefix 규칙). */
  match?: (pathname: string) => boolean;
}

export const mainTabs: TabDef[] = [
  { key: "home",     href: "/",         label: "홈",     icon: HomeIcon },
  { key: "assets",   href: "/assets",   label: "자산",   icon: AssetsIcon,
    match: (p) => p.startsWith("/assets") },
  { key: "plan",     href: "/plan",     label: "계획",   icon: PlanIcon },
  { key: "ledger",   href: "/ledger",   label: "가계부", icon: LedgerIcon },
  { key: "settings", href: "/settings", label: "설정",   icon: SettingsIcon },
];

export const assetSubTabs: TabDef[] = [
  { key: "overview", href: "/assets",         label: "자산" },
  { key: "stocks",   href: "/assets/stocks",  label: "주식" },
  { key: "savings",  href: "/assets/savings", label: "저축/현금성" },
  { key: "pension",  href: "/assets/pension", label: "연금" },
  { key: "crypto",   href: "/assets/crypto",  label: "코인" },
  // 향후: { key: "insurance", href: "/assets/insurance", label: "보험" } ...
];
```

> 아이콘 함수는 기존 `BottomTabBar`의 인라인 SVG 패턴(`(active: boolean) => ReactNode`)을
> 그대로 따른다. 신규 아이콘은 DESIGN.md 아이콘 규칙(단순 solid/stroke)에 맞춘다.

## 화면 전환 흐름

```
[홈/계획/가계부/설정]  ──자산 탭 클릭──▶  /assets
   (setLastMainTab(현재경로))            (중첩 바 slide-up 등장, 서브:자산 활성)

/assets  ──주식 클릭──▶  /assets/stocks   (메인:자산 유지, 서브:주식 활성)

/assets/*  ──← 클릭──▶  lastMainTabPath   (중첩 바 slide-down 사라짐)

/assets/stocks  ──종목 클릭──▶  /holdings/[id]   (모든 네비 숨김, 자체 뒤로가기)
/holdings/new   (추가 폼)                          (모든 네비 숨김)
```

## Navigation State Machine

```
        ┌─────────────────────────────────────┐
        │  MAIN  (/, /plan, /ledger, /settings) │
        │  메인 바: 표시 / 중첩 바: 숨김         │
        └───────────────┬─────────────────────┘
            자산 탭 클릭   │ ▲ ← 클릭 (lastMainTabPath)
                         ▼ │
        ┌─────────────────────────────────────┐
        │  ASSETS  (/assets, /assets/*)        │
        │  메인 바: 표시(자산 활성) / 중첩 바: 표시 │
        │  서브: 자산↔주식↔저축↔연금↔코인        │
        └───────────────┬─────────────────────┘
            종목/추가 클릭 │ ▲ 상세 자체 뒤로가기
                         ▼ │
        ┌─────────────────────────────────────┐
        │  DETAIL  (/holdings/*)               │
        │  모든 하단 네비: 숨김 (풀스크린)        │
        └─────────────────────────────────────┘
```

- **Android 하드웨어 백 / 브라우저 백**: 각 탭이 실제 URL이므로 `popstate` → Next 히스토리가
  자동 처리한다. 별도 구현 불필요.
- **← (중첩 바 이전 버튼)**: 하드웨어 백과 별개의 UI 어포던스다. `lastMainTabPath`로 명시
  `router.push`한다(`router.back()`은 히스토리가 비어있을 때 앱을 벗어날 수 있어 사용하지 않음).
- **새로고침/딥링크**: URL이 상태이므로 그대로 복원. `lastMainTabPath`만 초기값 `/`로 리셋되며,
  이는 ← 폴백으로만 쓰이므로 문제없다.

## 컴포넌트 계층

```
LockGate
 └─ AppNav                       ← 네비 컨테이너. pathname 구독, 숨김/노출/패딩 판단
     ├─ AssetSubTabBar           ← 중첩 바. /assets/* 에서만 노출, CSS 슬라이드 애니메이션
     │    ├─ BackButton          ← ← 버튼 (lastMainTabPath로 push)
     │    └─ SubTab × N          ← assetSubTabs 렌더
     └─ MainTabBar               ← 메인 5탭 (기존 BottomTabBar 리팩토링)
          └─ MainTab × 5         ← mainTabs 렌더

lib/nav/nav-config.ts            ← 선언적 탭 정의(mainTabs, assetSubTabs, 아이콘)
stores/nav-store.ts             ← lastMainTabPath
components/nav/DummyPage.tsx     ← 제목만 있는 더미 페이지 프리미티브
```

### 각 유닛의 책임

- **AppNav**: 단일 진입점. `pathname`으로 (1) 모든 네비 숨김 여부(`/holdings/*`), (2) 중첩 바
  노출 여부(`/assets/*`), (3) 콘텐츠 하단 패딩 높이를 계산해 자식과 패딩 컨텍스트에 전달.
  LockGate는 `AppNav`만 렌더하면 된다.
- **MainTabBar**: `mainTabs`를 받아 렌더. 자산 탭 클릭 시 `setLastMainTab(현재 pathname)`
  호출(단, 현재가 이미 `/assets/*`면 갱신하지 않음). 기존 `BottomTabBar`의 스타일·a11y
  (`aria-current`, safe-area-inset) 그대로 계승.
- **AssetSubTabBar**: `assetSubTabs` 렌더 + ← 버튼. 항상 마운트하되 노출 상태에 따라
  transform/opacity 토글(아래 애니메이션 전략).
- **DummyPage**: `{ title }`만 받아 중앙 정렬 제목을 보여주는 더미. 홈/계획/가계부/자산개요/
  저축/연금/코인 7개 라우트가 공용한다. DESIGN.md 타이포 토큰 사용.

### 경계 검증

- MainTabBar / AssetSubTabBar는 `nav-config.ts` 배열과 pathname만 의존 → 내부를 바꿔도
  소비자에게 영향 없음. 탭 추가는 설정 배열만 수정.
- 활성 판정 로직은 순수 함수로 분리 가능(`lib/nav/active.ts`: `resolveActiveMain(pathname)`,
  `resolveActiveSub(pathname)`) → 단위 테스트 대상.

## 라우트 구조 변경

```
app/
  page.tsx                  홈 더미 (DummyPage "홈")  ← 기존 포트폴리오 내용은 이동
  assets/
    page.tsx                자산 개요 더미
    stocks/page.tsx         기존 포트폴리오 페이지 (현 app/page.tsx 내용 이전)
    savings/page.tsx        더미
    pension/page.tsx        더미
    crypto/page.tsx         더미
  plan/page.tsx             더미
  ledger/page.tsx           더미
  settings/page.tsx         기존 유지
  holdings/new/page.tsx     기존 유지 (네비 숨김 대상)
  holdings/[id]/page.tsx    기존 유지 (네비 숨김 대상)
```

### 포트폴리오 페이지 이동 시 주의

- 현 `app/page.tsx`의 내부 네비게이션 링크(예: 빈 상태의 "종목 추가" → `/holdings/new`,
  종목 클릭 → `/holdings/[id]`)는 경로 그대로 유지(상세는 최상위 `/holdings/*` 유지).
- 포트폴리오에서 홈으로 가던 동선이 없으므로 추가 리다이렉트는 불필요.

## 애니메이션 전략 (라이브러리 없음, CSS only)

신규 의존성 없이 Tailwind 트랜지션으로 구현한다.

- **중첩 바(AssetSubTabBar)**: 항상 마운트하고 노출 여부로 클래스 토글.
  - 노출: `translate-y-0 opacity-100`
  - 숨김: `translate-y-full opacity-0 pointer-events-none`
  - 공통: `transition-[transform,opacity] duration-250 ease-out`
  - 항상 마운트하므로 **등장(slide-up)·사라짐(slide-down) 양방향 모두 애니메이션**되고
    언마운트 깜빡임이 없다.
- **위치**: 메인 바 바로 위에 쌓인다(메인 바 높이 56px + safe-area 위로 중첩 바 48px).
- **메인 탭 active 전환**: 기존 `transition-colors` 유지.
- **모션 토큰**: DESIGN.md에 모션(duration/easing) 토큰이 있으면 사용하고, 없으면 신설 후
  DESIGN.md에 추가한다(코드-문서 일치 규칙).

### 콘텐츠 하단 패딩

LockGate가 현재 고정 `56px + safe-area`를 적용한다. AppNav가 경로에 따라 동적으로 계산한다.

- `/holdings/*`: 패딩 0 (네비 숨김).
- `/assets/*`: `56 + 48 + safe-area` (메인 + 중첩 바).
- 그 외: `56 + safe-area` (메인 바만).

## 디자인 토큰 / DESIGN.md 반영

- 새 아이콘 5종(홈·자산·계획·가계부) 및 자산 서브탭 아이콘은 DESIGN.md 아이콘 규칙을 따른다.
- 중첩 바 규격(높이 48px, 배경 surface-card, 상단 hairline, ← 버튼 영역)과 모션 토큰은
  **DESIGN.md에 컴포넌트 규격으로 추가**한다.
- 임의 색·간격·radius 신설 금지. 기존 토큰(`bg-surface-card`, `border-hairline`, `text-ink`,
  `text-muted` 등) 재사용.

## 구현 순서 (Phase별)

1. **Phase 1 — 라우트 골격**: 더미 라우트 폴더/페이지 생성(`assets`, `assets/*`, `plan`,
   `ledger`), `DummyPage` 프리미티브. 기존 `app/page.tsx` → `app/assets/stocks/page.tsx`로
   이동, `/`는 홈 더미로 교체. 이 시점에 기존 2탭 바로도 새 경로가 동작하는지 확인.
2. **Phase 2 — 설정·스토어**: `lib/nav/nav-config.ts`, `lib/nav/active.ts`(활성 판정 순수
   함수 + 단위 테스트), `stores/nav-store.ts`.
3. **Phase 3 — 메인 바 리팩토링**: `BottomTabBar` → `components/nav/MainTabBar.tsx`로 이동,
   5탭 + 설정 기반 렌더 + 자산 클릭 시 `setLastMainTab`.
4. **Phase 4 — 중첩 바**: `components/nav/AssetSubTabBar.tsx`(← 버튼 + 서브탭 + CSS 애니메이션).
5. **Phase 5 — 컨테이너/패딩/숨김**: `components/nav/AppNav.tsx`로 두 바를 조합, 동적 패딩,
   `/holdings/*` 네비 숨김. LockGate가 AppNav만 렌더하도록 수정.
6. **Phase 6 — DESIGN.md 반영 + 검증**: 토큰·컴포넌트 규격 문서화, `typecheck · lint · test`
   통과.

## 테스트 전략

- **순수 함수**(`lib/nav/active.ts`): `resolveActiveMain`/`resolveActiveSub`가 다양한
  pathname(`/`, `/assets`, `/assets/stocks`, `/assets/savings`, `/settings`, `/holdings/123`)에
  대해 올바른 탭 key를 반환하는지.
- **컴포넌트**: 중첩 바가 `/assets/*`에서만 노출 클래스를 갖고 그 외에선 숨김 클래스를 갖는지.
  ← 버튼 클릭 시 `lastMainTabPath`로 push되는지(라우터 모킹).
- 기존 포트폴리오 테스트는 경로 이동 후에도 통과하도록 import 경로만 조정.

## 예상 리스크 & 해결

| 리스크 | 해결 |
|---|---|
| 포트폴리오를 보던 기존 `/` 진입 기대 | 로컬 앱이라 외부 북마크 의존 없음. 홈은 더미로 두고 리다이렉트 불필요 |
| 콘텐츠가 2단 네비(메인+중첩)에 가려짐 | AppNav가 경로별 동적 하단 패딩 적용(`/assets/*`는 56+48) |
| ← 딥링크 직접 진입 시 복귀 대상 없음 | `lastMainTabPath` 폴백 `/`. `router.back()` 대신 명시적 push |
| 상세화면 네비 숨김이 기존 동작 변경 | 상세는 풀스크린 + 자체 백버튼으로 일관(브레인스토밍에서 합의) |
| 활성 판정 prefix 충돌(`/assets` vs `/assets/stocks`) | 가장 긴 prefix 우선 규칙 + 순수 함수 단위 테스트로 고정 |
| 중첩 바 항상 마운트로 인한 포커스/접근성 누수 | 숨김 시 `pointer-events-none` + `aria-hidden`/`tabindex=-1`로 비활성화 |

## 토스 UX 대비 개선 제안

- **선언적 설정 기반 확장**: 토스는 카테고리가 고정적이지만, 우리는 `nav-config.ts` 배열 +
  더미 라우트만으로 카테고리를 늘릴 수 있어 추가 비용이 거의 0이다.
- **URL 우선 설계**: 모든 탭이 딥링크/공유/새로고침에 안전. PWA 특성과 잘 맞는다.
- **단일 진실 원천**: 탭 상태를 store에 중복 저장하지 않아 동기화 버그 여지를 제거.
- **점진적 활성화**: 더미 → 실제 페이지 전환이 라우트 파일 교체만으로 가능해, 네비 구조를
  건드리지 않고 기능을 하나씩 채워나갈 수 있다.
