"use client";

import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import { LEDGER_REVEAL_LABEL } from "@/components/ledger/ledger-constants";
import { formatKrw } from "@/lib/format";
import { tooltipPlacement } from "@/lib/ledger/chart-geometry";

export interface ChartTooltipRow {
  key: string;
  label: string;
  color: string;
  value: number;
}

interface ChartTooltipProps {
  /** 고른 달 버튼의 aria-describedby가 가리키는 id. */
  id: string;
  /** 말풍선 제목(예: "2026년 10월"). */
  title: string;
  /** 기준점(달 중심)의 viewBox x. */
  anchorX: number;
  rows: ChartTooltipRow[];
}

/**
 * 차트 말풍선 — 고른 달의 계열별 금액. 차트 틀 바로 위(그림 영역 밖, `bottom-full` + 8px)에 떠서 막대·선을 가리지 않는다.
 * 가로 위치는 viewBox 비율로만 정해 좌우 끝에서 잘리지 않게 안쪽으로 맞춘다.
 * 금액 숨기기가 켜져 있으면 값을 가린다(차트 모양은 그대로).
 */
export function ChartTooltip({ id, title, anchorX, rows }: ChartTooltipProps) {
  const { leftPct, shiftPct } = tooltipPlacement(anchorX);
  return (
    <div
      id={id}
      role="tooltip"
      className="absolute bottom-full z-20 mb-2 flex min-w-[136px] flex-col gap-1 rounded-[12px] bg-surface-card px-3 py-2 shadow-floating"
      style={{ left: `${leftPct}%`, transform: `translateX(-${shiftPct}%)` }}
    >
      <span className="text-[12px] font-semibold leading-[1.4] text-muted">{title}</span>
      <dl className="flex flex-col gap-0.5">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-1.5 text-[13px] font-normal leading-[1.45] text-body">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} aria-hidden="true" />
              {row.label}
            </dt>
            <dd>
              <PrivacyAmount revealLabel={LEDGER_REVEAL_LABEL}>
                <span className="text-[13px] font-semibold leading-[1.45] tabular-nums text-ink">
                  {formatKrw(row.value)}
                </span>
              </PrivacyAmount>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
