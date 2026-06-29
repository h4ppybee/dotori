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
