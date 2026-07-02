import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AssetAllocationDonut, type AllocationItem } from "@/components/portfolio/AssetAllocationDonut";

const ITEMS: AllocationItem[] = [
  { key: "stocks", label: "주식", valueKrw: 6_000_000 },
  { key: "savings", label: "저축/현금성", valueKrw: 2_000_000 },
  { key: "pension", label: "연금", valueKrw: 2_000_000 },
  { key: "crypto", label: "코인", valueKrw: 0 }, // 0은 제외
];

describe("AssetAllocationDonut", () => {
  it("값이 있는 자산만 비중으로 보여준다", () => {
    render(<AssetAllocationDonut items={ITEMS} />);
    expect(screen.getByText("자산 비중")).toBeInTheDocument();
    expect(screen.getByText("주식")).toBeInTheDocument();
    expect(screen.getByText("60.0%")).toBeInTheDocument(); // 6,000,000 / 10,000,000
    // 저축·연금 각 20% (동일 값이 둘)
    expect(screen.getAllByText("20.0%").length).toBe(2);
    // 값 0인 코인은 범례에 없다
    expect(screen.queryByText("코인")).not.toBeInTheDocument();
    // 중앙 총 자산
    expect(screen.getByText("₩10,000,000")).toBeInTheDocument();
  });

  it("표시할 자산이 없으면 카드를 그리지 않는다", () => {
    const { container } = render(
      <AssetAllocationDonut items={[{ key: "stocks", label: "주식", valueKrw: 0 }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
