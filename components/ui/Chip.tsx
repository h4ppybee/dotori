"use client";

import { type ReactNode } from "react";

interface ChipProps {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * 토스 스타일 필터 칩 (pill shape).
 * selected 시 blue-surface 배경 + 파랑 텍스트.
 */
export function Chip({ children, selected = false, onClick, className = "" }: ChipProps) {
  const base = "inline-flex items-center px-[14px] py-[6px] rounded-full text-[12px] font-semibold leading-[1.4] transition-colors duration-150 cursor-pointer select-none";
  const variantClass = selected
    ? "bg-primary-surface text-primary"
    : "bg-surface-strong text-body hover:bg-[#d8dce0]";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} ${variantClass} ${className}`}
      aria-pressed={selected}
    >
      {children}
    </button>
  );
}
