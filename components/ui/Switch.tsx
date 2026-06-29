"use client";

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;        // 접근성 라벨
  disabled?: boolean;
}

/**
 * 토스풍 토글 스위치. ON일 때 브랜드 보이스(bg-primary), OFF일 때 중립 트랙.
 * role=switch + aria-checked로 접근성 보장, 클릭/키보드로 토글.
 */
export function Switch({ checked, onChange, label, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[28px] w-[48px] shrink-0 items-center rounded-full transition-colors duration-150 disabled:opacity-40 ${
        checked ? "bg-primary" : "bg-surface-strong"
      }`}
    >
      <span
        className={`inline-block h-[22px] w-[22px] rounded-full bg-surface-card shadow-sm transition-transform duration-150 ${
          checked ? "translate-x-[23px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}
