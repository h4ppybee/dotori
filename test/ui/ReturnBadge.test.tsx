import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReturnBadge } from "@/components/ui/ReturnBadge";

describe("ReturnBadge", () => {
  it("양수 수익률에 + 부호를 표시한다", () => {
    render(<ReturnBadge value={2.5} />);
    expect(screen.getByText("+2.50%")).toBeInTheDocument();
  });

  it("양수 수익률에 up(빨강) 클래스를 적용한다", () => {
    render(<ReturnBadge value={2.5} />);
    const badge = screen.getByText("+2.50%");
    expect(badge).toHaveClass("text-up");
    expect(badge).toHaveClass("bg-up-surface");
  });

  it("음수 수익률에 - 부호를 표시한다", () => {
    render(<ReturnBadge value={-1.3} />);
    expect(screen.getByText("-1.30%")).toBeInTheDocument();
  });

  it("음수 수익률에 down(파랑) 클래스를 적용한다", () => {
    render(<ReturnBadge value={-1.3} />);
    const badge = screen.getByText("-1.30%");
    expect(badge).toHaveClass("text-down");
    expect(badge).toHaveClass("bg-down-surface");
  });

  it("0에 flat(grey) 클래스를 적용한다", () => {
    render(<ReturnBadge value={0} />);
    const badge = screen.getByText("+0.00%");
    expect(badge).toHaveClass("text-muted");
  });

  it("tabular-nums 클래스가 있다", () => {
    render(<ReturnBadge value={5} />);
    const badge = screen.getByText("+5.00%");
    expect(badge).toHaveClass("tabular-nums");
  });
});
