"use client";

import { MonthChartFrame } from "@/components/ledger/MonthChartFrame";
import { SeriesLine } from "@/components/ledger/SeriesLine";
import { dotRadius, makeYScale } from "@/lib/ledger/chart-geometry";
import type { SeriesValue } from "@/lib/ledger/ledger-service";
import { formatMonthTitle } from "@/lib/ledger/month";

export interface LedgerCategoryLine {
  id: string;
  label: string;
  /** 슬롯 고정 색. */
  color: string;
  /** null = 기록 없는 달(선을 끊는다). 기록한 달에 그 카테고리가 0이면 0. */
  values: SeriesValue[];
}

interface LedgerCategoryChartProps {
  months: string[];
  /** 고른 순서대로 1~4개. */
  lines: LedgerCategoryLine[];
}

/** 카테고리별 차트 — 고른 노드마다 슬롯 색 선 하나, 같은 0 기준 세로 스케일. 아래 범례로 어떤 선인지 보인다. */
export function LedgerCategoryChart({ months, lines }: LedgerCategoryChartProps) {
  const n = months.length;
  const yAt = makeYScale(lines.map((l) => l.values));
  const r = dotRadius(n);
  const names = lines.map((l) => l.label).join("·");
  const summary = `카테고리별 차트(${names}), ${formatMonthTitle(months[0])}부터 ${formatMonthTitle(months[n - 1])}까지`;
  // 기록 여부는 노드와 무관하게 달마다 같다(기록 없는 달은 모든 노드가 null).
  const recorded = months.map((_, i) => lines.some((l) => l.values[i] !== null));

  return (
    <div className="flex flex-col gap-3">
      <MonthChartFrame
        months={months}
        recorded={recorded}
        summary={summary}
        detailRows={(i) => lines.map((l) => ({ key: l.id, label: l.label, color: l.color, value: l.values[i] ?? null }))}
        detailColumns={2}
        detailReservedRows={2}
      >
        {lines.map((line) => (
          <g key={line.id} data-ledger-line={line.id}>
            <SeriesLine values={line.values} yAt={yAt} color={line.color} r={r} />
          </g>
        ))}
      </MonthChartFrame>

      <ul aria-label="범례" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        {lines.map((line) => (
          <li key={line.id} className="flex items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold leading-[1.4] text-body-soft">
            <span data-legend-swatch aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ backgroundColor: line.color }} />
            {line.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
