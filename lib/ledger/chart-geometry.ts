/**
 * 가계부 분석 차트 좌표 계산(순수). viewBox 좌표계 기준이고 반응형은 svg width=100%로 처리한다.
 * jsdom에는 레이아웃 측정이 없으므로 누르기 영역·말풍선 위치도 viewBox 비율(%)로만 정한다.
 */

export const CHART_W = 320;
export const CHART_H = 180;
/** 좌우 여백 — 끝 달 라벨("'25.10")이 잘리지 않게. */
export const PAD_X = 16;
/** 그림 영역 위 끝(최댓값). */
export const PLOT_TOP = 16;
/** 그림 영역 바닥(0 기준선). */
export const PLOT_BOTTOM = 150;
/** 월 라벨 글자 기준선. */
export const LABEL_Y = 170;
/** 월 라벨 글자 크기(viewBox 단위) — 카드 안 차트 폭 288px 기준 약 12px로 보인다. */
export const LABEL_FONT_SIZE = 13;

/** 막대 폭 = min(BAR_MAX, 슬롯 폭 × BAR_RATIO), 수입·저축 막대 사이 간격 BAR_GAP. */
export const BAR_MAX = 10;
export const BAR_RATIO = 0.3;
export const BAR_GAP = 1;

/** 달 하나가 차지하는 가로 폭. */
export function slotWidth(n: number): number {
  if (n <= 0) {
    return 0;
  }
  return (CHART_W - PAD_X * 2) / n;
}

/** i번째 달 슬롯의 가운데 x. */
export function slotCenter(i: number, n: number): number {
  return PAD_X + slotWidth(n) * (i + 0.5);
}

export function barWidth(n: number): number {
  return Math.min(BAR_MAX, slotWidth(n) * BAR_RATIO);
}

/** 수입(왼쪽)·저축(오른쪽) 막대의 x와 폭. 슬롯 중심 양옆에 BAR_GAP만큼 띄운다. */
export function flowBars(i: number, n: number): { incomeX: number; savingX: number; width: number } {
  const cx = slotCenter(i, n);
  const width = barWidth(n);
  return { incomeX: cx - BAR_GAP / 2 - width, savingX: cx + BAR_GAP / 2, width };
}

/**
 * 여러 계열이 함께 쓰는 0 기준 세로 스케일. NaN·Infinity는 최댓값 계산에서 빼고,
 * 값은 [0, 최댓값]으로 잘라 그림 영역 밖으로 나가지 않게 한다. 값이 모두 0 이하면 바닥선에 붙는다.
 */
export function makeYScale(series: number[][]): (v: number) => number {
  const max = Math.max(0, ...series.flat().filter(Number.isFinite));
  return (v: number) => {
    if (max === 0 || !Number.isFinite(v)) {
      return PLOT_BOTTOM;
    }
    const clamped = Math.min(max, Math.max(0, v));
    return PLOT_BOTTOM - (clamped / max) * (PLOT_BOTTOM - PLOT_TOP);
  };
}

/** viewBox x → 달 인덱스(문지르기). 그림 영역 밖은 양 끝 달로 자르고, 계산할 수 없으면 -1. */
export function indexAtX(x: number, n: number): number {
  if (n <= 0 || !Number.isFinite(x)) {
    return -1;
  }
  const i = Math.floor((x - PAD_X) / slotWidth(n));
  return Math.min(n - 1, Math.max(0, i));
}

/** polyline points 문자열. */
export function linePoints(values: number[], yAt: (v: number) => number): string {
  return values.map((v, i) => `${slotCenter(i, values.length)},${yAt(v)}`).join(" ");
}

/** 점 반지름 — 최대 3, 달이 많아 슬롯이 좁으면 슬롯 폭 × 0.25로 줄인다. */
export function dotRadius(n: number): number {
  return Math.min(3, slotWidth(n) * 0.25);
}

/** 달 슬롯 전체(차트 높이 전부)를 덮는 투명 누르기 영역의 가로 위치(%). */
export function hitArea(i: number, n: number): { leftPct: number; widthPct: number } {
  const w = slotWidth(n);
  return { leftPct: ((PAD_X + w * i) / CHART_W) * 100, widthPct: (w / CHART_W) * 100 };
}

/**
 * 말풍선 위치. 기준점(달 중심)을 left %로 두고, 자기 폭의 shift %만큼 왼쪽으로 민다.
 * shift는 그림 영역 안 상대 위치(0~100) — 왼쪽 끝은 왼쪽 정렬, 오른쪽 끝은 오른쪽 정렬, 가운데는 가운데 정렬이라
 * 말풍선 폭과 무관하게 차트 좌우 밖으로 나가지 않는다.
 */
export function tooltipPlacement(cx: number): { leftPct: number; shiftPct: number } {
  const x = Math.min(CHART_W - PAD_X, Math.max(PAD_X, cx));
  const t = (x - PAD_X) / (CHART_W - PAD_X * 2);
  return { leftPct: (x / CHART_W) * 100, shiftPct: t * 100 };
}
