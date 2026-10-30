/**
 * 가계부 분석 차트 좌표 계산(순수). viewBox 좌표계 기준이고 반응형은 svg width=100%로 처리한다.
 * jsdom에는 레이아웃 측정이 없으므로 달 버튼 위치도 viewBox 비율(%)로만 정한다.
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
export function makeYScale(series: (number | null)[][]): (v: number) => number {
  const max = Math.max(0, ...series.flat().filter((v): v is number => Number.isFinite(v)));
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

export interface LinePoint {
  index: number;
  x: number;
  y: number;
}

/**
 * 선 구간. null(기록 없는 달)에서 끊어 이어진 점끼리 묶는다.
 * 한 점뿐인 구간도 남긴다(점은 그리고 선은 그리지 않는다).
 */
export function lineSegments(values: (number | null)[], yAt: (v: number) => number): LinePoint[][] {
  const out: LinePoint[][] = [];
  let current: LinePoint[] = [];
  values.forEach((v, index) => {
    if (v === null) {
      if (current.length > 0) {
        out.push(current);
      }
      current = [];
      return;
    }
    current.push({ index, x: slotCenter(index, values.length), y: yAt(v) });
  });
  if (current.length > 0) {
    out.push(current);
  }
  return out;
}

/** 터치 문지르기 시작 기준(px). */
export const SCRUB_THRESHOLD = 6;

/** 터치가 문지르기인지 — 가로로 기준보다 많이, 세로보다 크게 움직였을 때만(세로 스크롤과 구분). */
export function isHorizontalDrag(dx: number, dy: number): boolean {
  return Math.abs(dx) > SCRUB_THRESHOLD && Math.abs(dx) > Math.abs(dy);
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

/** 기본으로 고를 달 — 기록이 있는 가장 최근 달. 기록이 하나도 없으면 마지막 달(축이 비면 -1). */
export function latestRecordedIndex(recorded: boolean[]): number {
  const last = recorded.lastIndexOf(true);
  return last >= 0 ? last : recorded.length - 1;
}
