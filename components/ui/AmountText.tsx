import { formatKrw, formatUsd } from "@/lib/format";

type AmountCurrency = "KRW" | "USD";
type AmountSize = "hero" | "lg" | "md";

interface AmountTextProps {
  value: number;
  currency?: AmountCurrency;
  size?: AmountSize;
  className?: string;
}

/**
 * 금액 표시 컴포넌트.
 * KRW: ₩ + 천 단위 콤마 / USD: $ + 소수점 2자리
 * tabular-nums 적용, size에 따라 굵기·크기 달라짐.
 */
export function AmountText({
  value,
  currency = "KRW",
  size = "md",
  className = "",
}: AmountTextProps) {
  const formatted = currency === "USD" ? formatUsd(value) : formatKrw(value);

  const sizeClass =
    size === "hero"
      ? "text-[36px] font-bold leading-[1.2] tracking-[-0.5px]"
      : size === "lg"
      ? "text-[22px] font-bold leading-[1.3] tracking-[-0.2px]"
      : "text-[15px] font-semibold leading-[1.4]";

  return (
    <span
      className={`tabular-nums ${sizeClass} ${className}`}
    >
      {formatted}
    </span>
  );
}
