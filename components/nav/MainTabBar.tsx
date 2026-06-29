"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { mainTabs } from "@/lib/nav/nav-config";
import { resolveActiveMain, isAssetsRoute } from "@/lib/nav/active";
import { useNavStore } from "@/stores/nav-store";

/**
 * 메인 하단 탭(5개). 고정 하단, surface-card 배경, active=ink/inactive=muted.
 * 자산 탭 진입 시 직전 메인 탭 경로를 저장해 중첩 바 ← 복귀에 사용한다.
 * visible=false(자산 경로)면 아래로 슬라이드되어 사라지고, 그 자리에 플로팅 중첩 바가 뜬다.
 * 항상 마운트하고 transform/opacity만 토글해 양방향 애니메이션을 만든다(inert로 차단).
 */
export function MainTabBar({ visible = true }: { visible?: boolean }) {
  const pathname = usePathname();
  const activeKey = resolveActiveMain(pathname);
  const setLastMainTab = useNavStore((s) => s.setLastMainTab);

  return (
    <nav
      aria-hidden={visible ? undefined : true}
      inert={!visible ? true : undefined}
      className={`fixed bottom-0 inset-x-0 z-40 bg-surface-card border-t border-hairline transition-[transform,opacity] duration-[250ms] ease-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none"
      }`}
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
