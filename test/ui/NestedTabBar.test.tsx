import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
let pathname = "/assets/stocks";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));

import { NestedTabBar } from "@/components/nav/NestedTabBar";
import { assetSubTabs } from "@/lib/nav/nav-config";
import { useNavStore } from "@/stores/nav-store";

beforeEach(() => {
  push.mockClear();
  pathname = "/assets/stocks";
  useNavStore.setState({ lastMainTabPath: "/plan" });
});

describe("NestedTabBar", () => {
  it("주입된 서브탭들을 렌더한다", () => {
    render(<NestedTabBar visible tabs={assetSubTabs} activeKey="stocks" />);
    ["자산", "주식", "저축", "연금", "코인"].forEach((t) =>
      expect(screen.getByText(t)).toBeInTheDocument()
    );
  });
  it("← 버튼은 lastMainTabPath로 push한다", async () => {
    const user = userEvent.setup();
    render(<NestedTabBar visible tabs={assetSubTabs} activeKey="stocks" />);
    await user.click(screen.getByRole("button", { name: "이전" }));
    expect(push).toHaveBeenCalledWith("/plan");
  });
  it("서브탭을 누르면 경로가 바뀌기 전에도 활성 표시가 즉시 옮겨간다(activeKey prop보다 우선)", async () => {
    const user = userEvent.setup();
    render(<NestedTabBar visible tabs={assetSubTabs} activeKey="stocks" />);
    await user.click(screen.getByText("연금"));
    expect(screen.getByText("연금").closest("a")).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("주식").closest("a")).not.toHaveAttribute("aria-current");
  });
});
