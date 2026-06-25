"use client";

import { type ReactNode, type ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "weak" | "text";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-on-primary hover:bg-primary-active active:bg-primary-pressed disabled:bg-primary-disabled",
  secondary:
    "bg-primary-surface text-primary hover:bg-[#d6eaff] active:bg-[#c2dfff]",
  weak:
    "bg-surface-strong text-body hover:bg-[#d8dce0] active:bg-[#cdd1d5]",
  text:
    "bg-transparent text-primary hover:bg-primary-surface active:bg-[#d6eaff]",
};

/**
 * 토스 스타일 버튼.
 * variants: primary / secondary / weak / text
 * height 52px, radius 12px, font-weight 600 (button typography)
 */
export function Button({
  variant = "primary",
  children,
  className = "",
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center
        h-[52px] px-5 rounded-[12px]
        text-[17px] font-semibold leading-[1.2] tracking-[-0.2px]
        transition-colors duration-150 cursor-pointer
        disabled:cursor-not-allowed
        ${variantClasses[variant]}
        ${className}
      `}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}
