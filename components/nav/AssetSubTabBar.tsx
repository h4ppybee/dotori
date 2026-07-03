"use client";

import { useState } from "react";
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
 * 활성 표시는 낙관적: 탭을 누르는 즉시 옮기고, 실제 경로가 바뀌면 경로 기준으로 되돌린다.
 */
export function AssetSubTabBar({ visible }: { visible: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const lastMainTabPath = useNavStore((s) => s.lastMainTabPath);

  // 탭을 누른 직후 ~ 경로 변경 완료 사이에만 유효한 낙관적 활성 키.
  // 경로가 실제로 바뀌면 렌더 중 상태 보정 패턴으로 폐기한다.
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setPendingKey(null);
  }

  const activeKey = pendingKey ?? resolveActiveSub(pathname);

  return (
    <>
      {/* 하단 페이드 — 플로팅 pill 뒤로 비치는 스크롤 컨텐츠를 캔버스 색으로 자연스럽게 가린다.
          높이는 pill 상단(safe-area + 12px 띄움 + 56px 높이)까지만 덮도록 safe-area를 반영한다. */}
      <div
        aria-hidden
        className={`pointer-events-none fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-canvas via-canvas/85 to-transparent transition-opacity duration-[250ms] ease-out ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        style={{ height: "calc(env(safe-area-inset-bottom) + 72px)" }}
      />
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
                    onClick={() => setPendingKey(tab.key)}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-[52px] flex-col items-center justify-center gap-[2px] rounded-full transition-colors ${
                      active ? "font-bold text-ink" : "font-semibold text-muted"
                    }`}
                  >
                    {tab.icon?.(active)}
                    <span className="text-[11px] leading-none whitespace-nowrap">{tab.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </>
  );
}
