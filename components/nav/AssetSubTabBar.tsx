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
