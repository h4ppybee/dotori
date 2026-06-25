import { type ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  variant?: "default" | "hero";
  className?: string;
}

/**
 * 토스 스타일 카드 서피스.
 * default: radius-xl(20px), padding 20px
 * hero: radius-xxl(28px), padding 24px
 */
export function Card({ children, variant = "default", className = "" }: CardProps) {
  const base = "bg-surface-card shadow-card";
  const variantClass =
    variant === "hero"
      ? "rounded-[28px] p-6"
      : "rounded-[20px] p-5";

  return (
    <div className={`${base} ${variantClass} ${className}`}>
      {children}
    </div>
  );
}
