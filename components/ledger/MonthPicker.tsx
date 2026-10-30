"use client";

import { formatMonthTitle } from "@/lib/ledger/month";

interface MonthPickerProps {
  /** "YYYY-MM" */
  month: string;
  onPrev: () => void;
  onNext: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
}

/** 꺾쇠 아이콘. left면 ‹, 아니면 ›. stroke=currentColor. */
function Chevron({ left }: { left?: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={left ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

const ARROW =
  "flex h-10 w-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-soft hover:text-body active:bg-surface-strong disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent disabled:hover:text-muted";

/** 월 선택 — ‹ 2026년 10월 ›. 이동 가능 여부는 호출부가 정한다(다음 달 이후·편집 중 비활성). */
export function MonthPicker({ month, onPrev, onNext, prevDisabled, nextDisabled }: MonthPickerProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      <button type="button" aria-label="이전 달" onClick={onPrev} disabled={prevDisabled} className={ARROW}>
        <Chevron left />
      </button>
      <h2 className="min-w-[132px] text-center text-[19px] font-bold leading-[1.4] tracking-[-0.2px] tabular-nums text-ink">
        {formatMonthTitle(month)}
      </h2>
      <button type="button" aria-label="다음 달" onClick={onNext} disabled={nextDisabled} className={ARROW}>
        <Chevron />
      </button>
    </div>
  );
}
