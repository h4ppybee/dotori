/**
 * 가계부 순수 계산. DB·비동기·Date 없이 입력만으로 결과를 낸다.
 * 합계는 현재 트리의 잎만 더한다 — 알 수 없는 ID(과거 버전 데이터 등)는 보존되지만 무시한다.
 */
import {
  CARRY_OVER_ROOTS,
  LEAF_IDS,
  allNodesInOrder,
  leavesUnder,
} from "@/lib/ledger/categories";
import { addMonths, isValidMonth, monthRange } from "@/lib/ledger/month";

type Amounts = Record<string, number>;

/** 시계열 계산에 필요한 한 달 행의 최소 형태(LedgerMonth와 호환). */
export interface LedgerMonthAmounts {
  id: string;
  amounts: Amounts;
}

export type LedgerRange = 6 | 12 | "all";

/** 노드 아래 잎 합계. 없는 노드는 0. */
export function sumNode(amounts: Amounts, nodeId: string): number {
  return leavesUnder(nodeId).reduce((sum, id) => sum + (amounts[id] ?? 0), 0);
}

/** 현재 잎 중 0보다 큰 값이 하나라도 있는지(메모만 있는 달·알 수 없는 키만 있는 달은 false). */
export function hasLedgerAmounts(amounts: Amounts): boolean {
  return LEAF_IDS.some((id) => (amounts[id] ?? 0) > 0);
}

export interface LedgerMonthView {
  income: number;
  expense: number;
  saving: number;
  /** 수입 − 지출 − 저축. 음수 가능. 손익이 아니므로 up/down 색을 쓰지 않는다. */
  remaining: number;
  /** 모든 노드(잎 포함)의 합계. */
  nodes: Map<string, number>;
}

export function buildMonthView(amounts: Amounts): LedgerMonthView {
  const nodes = new Map(allNodesInOrder().map((n) => [n.id, sumNode(amounts, n.id)]));
  const income = nodes.get("income") ?? 0;
  const expense = nodes.get("expense") ?? 0;
  const saving = nodes.get("saving") ?? 0;
  return { income, expense, saving, remaining: income - expense - saving, nodes };
}

export interface LedgerSeries {
  /** 연속 월 축("YYYY-MM", 오름차순). */
  months: string[];
  income: number[];
  expense: number[];
  saving: number[];
  /** 요청한 노드별 월 합계. */
  byNode: Record<string, number[]>;
  /** 축 안에서 금액이 있는 달 수(2 미만이면 차트 대신 안내). */
  monthsWithData: number;
}

/** "all" 축의 최대 길이(10년). 끝 달에서 거슬러 올라가며 자른다. */
export const MAX_ALL_MONTHS = 120;

/**
 * endMonth에서 거슬러 올라가는 연속 월 시계열. 빈 달은 0.
 * "all"은 금액이 있는 가장 오래된 달부터이고, 그 달이 6개월보다 최근(또는 기록 없음)이면 6개월 축을 쓴다.
 * "all"도 끝 달 기준 최대 120개월까지만 그린다.
 */
export function buildSeries(
  rows: LedgerMonthAmounts[],
  { endMonth, range, nodeIds }: { endMonth: string; range: LedgerRange; nodeIds: string[] },
): LedgerSeries {
  const byMonth = new Map(rows.map((r) => [r.id, r.amounts]));
  const sixStart = addMonths(endMonth, -5);
  let start: string;
  if (range === "all") {
    const oldest = rows
      .filter((r) => isValidMonth(r.id) && hasLedgerAmounts(r.amounts))
      .map((r) => r.id)
      .sort()[0];
    const allStart = addMonths(endMonth, -(MAX_ALL_MONTHS - 1));
    start = oldest != null && oldest < sixStart ? oldest : sixStart;
    if (start < allStart) {
      start = allStart;
    }
  } else {
    start = addMonths(endMonth, -(range - 1));
  }

  const months = monthRange(start, endMonth);
  const amountsAt = months.map((m) => byMonth.get(m) ?? {});
  const byNode: Record<string, number[]> = {};
  nodeIds.forEach((id) => {
    byNode[id] = amountsAt.map((a) => sumNode(a, id));
  });
  return {
    months,
    income: amountsAt.map((a) => sumNode(a, "income")),
    expense: amountsAt.map((a) => sumNode(a, "expense")),
    saving: amountsAt.map((a) => sumNode(a, "saving")),
    byNode,
    monthsWithData: amountsAt.filter(hasLedgerAmounts).length,
  };
}

const CARRY_OVER_LEAVES = CARRY_OVER_ROOTS.flatMap((root) => leavesUnder(root));

/** 바로 전 달에서 수입·고정지출·저축 잎(0보다 큰 값)만 복사한 새 amounts. */
export function carryOverFromPrevious(prev: Amounts): Amounts {
  const out: Amounts = {};
  CARRY_OVER_LEAVES.forEach((id) => {
    const v = prev[id] ?? 0;
    if (v > 0) {
      out[id] = v;
    }
  });
  return out;
}

/** 이번 달 금액이 하나도 없고, 바로 전 달의 가져오기 대상 잎에 값이 있을 때 true. */
export function canCarryOver(current: Amounts, prev: Amounts | undefined): boolean {
  if (!prev) {
    return false;
  }
  if (hasLedgerAmounts(current)) {
    return false;
  }
  return Object.keys(carryOverFromPrevious(prev)).length > 0;
}

const MAX_AXIS_LABELS = 6;

/**
 * 차트 월 라벨. 최대 6개, step = ceil(n/6)으로 건너뛰되 끝 달 기준으로 맞춰 마지막 달은 항상 표시한다.
 * 축이 해를 넘으면 첫 라벨과, 직전 라벨과 해가 달라진 라벨에 연도를 붙인다("'25.10") — 1월이 라벨에서
 * 빠져도 해가 바뀐 것이 보인다. 나머지는 "10월".
 */
export function axisLabels(months: string[]): { index: number; text: string }[] {
  const n = months.length;
  if (n === 0) {
    return [];
  }
  const step = Math.ceil(n / MAX_AXIS_LABELS);
  const indices: number[] = [];
  for (let i = n - 1; i >= 0; i -= step) {
    indices.unshift(i);
  }
  const crossesYear = months[0].slice(0, 4) !== months[n - 1].slice(0, 4);
  let prevYear: string | null = null;
  return indices.map((index) => {
    const [y, m] = months[index].split("-");
    const month = Number(m);
    const yearChanged = y !== prevYear;
    prevYear = y;
    if (crossesYear && yearChanged) {
      return { index, text: `'${y.slice(2)}.${month}` };
    }
    return { index, text: `${month}월` };
  });
}
