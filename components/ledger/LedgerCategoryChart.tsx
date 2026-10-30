"use client";

import { MonthChartFrame } from "@/components/ledger/MonthChartFrame";
import { dotRadius, linePoints, makeYScale, slotCenter } from "@/lib/ledger/chart-geometry";
import { formatMonthTitle } from "@/lib/ledger/month";

export interface LedgerCategoryLine {
  id: string;
  label: string;
  /** 슬롯 고정 색. */
  color: string;
  values: number[];
}

interface LedgerCategoryChartProps {
  months: string[];
  /** 고른 순서대로 1~4개. */
  lines: LedgerCategoryLine[];
}

/** 카테고리별 차트 — 고른 노드마다 슬롯 색 선 하나, 같은 0 기준 세로 스케일. */
export function LedgerCategoryChart({ months, lines }: LedgerCategoryChartProps) {
  const n = months.length;
  const yAt = makeYScale(lines.map((l) => l.values));
  const r = dotRadius(n);
  const names = lines.map((l) => l.label).join("·");
  const summary = `카테고리별 차트(${names}), ${formatMonthTitle(months[0])}부터 ${formatMonthTitle(months[n - 1])}까지`;

  return (
    <MonthChartFrame
      months={months}
      summary={summary}
      tooltipRows={(i) => lines.map((l) => ({ key: l.id, label: l.label, color: l.color, value: l.values[i] }))}
    >
      {lines.map((line) => (
        <g key={line.id}>
          <polyline
            data-ledger-line
            points={linePoints(line.values, yAt)}
            fill="none"
            stroke={line.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {line.values.map((v, i) => (
            <circle key={months[i]} cx={slotCenter(i, n)} cy={yAt(v)} r={r} fill={line.color} />
          ))}
        </g>
      ))}
    </MonthChartFrame>
  );
}
