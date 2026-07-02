import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PnlText } from "@/components/ui/PnlText";

describe("PnlText", () => {
  it("수익이면 + 금액과 절댓값 수익률을 빨강으로 표기한다", () => {
    render(<PnlText amountKrw={100000} returnPct={10.02} />);
    const el = screen.getByText("+₩100,000 (10.02%)");
    expect(el).toHaveClass("text-up");
  });

  it("손실이면 - 금액과 절댓값 수익률을 파랑으로 표기한다", () => {
    render(<PnlText amountKrw={-50000} returnPct={-5} />);
    const el = screen.getByText("-₩50,000 (5.00%)");
    expect(el).toHaveClass("text-down");
  });

  it("보합(0)은 muted", () => {
    render(<PnlText amountKrw={0} returnPct={0} />);
    const el = screen.getByText("₩0 (0.00%)");
    expect(el).toHaveClass("text-muted");
  });
});
