import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SnapshotTrendChart } from "@/components/snapshot/SnapshotTrendChart";

const snap = (id: string, createdAt: number, netWorthKrw: number) => ({ id, createdAt, netWorthKrw });

describe("SnapshotTrendChart", () => {
  it("스냅샷 2개 미만이면 렌더하지 않는다", () => {
    const { container } = render(<SnapshotTrendChart snapshotsDesc={[snap("a", 1, 100)]} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("선(polyline)과 변화량 막대(rect)를 그린다 — 첫 기록·변화량 0은 막대 없음", () => {
    const { container } = render(
      <SnapshotTrendChart
        snapshotsDesc={[snap("c", 3, 130), snap("b", 2, 100), snap("a", 1, 100)]}
      />,
    );
    expect(container.querySelector("polyline")).not.toBeNull();
    expect(container.querySelectorAll("circle")).toHaveLength(3); // 포인트 마커
    // a: 첫 기록(null), b: delta 0 → 막대 없음. c: +30 → 막대 1개(up 색)
    const bars = container.querySelectorAll("rect[data-trend-bar]");
    expect(bars).toHaveLength(1);
    expect(bars[0].getAttribute("fill")).toBe("#F04452");
  });
});
