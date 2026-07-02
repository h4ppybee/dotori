"use client";

interface PinDotsProps {
  length: number;   // 총 자릿수
  filled: number;   // 입력된 자릿수
}

/**
 * PIN 입력 진행 인디케이터. 입력된 자리는 브랜드 색, 빈 자리는 중립 색 점으로 표시한다.
 * 값 자체는 절대 렌더링하지 않는다 — 채워진 개수만 보여준다.
 */
export function PinDots({ length, filled }: PinDotsProps) {
  return (
    <div
      role="status"
      aria-label={`${length}자리 중 ${filled}자리 입력`}
      className="flex items-center justify-center gap-3"
    >
      {Array.from({ length }, (_, i) => (
        <span
          key={i}
          data-filled={i < filled}
          className={`h-3 w-3 rounded-full transition-colors duration-150 ${
            i < filled ? "bg-primary" : "bg-surface-strong"
          }`}
        />
      ))}
    </div>
  );
}
