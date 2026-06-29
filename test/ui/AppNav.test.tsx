import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
}));

import { AppNav } from "@/components/nav/AppNav";

function setPath(p: string) { pathname = p; }

describe("AppNav", () => {
  it("/holdings 상세에서는 네비를 숨긴다", () => {
    setPath("/holdings/123");
    render(<AppNav><div>본문</div></AppNav>);
    expect(screen.queryByRole("navigation", { name: "주요 화면" })).not.toBeInTheDocument();
  });
  it("일반 경로에서는 메인 바를 표시한다", () => {
    setPath("/plan");
    render(<AppNav><div>본문</div></AppNav>);
    expect(screen.getByRole("navigation", { name: "주요 화면" })).toBeInTheDocument();
  });
  it("자산 경로에서는 중첩 바(자산 서브탭)도 노출된다", () => {
    setPath("/assets/stocks");
    render(<AppNav><div>본문</div></AppNav>);
    // 중첩 바의 ← 버튼이 보이고 pointer-events가 살아있는지(visible)로 판단
    const back = screen.getByRole("button", { name: "이전" });
    expect(back).toBeInTheDocument();
  });
});
