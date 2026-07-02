import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NetWorthDonut } from "@/components/portfolio/NetWorthDonut";

describe("NetWorthDonut", () => {
  it("순자산과 부채 비중을 보여준다", () => {
    // 자산 10,000,000 · 부채 2,000,000 → 순자산 80% / 부채 20%
    render(<NetWorthDonut totalAssets={10_000_000} debt={2_000_000} />);
    expect(screen.getByText("순자산 비중")).toBeInTheDocument();
    expect(screen.getByText("부채")).toBeInTheDocument();
    expect(screen.getByText("80.0%")).toBeInTheDocument();
    expect(screen.getByText("20.0%")).toBeInTheDocument();
    // 순자산 금액 8,000,000(가운데 + 범례 양쪽에 나타남)
    expect(screen.getAllByText("₩8,000,000").length).toBeGreaterThanOrEqual(1);
  });

  it("부채가 없으면 순자산 100% 한 조각으로 보여준다", () => {
    render(<NetWorthDonut totalAssets={10_000_000} debt={0} />);
    expect(screen.getByText("순자산 비중")).toBeInTheDocument();
    expect(screen.getByText("100.0%")).toBeInTheDocument();
    // 부채 조각·범례는 없다
    expect(screen.queryByText("부채")).not.toBeInTheDocument();
  });

  it("자산이 없으면 카드를 그리지 않는다", () => {
    const { container } = render(<NetWorthDonut totalAssets={0} debt={500} />);
    expect(container).toBeEmptyDOMElement();
  });
});
