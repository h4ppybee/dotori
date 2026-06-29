"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { assetSubTabs } from "@/lib/nav/nav-config";
import { resolveActiveSub } from "@/lib/nav/active";
import { useNavStore } from "@/stores/nav-store";

/**
 * 자산 중첩 네비게이션 — 둥근 플로팅 바(pill). 자산 경로(/assets/*)에서만 떠오른다.
 * 토스 증권의 플로팅 nested 바와 동일한 UX: 진입하면 메인 탭 바는 사라지고 이 pill만
 * 하단에 살짝 띄워 표시된다(좌우 여백 + shadow-floating). ←로 직전 메인 탭에 복귀한다.
 * 항상 마운트하고 transform/opacity만 토글해 등장·사라짐 양방향 애니메이션을 만든다.
 * visible=false면 아래로 슬라이드되어 숨겨진다(inert로 포커스/상호작용 차단).
 */
export function AssetSubTabBar({ visible }: { visible: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const activeKey = resolveActiveSub(pathname);
  const lastMainTabPath = useNavStore((s) => s.lastMainTabPath);

  return (
    <div
      aria-hidden={visible ? undefined : true}
      inert={!visible ? true : undefined}
      className={`fixed inset-x-0 z-50 transition-[transform,opacity] duration-[250ms] ease-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-[150%] opacity-0 pointer-events-none"
      }`}
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
    >
      <div className="mx-auto w-full max-w-[480px] px-4">
        <ul className="flex h-[56px] items-center gap-1 rounded-pill bg-surface-card pl-2 pr-3 shadow-floating">
          <li className="shrink-0">
            <button
              type="button"
              aria-label="이전"
              tabIndex={visible ? 0 : -1}
              onClick={() => router.push(lastMainTabPath || "/")}
              className="flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors active:bg-surface-soft"
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
                  className={`flex h-11 items-center justify-center rounded-full transition-colors ${
                    active ? "font-bold text-ink" : "font-semibold text-muted"
                  }`}
                >
                  <span className="text-[12px] leading-none whitespace-nowrap">{tab.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
