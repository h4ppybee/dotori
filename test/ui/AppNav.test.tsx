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
    setPath("/settings");
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
  it("계획 경로에서도 중첩 바(계획 서브탭)가 노출된다", () => {
    setPath("/plan");
    render(<AppNav><div>본문</div></AppNav>);
    // 계획 서브탭이 뜨고, 메인 바는 숨겨진다(중첩 경로)
    expect(screen.getByText("통장 쪼개기")).toBeInTheDocument();
    expect(screen.getByText("부동산")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "주요 화면" })).not.toBeInTheDocument();
  });
  it("가계부 경로에서는 가계부 서브탭만 뜨고 자산 서브탭은 없다", () => {
    setPath("/ledger");
    render(<AppNav><div>본문</div></AppNav>);
    expect(screen.getByText("월별")).toBeInTheDocument();
    expect(screen.getByText("분석")).toBeInTheDocument();
    expect(screen.queryByText("주식")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "주요 화면" })).not.toBeInTheDocument();
  });
  it("/ledger/analysis 에서는 분석 서브탭이 활성이다", () => {
    setPath("/ledger/analysis");
    render(<AppNav><div>본문</div></AppNav>);
    expect(screen.getByText("분석").closest("a")).toHaveAttribute("aria-current", "page");
  });
  it("가계부에서 메인 경로로 나가도 접히는 동안 가계부 서브탭을 유지한다", () => {
    setPath("/ledger");
    const { rerender } = render(<AppNav><div>본문</div></AppNav>);
    expect(screen.queryByText("주식")).not.toBeInTheDocument();
    setPath("/");
    rerender(<AppNav><div>본문</div></AppNav>);
    expect(screen.getByText("월별")).toBeInTheDocument();
    expect(screen.queryByText("주식")).not.toBeInTheDocument();
  });
});
