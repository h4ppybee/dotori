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
  it("탭을 누르면 경로가 바뀌기 전에도 활성 표시가 즉시 옮겨간다", async () => {
    const user = userEvent.setup();
    render(<MainTabBar />);
    await user.click(screen.getByText("설정"));
    expect(screen.getByText("설정").closest("a")).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("계획").closest("a")).not.toHaveAttribute("aria-current");
  });
  it("경로가 실제로 바뀌면 낙관적 표시를 버리고 경로 기준으로 돌아간다", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<MainTabBar />);
    await user.click(screen.getByText("설정"));
    // 뒤로가기 등으로 다른 경로로 이동이 완료된 상황
    pathname = "/ledger";
    rerender(<MainTabBar />);
    expect(screen.getByText("가계부").closest("a")).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("설정").closest("a")).not.toHaveAttribute("aria-current");
  });
  it("가계부 경로가 아닐 때 가계부 탭 클릭은 직전 경로를 저장한다", async () => {
    pathname = "/settings";
    const user = userEvent.setup();
    render(<MainTabBar />);
    await user.click(screen.getByText("가계부"));
    expect(useNavStore.getState().lastMainTabPath).toBe("/settings");
  });
  it("이미 가계부 경로면 가계부 탭 클릭이 복귀 지점을 덮어쓰지 않는다", async () => {
    pathname = "/ledger/analysis";
    useNavStore.setState({ lastMainTabPath: "/" });
    const user = userEvent.setup();
    render(<MainTabBar />);
    await user.click(screen.getByText("가계부"));
    expect(useNavStore.getState().lastMainTabPath).toBe("/");
  });
  it("중첩 섹션이 아닌 설정 탭 클릭은 복귀 지점을 바꾸지 않는다", async () => {
    pathname = "/";
    useNavStore.setState({ lastMainTabPath: "/plan" });
    const user = userEvent.setup();
    render(<MainTabBar />);
    await user.click(screen.getByText("설정"));
    expect(useNavStore.getState().lastMainTabPath).toBe("/plan");
  });
});
