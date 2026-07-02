import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PinDots } from "@/components/ui/PinDots";

describe("PinDots", () => {
  it("length만큼 점을 렌더링하고 filled만큼 채운다", () => {
    render(<PinDots length={6} filled={2} />);
    const status = screen.getByRole("status");
    const dots = status.querySelectorAll("[data-filled]");
    expect(dots).toHaveLength(6);
    const filledDots = status.querySelectorAll('[data-filled="true"]');
    expect(filledDots).toHaveLength(2);
  });

  it("입력 진행 상황을 aria-label로 알린다", () => {
    render(<PinDots length={6} filled={3} />);
    expect(
      screen.getByRole("status", { name: "6자리 중 3자리 입력" }),
    ).toBeInTheDocument();
  });

  it("채워진 점은 브랜드 색(bg-primary), 빈 점은 중립 색을 쓴다", () => {
    render(<PinDots length={6} filled={1} />);
    const status = screen.getByRole("status");
    const dots = status.querySelectorAll("[data-filled]");
    expect(dots[0]).toHaveClass("bg-primary");
    expect(dots[1]).toHaveClass("bg-surface-strong");
  });
});
