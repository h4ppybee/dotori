"use client";

import { MonthChartFrame } from "@/components/ledger/MonthChartFrame";
import { SeriesLine } from "@/components/ledger/SeriesLine";
import { FLOW_COLORS } from "@/components/ledger/ledger-constants";
import { PLOT_BOTTOM, dotRadius, flowBars, makeYScale } from "@/lib/ledger/chart-geometry";
import type { SeriesValue } from "@/lib/ledger/ledger-service";
import { formatMonthTitle } from "@/lib/ledger/month";

interface LedgerFlowChartProps {
  months: string[];
  /** null = 기록 없는 달. */
  income: SeriesValue[];
  expense: SeriesValue[];
  saving: SeriesValue[];
}

// 계열 순서는 범례·상세 모두 수입·지출·저축으로 통일한다(요약 카드와 같은 순서).
const SERIES = [
  { key: "income", label: "수입", color: FLOW_COLORS.income, shape: "bar" },
  { key: "expense", label: "지출", color: FLOW_COLORS.expense, shape: "line" },
  { key: "saving", label: "저축", color: FLOW_COLORS.saving, shape: "bar" },
] as const;

/**
 * 수입·지출·저축 차트. 달마다 수입·저축 막대를 나란히, 지출은 점이 있는 선으로 겹친다.
 * 세 계열이 같은 0 기준 세로 스케일을 쓴다(축 눈금 없음 — 값은 위 상세 줄로 본다).
 * 기록 없는 달은 막대를 그리지 않고 지출 선을 끊는다.
 */
export function LedgerFlowChart({ months, income, expense, saving }: LedgerFlowChartProps) {
  const n = months.length;
  const yAt = makeYScale([income, expense, saving]);
  const values = { income, expense, saving };
  const summary = `수입·지출·저축 차트, ${formatMonthTitle(months[0])}부터 ${formatMonthTitle(months[n - 1])}까지`;

  function bar(kind: "income" | "saving", i: number, x: number, width: number) {
    const v = values[kind][i];
    if (v === null || v <= 0) {
      return null;
    }
    const y = yAt(v);
    return <rect data-flow-bar={kind} x={x} y={y} width={width} height={PLOT_BOTTOM - y} rx={1.5} fill={FLOW_COLORS[kind]} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <MonthChartFrame
        months={months}
        recorded={income.map((v) => v !== null)}
        summary={summary}
        detailRows={(i) => SERIES.map((s) => ({ key: s.key, label: s.label, color: s.color, value: values[s.key][i] }))}
        detailColumns={3}
        detailReservedRows={1}
      >
        {months.map((m, i) => {
          const { incomeX, savingX, width } = flowBars(i, n);
          return (
            <g key={m}>
              {bar("income", i, incomeX, width)}
              {bar("saving", i, savingX, width)}
            </g>
          );
        })}
        <g data-flow-expense>
          <SeriesLine values={expense} yAt={yAt} color={FLOW_COLORS.expense} r={dotRadius(n)} />
        </g>
      </MonthChartFrame>

      <ul aria-label="범례" className="flex items-center justify-center gap-4">
        {SERIES.map((item) => (
          <li key={item.key} className="flex items-center gap-1.5 text-[12px] font-semibold leading-[1.4] text-body-soft">
            <span
              aria-hidden="true"
              className={item.shape === "bar" ? "h-2.5 w-2.5 rounded-[2px]" : "h-0.5 w-3 rounded-full"}
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
