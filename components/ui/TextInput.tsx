"use client";

import { type InputHTMLAttributes } from "react";

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  masked?: boolean;
  placeholder?: string;
  inputId?: string;
}

/**
 * 토스 스타일 레이블 입력 필드.
 * 기본 배경 surface-soft, focus 시 1.5px primary 테두리.
 * masked=true 이면 type="password"로 렌더링.
 */
export function TextInput({
  label,
  value,
  onChange,
  masked = false,
  placeholder,
  type,
  inputId,
  className = "",
  ...rest
}: TextInputProps) {
  const inputType = masked ? "password" : (type ?? "text");

  return (
    <div className={`flex flex-col gap-[6px] ${className}`}>
      <label
        htmlFor={inputId}
        className="text-[13px] font-semibold leading-[1.45] text-body-soft"
      >
        {label}
      </label>
      <input
        id={inputId}
        type={inputType}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="
          h-[56px] px-4 rounded-[12px]
          bg-surface-soft text-ink
          text-[17px] font-normal leading-[1.5] tracking-[-0.2px]
          border border-hairline
          outline-none
          focus:bg-surface-card focus:border-[1.5px] focus:border-primary
          placeholder:text-muted
          transition-colors duration-150
        "
        {...rest}
      />
    </div>
  );
}
