"use client";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

interface NumberPadProps {
  onPress: (digit: string) => void;
  onDelete: () => void;
  disabled?: boolean;
}

/**
 * 잠금 화면용 3×4 고정 배열 넘버패드 (1~9 / 빈칸·0·지우기).
 * 셀은 투명 배경에 탭 시 surface-soft 하이라이트 — 토스 잠금 키패드 스타일.
 */
export function NumberPad({ onPress, onDelete, disabled = false }: NumberPadProps) {
  const cellClass =
    "h-14 rounded-lg text-[22px] font-semibold text-ink transition-colors duration-100 active:bg-surface-soft disabled:opacity-40";

  return (
    <div className="grid grid-cols-3 gap-1">
      {KEYS.map((digit) => (
        <button
          key={digit}
          type="button"
          disabled={disabled}
          onClick={() => onPress(digit)}
          className={cellClass}
        >
          {digit}
        </button>
      ))}
      <span aria-hidden="true" />
      <button
        type="button"
        disabled={disabled}
        onClick={() => onPress("0")}
        className={cellClass}
      >
        0
      </button>
      <button
        type="button"
        aria-label="지우기"
        disabled={disabled}
        onClick={onDelete}
        className={`${cellClass} flex items-center justify-center`}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 5h10a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7 6-7z" />
          <path d="M13 9.5l5 5M18 9.5l-5 5" />
        </svg>
      </button>
    </div>
  );
}
