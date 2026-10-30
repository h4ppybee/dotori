"use client";

import { useState, type ReactNode } from "react";
import { ChartTooltip, type ChartTooltipRow } from "@/components/ledger/ChartTooltip";
import { GRID_COLOR, LABEL_COLOR } from "@/components/ledger/ledger-colors";
import {
  CHART_H,
  CHART_W,
  LABEL_Y,
  PAD_X,
  PLOT_BOTTOM,
  PLOT_TOP,
  hitArea,
  slotCenter,
  slotWidth,
} from "@/lib/ledger/chart-geometry";
import { axisLabels } from "@/lib/ledger/ledger-service";
import { formatMonthTitle } from "@/lib/ledger/month";

interface MonthChartFrameProps {
  /** 연속 월 축("YYYY-MM", 오름차순). */
  months: string[];
  /** 차트 요약(스크린리더). 금액은 넣지 않는다 — 금액 숨기기와 무관하게 읽히므로. */
  summary: string;
  /** 0 기준선 위에 그릴 계열(막대·선). */
  children: ReactNode;
  /** 고른 달의 말풍선 행. */
  tooltipRows: (index: number) => ChartTooltipRow[];
}

/**
 * 가계부 월 차트 공용 틀 — 0 기준선·고른 달 강조·월 라벨·달별 누르기 영역·말풍선.
 * 누르기 영역은 SVG 위에 겹친 투명 버튼(슬롯 폭 × 차트 전체 높이)이라 막대·점이 작아도 그 달을 누를 수 있다.
 * 같은 달을 다시 누르면 말풍선을 닫는다.
 */
export function MonthChartFrame({ months, summary, children, tooltipRows }: MonthChartFrameProps) {
  const [activeMonth, setActiveMonth] = useState<string | null>(null);
  const n = months.length;
  // 기간을 바꿔 고른 달이 축 밖으로 나가면 말풍선은 자연히 사라진다.
  const active = activeMonth == null ? -1 : months.indexOf(activeMonth);
  const slot = slotWidth(n);

  return (
    <div className="relative">
      <div role="img" aria-label={summary}>
        <svg width="100%" viewBox={`0 0 ${CHART_W} ${CHART_H}`} aria-hidden="true" className="block">
          {active >= 0 && (
            <rect
              x={slotCenter(active, n) - slot / 2}
              y={PLOT_TOP - 8}
              width={slot}
              height={PLOT_BOTTOM - PLOT_TOP + 8}
              rx={4}
              fill={GRID_COLOR}
            />
          )}
          <line x1={PAD_X} y1={PLOT_BOTTOM} x2={CHART_W - PAD_X} y2={PLOT_BOTTOM} stroke={GRID_COLOR} strokeWidth={1} />
          {children}
          {axisLabels(months).map(({ index, text }) => (
            <text
              key={index}
              x={slotCenter(index, n)}
              y={LABEL_Y}
              textAnchor="middle"
              fontSize={11}
              fill={LABEL_COLOR}
              className="tabular-nums"
            >
              {text}
            </text>
          ))}
        </svg>
      </div>

      {months.map((m, i) => {
        const { leftPct, widthPct } = hitArea(i, n);
        return (
          <button
            key={m}
            type="button"
            aria-label={formatMonthTitle(m)}
            aria-pressed={i === active}
            onClick={() => setActiveMonth(i === active ? null : m)}
            className="absolute inset-y-0 cursor-pointer rounded-[4px] focus-visible:outline-2 focus-visible:outline-primary"
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
          />
        );
      })}

      {active >= 0 && (
        <ChartTooltip title={formatMonthTitle(months[active])} anchorX={slotCenter(active, n)} rows={tooltipRows(active)} />
      )}
    </div>
  );
}
