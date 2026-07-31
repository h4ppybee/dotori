/** URL pathname에서 네비게이션 활성 상태를 파생하는 순수 함수들. */

export function isAssetsRoute(pathname: string): boolean {
  return pathname === "/assets" || pathname.startsWith("/assets/");
}

export function isDetailRoute(pathname: string): boolean {
  return pathname === "/holdings" || pathname.startsWith("/holdings/");
}

export function isPlanRoute(pathname: string): boolean {
  return pathname === "/plan" || pathname.startsWith("/plan/");
}

/** 중첩 서브 네비(플로팅 pill)를 쓰는 라우트 = 자산 ∪ 계획. */
export function isNestedRoute(pathname: string): boolean {
  return isAssetsRoute(pathname) || isPlanRoute(pathname);
}

/** 활성 메인 탭 key. 홈은 정확히 "/", 자산은 /assets 이하 전체, 나머지는 정확 매칭. */
export function resolveActiveMain(pathname: string): string | null {
  if (pathname === "/") {
    return "home";
  }
  if (isAssetsRoute(pathname)) {
    return "assets";
  }
  if (pathname === "/plan" || pathname.startsWith("/plan/")) {
    return "plan";
  }
  if (pathname === "/ledger" || pathname.startsWith("/ledger/")) {
    return "ledger";
  }
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return "settings";
  }
  return null;
}

/** 활성 자산 서브탭 key. 가장 긴 prefix 우선(/assets/stocks > /assets). */
export function resolveActiveSub(pathname: string): string | null {
  if (!isAssetsRoute(pathname)) {
    return null;
  }
  if (pathname === "/assets/stocks" || pathname.startsWith("/assets/stocks/")) {
    return "stocks";
  }
  if (pathname === "/assets/savings" || pathname.startsWith("/assets/savings/")) {
    return "savings";
  }
  if (pathname === "/assets/pension" || pathname.startsWith("/assets/pension/")) {
    return "pension";
  }
  if (pathname === "/assets/crypto" || pathname.startsWith("/assets/crypto/")) {
    return "crypto";
  }
  return "overview";
}

/** 활성 계획 서브탭 key. 자산의 "overview"와 달리 계획은 "envelope"가 곧 기본 탭이라 catch-all과 동일(의도된 차이). */
export function resolveActivePlanSub(pathname: string): string | null {
  if (!isPlanRoute(pathname)) {
    return null;
  }
  if (pathname === "/plan/realty" || pathname.startsWith("/plan/realty/")) {
    return "realty";
  }
  return "envelope";
}
