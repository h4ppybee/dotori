"use client";

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { ChartDetail, type ChartDetailRow } from "@/components/ledger/ChartDetail";
import { GRID_COLOR, LABEL_COLOR } from "@/components/ledger/ledger-constants";
import {
  CHART_H,
  CHART_W,
  LABEL_FONT_SIZE,
  LABEL_Y,
  PAD_X,
  PLOT_BOTTOM,
  PLOT_TOP,
  SCRUB_THRESHOLD,
  hitArea,
  indexAtX,
  isHorizontalDrag,
  latestRecordedIndex,
  slotCenter,
  slotWidth,
} from "@/lib/ledger/chart-geometry";
import { axisLabels } from "@/lib/ledger/ledger-service";
import { formatMonthTitle } from "@/lib/ledger/month";

interface MonthChartFrameProps {
  /** 연속 월 축("YYYY-MM", 오름차순). */
  months: string[];
  /** 달마다 기록이 있는지 — 기본 선택(기록이 있는 가장 최근 달)에 쓴다. */
  recorded: boolean[];
  /** 차트 요약(스크린리더). 금액은 넣지 않는다 — 금액 숨기기와 무관하게 읽히므로. */
  summary: string;
  /** 0 기준선 위에 그릴 계열(막대·선). */
  children: ReactNode;
  /** 고른 달의 상세 행. */
  detailRows: (index: number) => ChartDetailRow[];
  detailColumns: 2 | 3;
  detailReservedRows: 1 | 2;
}

/** 진행 중인 누르기·문지르기. */
interface Drag {
  pointerId: number;
  touch: boolean;
  startX: number;
  startY: number;
  /** 누르기 전 선택(터치 취소 시 되돌린다). */
  prevMonth: string | null;
  scrubbing: boolean;
}

/**
 * 가계부 월 차트 공용 틀 — 고른 달 상세 줄 + 0 기준선·고른 달 강조·월 라벨·문지르기·달 버튼.
 * - 선택은 늘 하나다. 기본은 기록이 있는 가장 최근 달이고, 닫히지 않는다(같은 달을 다시 눌러도 유지).
 * - 포인터: 차트 전체를 덮는 오버레이 하나가 누른 위치(clientX → viewBox x → 달)를 고른다. 달이 많아 슬롯이 몇 px여도 고를 수 있다.
 *   마우스·펜은 누르는 즉시 고르고 누른 채 움직이면 따라간다. 터치는 누르는 순간 고르지 않는다 — 거의 움직이지 않고 떼면(탭) 그 달,
 *   가로로 6px 넘게(세로보다 크게) 움직이면 문지르기를 시작하고, 세로 스크롤 등으로 취소되면 이전 선택으로 돌아간다.
 * - 키보드·보조기기: 달마다 버튼이 있다(포인터는 오버레이가 받는다). 탭 순서에는 한 달만 두고(roving tabindex, 자체 상태)
 *   ←/→·Home/End로 옮긴다. 상세 줄은 고른 달 버튼의 설명(aria-describedby)이다.
 */
export function MonthChartFrame({
  months,
  recorded,
  summary,
  children,
  detailRows,
  detailColumns,
  detailReservedRows,
}: MonthChartFrameProps) {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [focusMonth, setFocusMonth] = useState<string | null>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const dragRef = useRef<Drag | null>(null);
  const detailId = useId();
  const n = months.length;
  // 고른 달이 축 밖이면(기간 변경 등) 기본 달로 돌아간다.
  const picked = selectedMonth == null ? -1 : months.indexOf(selectedMonth);
  const active = picked >= 0 ? picked : latestRecordedIndex(recorded);
  const focused = focusMonth == null ? -1 : months.indexOf(focusMonth);
  const tabIndexAt = focused >= 0 ? focused : active;
  const slot = slotWidth(n);

  function select(i: number) {
    setSelectedMonth(months[i]);
    setFocusMonth(months[i]);
  }

  // 이벤트 시점의 실제 폭으로 clientX를 viewBox x로 바꿔 달을 찾는다.
  function indexFromPointer(e: PointerEvent<HTMLDivElement>): number {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) {
      return -1;
    }
    return indexAtX(((e.clientX - rect.left) / rect.width) * CHART_W, n);
  }

  function selectAtPointer(e: PointerEvent<HTMLDivElement>) {
    const i = indexFromPointer(e);
    if (i < 0) {
      return;
    }
    select(i);
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    const touch = e.pointerType === "touch";
    dragRef.current = {
      pointerId: e.pointerId,
      touch,
      startX: e.clientX,
      startY: e.clientY,
      prevMonth: selectedMonth,
      scrubbing: !touch,
    };
    if (touch) {
      return;
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    selectAtPointer(e);
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) {
      return;
    }
    if (!drag.scrubbing) {
      if (!isHorizontalDrag(e.clientX - drag.startX, e.clientY - drag.startY)) {
        return;
      }
      drag.scrubbing = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    selectAtPointer(e);
  }

  function handlePointerUp(e: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) {
      return;
    }
    dragRef.current = null;
    if (!drag.touch || drag.scrubbing) {
      return;
    }
    // 터치 탭 — 거의 움직이지 않았을 때만 고른다(세로 스크롤 끝은 무시).
    const dx = Math.abs(e.clientX - drag.startX);
    const dy = Math.abs(e.clientY - drag.startY);
    if (dx <= SCRUB_THRESHOLD && dy <= SCRUB_THRESHOLD) {
      selectAtPointer(e);
    }
  }

  function handlePointerCancel(e: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) {
      return;
    }
    dragRef.current = null;
    if (drag.touch && drag.scrubbing) {
      setSelectedMonth(drag.prevMonth);
      setFocusMonth(drag.prevMonth);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const next: Record<string, number> = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: n - 1 };
    if (!(e.key in next)) {
      return;
    }
    e.preventDefault();
    const j = Math.min(n - 1, Math.max(0, next[e.key]));
    select(j);
    buttonRefs.current[j]?.focus();
  }

  return (
    <div className="flex flex-col gap-3">
      {active >= 0 && (
        <ChartDetail
          id={detailId}
          title={formatMonthTitle(months[active])}
          rows={detailRows(active)}
          columns={detailColumns}
          reservedRows={detailReservedRows}
        />
      )}

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
                fontSize={LABEL_FONT_SIZE}
                fill={LABEL_COLOR}
                className="tabular-nums"
              >
                {text}
              </text>
            ))}
          </svg>
        </div>

        {/* 키보드·보조기기용 달 버튼 — 포인터는 아래 오버레이가 받는다(포커스 링 위치용으로 슬롯에 맞춰 둔다). */}
        {months.map((m, i) => {
          const { leftPct, widthPct } = hitArea(i, n);
          return (
            <button
              key={m}
              ref={(el) => {
                buttonRefs.current[i] = el;
              }}
              type="button"
              aria-label={formatMonthTitle(m)}
              aria-pressed={i === active}
              aria-describedby={i === active ? detailId : undefined}
              tabIndex={i === tabIndexAt ? 0 : -1}
              onClick={() => select(i)}
              onKeyDown={(e) => handleKeyDown(e, i)}
              className="pointer-events-none absolute inset-y-0 rounded-[4px] focus-visible:outline-2 focus-visible:outline-primary"
              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
            />
          );
        })}

        {/* 문지르기 오버레이 — 세로 스크롤은 브라우저에 맡기고(touch-pan-y) 가로 움직임으로 달을 고른다. */}
        <div
          data-chart-scrub
          aria-hidden="true"
          className="absolute inset-0 cursor-pointer touch-pan-y"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        />
      </div>
    </div>
  );
}
