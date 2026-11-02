"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MainTabBar } from "@/components/nav/MainTabBar";
import { NestedTabBar } from "@/components/nav/NestedTabBar";
import { findNestedSection, nestedSections } from "@/lib/nav/nav-config";
import { resolveNavDirection } from "@/lib/nav/direction";
import { isDetailRoute } from "@/lib/nav/active";

/**
 * 하단 네비게이션 컨테이너. 경로에 따라 두 바 중 하나만 노출한다(서로 교대):
 * - /holdings/* (상세): 모든 네비 숨김, 패딩 0 (풀스크린)
 * - 중첩 경로(/assets/*·/plan/*·/ledger/*): 메인 바는 사라지고 플로팅 중첩 바(pill)만 떠오름.
 *   서브탭·활성 키는 경로가 속한 중첩 섹션(nestedSections)에서 골라 주입한다. 하단 패딩 = pill(56) + 여백
 * - 그 외: 메인 바만. 하단 패딩 56
 * 두 바 모두 항상 마운트하고 visible로 토글해 순차 전환(메인 바 하강 → pill 펼침, 역순 복귀)을 만든다.
 * 화면 전환 텐션: 경로가 바뀌면 콘텐츠가 살짝(8px) 들어오며 선명해진다(220ms).
 * 오른쪽 탭으로 가면 왼쪽에서, 왼쪽 탭으로 가면 오른쪽에서 들어온다(resolveNavDirection).
 * key 리마운트 없이 Web Animations API로 transform·opacity만 움직여(합성 레이어) 페이지 상태를
 * 보존하고, 끝나면 transform이 남지 않아 내부 fixed 요소(Dialog 등)에 영향이 없다.
 */
export function AppNav({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const contentRef = useRef<HTMLDivElement>(null);
  const prevPathname = useRef(pathname);

  // 마지막으로 머문 중첩 섹션(렌더 중 상태 보정). 처음엔 자산 섹션으로 둔다.
  const section = findNestedSection(pathname);
  const [lastSection, setLastSection] = useState(section ?? nestedSections[0]);
  if (section && section !== lastSection) {
    setLastSection(section);
  }

  // 페인트 전에 시작해야 새 화면이 제자리에 한 번 그려졌다가 튀는 프레임이 없다.
  useLayoutEffect(() => {
    if (prevPathname.current === pathname) {
      return;
    }
    const direction = resolveNavDirection(prevPathname.current, pathname);
    prevPathname.current = pathname;
    const el = contentRef.current;
    if (!el || typeof el.animate !== "function") {
      return;
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    el.animate(
      [
        { transform: `translateX(${direction === "forward" ? -8 : 8}px)`, opacity: 0.4 },
        { transform: "translateX(0)", opacity: 1 },
      ],
      { duration: 220, easing: "cubic-bezier(0.22,1,0.36,1)" },
    );
  }, [pathname]);

  if (isDetailRoute(pathname)) {
    return <>{children}</>;
  }

  const nested = section != null;
  // 중첩 경로를 벗어나도 바가 접히는 동안 직전 섹션의 서브탭을 그대로 보여 준다.
  const tabs = (section ?? lastSection).subTabs;
  const activeKey = section?.resolveActive(pathname) ?? null;
  // 플로팅 pill: 높이 56 + 위아래 여백 12 → 콘텐츠가 가려지지 않도록 80 확보.
  const padBottom = nested
    ? "calc(56px + 24px + env(safe-area-inset-bottom))"
    : "calc(56px + env(safe-area-inset-bottom))";

  return (
    <>
      <div ref={contentRef} style={{ paddingBottom: padBottom }}>
        {children}
      </div>
      <MainTabBar visible={!nested} />
      <NestedTabBar visible={nested} tabs={tabs} activeKey={activeKey} />
    </>
  );
}
