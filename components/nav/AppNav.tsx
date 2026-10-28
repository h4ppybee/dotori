"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MainTabBar } from "@/components/nav/MainTabBar";
import { NestedTabBar } from "@/components/nav/NestedTabBar";
import { assetSubTabs, planSubTabs } from "@/lib/nav/nav-config";
import {
  isDetailRoute,
  isNestedRoute,
  isPlanRoute,
  resolveActiveSub,
  resolveActivePlanSub,
} from "@/lib/nav/active";

/**
 * 하단 네비게이션 컨테이너. 경로에 따라 두 바 중 하나만 노출한다(서로 교대):
 * - /holdings/* (상세): 모든 네비 숨김, 패딩 0 (풀스크린)
 * - 중첩 경로(/assets/*·/plan/*): 메인 바는 사라지고 플로팅 중첩 바(pill)만 떠오름.
 *   서브탭·활성 키는 자산/계획 여부에 따라 골라 주입한다. 하단 패딩 = pill(56) + 여백
 * - 그 외: 메인 바만. 하단 패딩 56
 * 두 바 모두 항상 마운트하고 visible로 토글해 순차 전환(메인 바 하강 → pill 펼침, 역순 복귀)을 만든다.
 */
export function AppNav({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (isDetailRoute(pathname)) {
    return <>{children}</>;
  }

  const nested = isNestedRoute(pathname);
  const plan = isPlanRoute(pathname);
  const tabs = plan ? planSubTabs : assetSubTabs;
  const activeKey = plan ? resolveActivePlanSub(pathname) : resolveActiveSub(pathname);
  // 플로팅 pill: 높이 56 + 위아래 여백 12 → 콘텐츠가 가려지지 않도록 80 확보.
  const padBottom = nested
    ? "calc(56px + 24px + env(safe-area-inset-bottom))"
    : "calc(56px + env(safe-area-inset-bottom))";

  return (
    <>
      <div style={{ paddingBottom: padBottom }}>{children}</div>
      <MainTabBar visible={!nested} />
      <NestedTabBar visible={nested} tabs={tabs} activeKey={activeKey} />
    </>
  );
}
