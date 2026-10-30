import { describe, it, expect } from "vitest";
import {
  CHART_W,
  PAD_X,
  PLOT_BOTTOM,
  PLOT_TOP,
  BAR_GAP,
  barWidth,
  flowBars,
  hitArea,
  linePoints,
  makeYScale,
  slotCenter,
  slotWidth,
  tooltipPlacement,
} from "@/lib/ledger/chart-geometry";

describe("가계부 차트 geometry", () => {
  it("슬롯은 좌우 여백을 뺀 폭을 달 수로 나누고, 중심은 슬롯 가운데다", () => {
    expect(slotWidth(12)).toBeCloseTo((CHART_W - PAD_X * 2) / 12);
    expect(slotCenter(0, 12)).toBeCloseTo(PAD_X + slotWidth(12) / 2);
    expect(slotCenter(11, 12)).toBeCloseTo(CHART_W - PAD_X - slotWidth(12) / 2);
    expect(slotWidth(0)).toBe(0);
  });

  it("막대 폭은 min(10, 슬롯 폭 × 0.3)이다", () => {
    expect(barWidth(12)).toBeCloseTo(slotWidth(12) * 0.3);
    expect(barWidth(6)).toBe(10);
  });

  it("수입·저축 막대는 슬롯 중심 양옆에 1px 간격으로 나란히 놓인다", () => {
    const { incomeX, savingX, width } = flowBars(3, 12);
    const cx = slotCenter(3, 12);
    expect(incomeX + width).toBeCloseTo(cx - BAR_GAP / 2);
    expect(savingX).toBeCloseTo(cx + BAR_GAP / 2);
    expect(savingX - (incomeX + width)).toBeCloseTo(BAR_GAP);
  });

  it("세로 스케일은 0 기준 — 0은 바닥, 최댓값은 위 끝", () => {
    const yAt = makeYScale([[100, 400], [200]]);
    expect(yAt(0)).toBe(PLOT_BOTTOM);
    expect(yAt(400)).toBe(PLOT_TOP);
    expect(yAt(200)).toBeCloseTo((PLOT_BOTTOM + PLOT_TOP) / 2);
  });

  it("값이 모두 0이면 바닥선에 붙는다", () => {
    const yAt = makeYScale([[0, 0]]);
    expect(yAt(0)).toBe(PLOT_BOTTOM);
  });

  it("선 좌표는 슬롯 중심과 스케일로 만든다", () => {
    const yAt = makeYScale([[0, 10]]);
    expect(linePoints([0, 10], yAt)).toBe(`${slotCenter(0, 2)},${PLOT_BOTTOM} ${slotCenter(1, 2)},${PLOT_TOP}`);
  });

  it("누르기 영역은 슬롯을 퍼센트로 덮는다", () => {
    const first = hitArea(0, 4);
    const last = hitArea(3, 4);
    expect(first.leftPct).toBeCloseTo((PAD_X / CHART_W) * 100);
    expect(last.leftPct + last.widthPct).toBeCloseTo(((CHART_W - PAD_X) / CHART_W) * 100);
  });

  it("말풍선은 왼쪽 끝이면 왼쪽 정렬, 오른쪽 끝이면 오른쪽 정렬, 가운데면 가운데 정렬로 잘리지 않는다", () => {
    expect(tooltipPlacement(PAD_X)).toEqual({ leftPct: (PAD_X / CHART_W) * 100, shiftPct: 0 });
    expect(tooltipPlacement(CHART_W - PAD_X).shiftPct).toBe(100);
    expect(tooltipPlacement(CHART_W / 2).shiftPct).toBeCloseTo(50);
    // viewBox 밖 값도 0~100으로 자른다.
    expect(tooltipPlacement(-10).shiftPct).toBe(0);
    expect(tooltipPlacement(CHART_W + 10).shiftPct).toBe(100);
  });
});
