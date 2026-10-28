import { assetSubTabs, mainTabs, planSubTabs } from "@/lib/nav/nav-config";
import { resolveActiveMain, resolveActivePlanSub, resolveActiveSub } from "@/lib/nav/active";

/** 화면 전환 방향. forward = 오른쪽 탭으로(왼쪽에서 들어옴), backward = 왼쪽 탭으로(오른쪽에서 들어옴). */
export type NavDirection = "forward" | "backward";

/** 경로의 탭 위치 [메인 탭 순서, 서브탭 순서]. 메인 탭이 없으면(상세 등) null. */
function tabPosition(pathname: string): [number, number] | null {
  const main = resolveActiveMain(pathname);
  if (main == null) {
    return null;
  }
  const mainIdx = mainTabs.findIndex((t) => t.key === main);
  const sub = resolveActiveSub(pathname) ?? resolveActivePlanSub(pathname);
  const subTabs = main === "plan" ? planSubTabs : assetSubTabs;
  const subIdx = sub == null ? 0 : subTabs.findIndex((t) => t.key === sub);
  return [mainIdx, subIdx];
}

/**
 * 이전·다음 경로의 탭 순서를 비교해 전환 방향을 정한다(메인 탭 우선, 같으면 서브탭).
 * 같은 위치(하위 화면 진입)나 판단할 수 없는 경로는 forward.
 */
export function resolveNavDirection(prev: string, next: string): NavDirection {
  const a = tabPosition(prev);
  const b = tabPosition(next);
  if (a == null || b == null) {
    return "forward";
  }
  if (b[0] !== a[0]) {
    return b[0] > a[0] ? "forward" : "backward";
  }
  return b[1] < a[1] ? "backward" : "forward";
}
