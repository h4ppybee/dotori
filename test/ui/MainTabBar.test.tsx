import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
let pathname = "/plan";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));

import { MainTabBar } from "@/components/nav/MainTabBar";
import { useNavStore } from "@/stores/nav-store";

beforeEach(() => {
  push.mockClear();
  useNavStore.setState({ lastMainTabPath: "/" });
  pathname = "/plan";
});

describe("MainTabBar", () => {
  it("5개 탭을 렌더한다", () => {
    render(<MainTabBar />);
    ["홈", "자산", "계획", "가계부", "설정"].forEach((t) =>
      expect(screen.getByText(t)).toBeInTheDocument()
    );
  });
  it("현재 경로(/plan)의 탭이 활성(aria-current)이다", () => {
    render(<MainTabBar />);
    expect(screen.getByText("계획").closest("a")).toHaveAttribute("aria-current", "page");
  });
  it("자산 경로가 아닐 때 자산 탭 클릭은 직전 경로를 저장한다", async () => {
    const user = userEvent.setup();
    render(<MainTabBar />);
    await user.click(screen.getByText("자산"));
    expect(useNavStore.getState().lastMainTabPath).toBe("/plan");
  });
  it("이미 자산 경로면 자산 탭 클릭이 복귀 지점을 덮어쓰지 않는다", async () => {
    pathname = "/assets/stocks";
    useNavStore.setState({ lastMainTabPath: "/plan" });
    const user = userEvent.setup();
    render(<MainTabBar />);
    await user.click(screen.getByText("자산"));
    expect(useNavStore.getState().lastMainTabPath).toBe("/plan");
  });
});
