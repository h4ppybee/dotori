"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { ChartTooltip, type ChartTooltipRow } from "@/components/ledger/ChartTooltip";
import { GRID_COLOR, LABEL_COLOR } from "@/components/ledger/ledger-constants";
import {
  CHART_H,
  CHART_W,
  LABEL_FONT_SIZE,
  LABEL_Y,
  PAD_X,
  PLOT_BOTTOM,
  PLOT_TOP,
  hitArea,
  indexAtX,
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

/** 진행 중인 누르기·문지르기. */
interface Drag {
  pointerId: number;
  startIndex: number;
  /** 누르기 시작한 달이 이미 골라져 있었는지(움직이지 않고 떼면 닫는다). */
  wasActive: boolean;
  moved: boolean;
}

/**
 * 가계부 월 차트 공용 틀 — 0 기준선·고른 달 강조·월 라벨·문지르기·달 버튼·말풍선.
 * - 포인터: 차트 전체를 덮는 오버레이 하나가 누른 위치(clientX → viewBox x → 달)를 고르고, 누른 채 문지르면 따라간다.
 *   달이 많아 슬롯이 몇 px밖에 안 돼도 고를 수 있다. 고른 달을 움직이지 않고 다시 탭하면 닫는다.
 * - 키보드·보조기기: 달마다 버튼이 있다(포인터는 오버레이가 받는다). 탭 순서에는 고른 달(없으면 첫 달) 하나만 두고
 *   ←/→·Home/End로 옮긴다. 같은 달을 다시 누르면 닫는다.
 * - 말풍선은 차트 위(그림 영역 밖)에 뜨고, 바깥을 누르거나 Escape로 닫힌다.
 */
export function MonthChartFrame({ months, summary, children, tooltipRows }: MonthChartFrameProps) {
  const [activeMonth, setActiveMonth] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const dragRef = useRef<Drag | null>(null);
  const tooltipId = useId();
  const n = months.length;
  // 기간을 바꿔 고른 달이 축 밖으로 나가면 말풍선은 자연히 사라진다.
  const active = activeMonth == null ? -1 : months.indexOf(activeMonth);
  const open = active >= 0;
  const focusIndex = open ? active : 0;
  const slot = slotWidth(n);

  // 말풍선이 열려 있는 동안만 바깥 누르기·Escape를 듣는다.
  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(e: globalThis.PointerEvent) {
      if (containerRef.current?.contains(e.target as Node)) {
        return;
      }
      setActiveMonth(null);
    }
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        setActiveMonth(null);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // 이벤트 시점의 실제 폭으로 clientX를 viewBox x로 바꿔 달을 찾는다.
  function indexFromPointer(e: PointerEvent<HTMLDivElement>): number {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) {
      return -1;
    }
    return indexAtX(((e.clientX - rect.left) / rect.width) * CHART_W, n);
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    const i = indexFromPointer(e);
    if (i < 0) {
      return;
    }
    dragRef.current = { pointerId: e.pointerId, startIndex: i, wasActive: i === active, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setActiveMonth(months[i]);
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) {
      return;
    }
    const i = indexFromPointer(e);
    if (i < 0) {
      return;
    }
    if (i !== drag.startIndex) {
      drag.moved = true;
    }
    setActiveMonth(months[i]);
  }

  function handlePointerUp(e: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) {
      return;
    }
    dragRef.current = null;
    if (!drag.moved && drag.wasActive) {
      setActiveMonth(null);
    }
  }

  function moveTo(i: number) {
    const j = Math.min(n - 1, Math.max(0, i));
    setActiveMonth(months[j]);
    buttonRefs.current[j]?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const next: Record<string, number> = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: n - 1 };
    if (!(e.key in next)) {
      return;
    }
    e.preventDefault();
    moveTo(next[e.key]);
  }

  return (
    <div ref={containerRef} className="relative">
      <div role="img" aria-label={summary}>
        <svg width="100%" viewBox={`0 0 ${CHART_W} ${CHART_H}`} aria-hidden="true" className="block">
          {open && (
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
            aria-describedby={i === active ? tooltipId : undefined}
            tabIndex={i === focusIndex ? 0 : -1}
            onClick={() => setActiveMonth(i === active ? null : m)}
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
        onPointerCancel={() => {
          dragRef.current = null;
        }}
      />

      {open && (
        <ChartTooltip
          id={tooltipId}
          title={formatMonthTitle(months[active])}
          anchorX={slotCenter(active, n)}
          rows={tooltipRows(active)}
        />
      )}
    </div>
  );
}
