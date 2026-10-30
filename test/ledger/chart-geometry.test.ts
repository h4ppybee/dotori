import { describe, it, expect } from "vitest";
import {
  CHART_W,
  PAD_X,
  PLOT_BOTTOM,
  PLOT_TOP,
  BAR_GAP,
  barWidth,
  dotRadius,
  indexAtX,
  flowBars,
  hitArea,
  isHorizontalDrag,
  latestRecordedIndex,
  lineSegments,
  makeYScale,
  slotCenter,
  slotWidth,
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

  it("NaN·Infinity는 최댓값 계산에서 빼고, 값은 [0, 최댓값]으로 자른다", () => {
    const yAt = makeYScale([[100, Number.NaN, Number.POSITIVE_INFINITY, -50]]);
    expect(yAt(100)).toBe(PLOT_TOP);
    expect(yAt(-50)).toBe(PLOT_BOTTOM);
    expect(yAt(500)).toBe(PLOT_TOP);
    expect(yAt(Number.NaN)).toBe(PLOT_BOTTOM);
    expect(yAt(Number.POSITIVE_INFINITY)).toBe(PLOT_BOTTOM);
  });

  it("음수만 있으면 바닥선에 붙는다", () => {
    const yAt = makeYScale([[-10, -20]]);
    expect(yAt(-10)).toBe(PLOT_BOTTOM);
  });

  it("점 반지름은 최대 3, 슬롯이 좁으면 슬롯 폭 × 0.25", () => {
    expect(dotRadius(6)).toBe(3);
    expect(dotRadius(120)).toBeCloseTo(slotWidth(120) * 0.25);
  });

  it("viewBox x를 달 인덱스로 바꾸고, 그림 영역 밖은 양 끝 달로 자른다", () => {
    expect(indexAtX(slotCenter(4, 12), 12)).toBe(4);
    expect(indexAtX(0, 12)).toBe(0);
    expect(indexAtX(CHART_W, 12)).toBe(11);
    expect(indexAtX(Number.NaN, 12)).toBe(-1);
    expect(indexAtX(100, 0)).toBe(-1);
  });

  it("선은 null(기록 없는 달)에서 끊어 구간으로 나눈다 — 한 점뿐인 구간도 남긴다", () => {
    const values = [null, 10, 0, null, 5, null];
    const yAt = makeYScale([values]);
    const segs = lineSegments(values, yAt);
    expect(segs.map((seg) => seg.map((p) => p.index))).toEqual([[1, 2], [4]]);
    expect(segs[0][0]).toEqual({ index: 1, x: slotCenter(1, 6), y: PLOT_TOP });
    expect(segs[0][1].y).toBe(PLOT_BOTTOM);
    expect(lineSegments([null, null], yAt)).toEqual([]);
  });

  it("null은 스케일 계산에서 빠진다", () => {
    const yAt = makeYScale([[null, 200], [null]]);
    expect(yAt(200)).toBe(PLOT_TOP);
  });

  it("누르기 영역은 슬롯을 퍼센트로 덮는다", () => {
    const first = hitArea(0, 4);
    const last = hitArea(3, 4);
    expect(first.leftPct).toBeCloseTo((PAD_X / CHART_W) * 100);
    expect(last.leftPct + last.widthPct).toBeCloseTo(((CHART_W - PAD_X) / CHART_W) * 100);
  });

  it("터치 문지르기는 가로로 6px보다 많이, 세로보다 크게 움직였을 때만 시작한다", () => {
    expect(isHorizontalDrag(7, 0)).toBe(true);
    expect(isHorizontalDrag(-7, 3)).toBe(true);
    expect(isHorizontalDrag(6, 0)).toBe(false);
    expect(isHorizontalDrag(10, 12)).toBe(false);
  });

  it("기본 선택 달은 기록이 있는 가장 최근 달, 없으면 마지막 달", () => {
    expect(latestRecordedIndex([true, false, true, false])).toBe(2);
    expect(latestRecordedIndex([false, false])).toBe(1);
    expect(latestRecordedIndex([])).toBe(-1);
  });
});
