import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

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
});
