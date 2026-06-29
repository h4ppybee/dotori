import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
let pathname = "/assets/stocks";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));

import { AssetSubTabBar } from "@/components/nav/AssetSubTabBar";
import { useNavStore } from "@/stores/nav-store";

beforeEach(() => {
  push.mockClear();
  pathname = "/assets/stocks";
  useNavStore.setState({ lastMainTabPath: "/plan" });
});

describe("AssetSubTabBar", () => {
  it("자산 서브탭들을 렌더한다", () => {
    render(<AssetSubTabBar visible />);
    ["자산", "주식", "저축", "연금", "코인"].forEach((t) =>
      expect(screen.getByText(t)).toBeInTheDocument()
    );
  });
  it("← 버튼은 lastMainTabPath로 push한다", async () => {
    const user = userEvent.setup();
    render(<AssetSubTabBar visible />);
    await user.click(screen.getByRole("button", { name: "이전" }));
    expect(push).toHaveBeenCalledWith("/plan");
  });
});
