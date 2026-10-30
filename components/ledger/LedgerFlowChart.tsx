"use client";

import { MonthChartFrame } from "@/components/ledger/MonthChartFrame";
import { FLOW_COLORS } from "@/components/ledger/ledger-colors";
import { PLOT_BOTTOM, dotRadius, flowBars, linePoints, makeYScale, slotCenter } from "@/lib/ledger/chart-geometry";
import { formatMonthTitle } from "@/lib/ledger/month";

interface LedgerFlowChartProps {
  months: string[];
  income: number[];
  expense: number[];
  saving: number[];
}

// 범례 순서 = 그리는 순서(수입·저축 막대, 지출 선).
const LEGEND = [
  { key: "income", label: "수입", color: FLOW_COLORS.income, shape: "bar" },
  { key: "saving", label: "저축", color: FLOW_COLORS.saving, shape: "bar" },
  { key: "expense", label: "지출", color: FLOW_COLORS.expense, shape: "line" },
] as const;

/**
 * 수입·지출·저축 차트. 달마다 수입·저축 막대를 나란히, 지출은 점이 있는 선으로 겹친다.
 * 세 계열이 같은 0 기준 세로 스케일을 쓴다(축 눈금 없음 — 값은 말풍선으로 본다).
 */
export function LedgerFlowChart({ months, income, expense, saving }: LedgerFlowChartProps) {
  const n = months.length;
  const yAt = makeYScale([income, expense, saving]);
  const r = dotRadius(n);
  const summary = `수입·지출·저축 차트, ${formatMonthTitle(months[0])}부터 ${formatMonthTitle(months[n - 1])}까지`;

  return (
    <div className="flex flex-col gap-3">
      <MonthChartFrame
        months={months}
        summary={summary}
        tooltipRows={(i) => [
          { key: "income", label: "수입", color: FLOW_COLORS.income, value: income[i] },
          { key: "expense", label: "지출", color: FLOW_COLORS.expense, value: expense[i] },
          { key: "saving", label: "저축", color: FLOW_COLORS.saving, value: saving[i] },
        ]}
      >
        {months.map((m, i) => {
          const { incomeX, savingX, width } = flowBars(i, n);
          return (
            <g key={m}>
              {income[i] > 0 && (
                <rect x={incomeX} y={yAt(income[i])} width={width} height={PLOT_BOTTOM - yAt(income[i])} rx={1.5} fill={FLOW_COLORS.income} />
              )}
              {saving[i] > 0 && (
                <rect x={savingX} y={yAt(saving[i])} width={width} height={PLOT_BOTTOM - yAt(saving[i])} rx={1.5} fill={FLOW_COLORS.saving} />
              )}
            </g>
          );
        })}
        <polyline
          points={linePoints(expense, yAt)}
          fill="none"
          stroke={FLOW_COLORS.expense}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {expense.map((v, i) => (
          <circle key={months[i]} cx={slotCenter(i, n)} cy={yAt(v)} r={r} fill={FLOW_COLORS.expense} />
        ))}
      </MonthChartFrame>

      <ul aria-label="범례" className="flex items-center justify-center gap-4">
        {LEGEND.map((item) => (
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
