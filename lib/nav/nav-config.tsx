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
