import { formatPct, signClass } from "@/lib/format";

interface ReturnBadgeProps {
  value: number;
  className?: string;
}

/**
 * 수익률 배지.
 * 양수(상승) → 빨강 텍스트(#F04452) + 연한 빨강 배경(#FDECEE)
 * 음수(하락) → 파랑 텍스트(#3182F6) + 연한 파랑 배경(#E8F3FF)
 * 0(보합) → muted 텍스트 + surface-strong 배경
 * 한국 증시 관례: 상승=빨강, 하락=파랑
 */
export function ReturnBadge({ value, className = "" }: ReturnBadgeProps) {
  const sign = signClass(value);

  const colorClass =
    sign === "up"
      ? "text-up bg-up-surface"
      : sign === "down"
      ? "text-down bg-down-surface"
      : "text-muted bg-surface-strong";

  return (
    <span
      className={`
        inline-flex items-center
        rounded-[8px] px-2 py-[3px]
        text-[12px] font-semibold leading-[1.4]
        tabular-nums
        ${colorClass}
        ${className}
      `}
    >
      {formatPct(value)}
    </span>
  );
}
