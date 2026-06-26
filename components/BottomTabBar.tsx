"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab {
  href: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
}

function PortfolioIcon(active: boolean) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 13.5 9 9l3.5 3 6-6"
        stroke="currentColor"
        strokeWidth={active ? 2.4 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.5 6h4v4"
        stroke="currentColor"
        strokeWidth={active ? 2.4 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M4 19h16" stroke="currentColor" strokeWidth={active ? 2.4 : 2} strokeLinecap="round" />
    </svg>
  );
}

function SettingsIcon(active: boolean) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={active ? 2.4 : 2} />
      <path
        d="M12 3v2.5M12 18.5V21M21 12h-2.5M5.5 12H3M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8M18.4 18.4l-1.8-1.8M7.4 7.4 5.6 5.6"
        stroke="currentColor"
        strokeWidth={active ? 2.4 : 2}
        strokeLinecap="round"
      />
    </svg>
  );
}

const TABS: Tab[] = [
  { href: "/", label: "포트폴리오", icon: PortfolioIcon },
  { href: "/settings", label: "설정", icon: SettingsIcon },
];

/**
 * 하단 탭 내비게이션. 고정 하단, surface-card 배경,
 * active=ink / inactive=muted. PWA safe-area-inset-bottom 고려.
 */
export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-surface-card border-t border-hairline"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="주요 화면"
    >
      <ul className="mx-auto flex w-full max-w-[480px] items-stretch">
        {TABS.map((tab) => {
          const active =
            tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-[56px] flex-col items-center justify-center gap-[3px] transition-colors ${
                  active ? "text-ink" : "text-muted"
                }`}
              >
                {tab.icon(active)}
                <span className="text-[12px] font-semibold leading-[1.4]">
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
