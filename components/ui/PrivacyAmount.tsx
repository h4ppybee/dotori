"use client";

import { type ReactNode, useState } from "react";
import { usePrivacyAmounts } from "@/lib/query/use-settings";

interface PrivacyAmountProps {
  children: ReactNode;       // 이미 포맷된 금액 노드
  revealLabel?: string;      // 접근성 라벨 (기본: "금액 보기")
}

/**
 * 금액을 감싸 프라이버시(금액 숨기기)를 적용하는 재사용 래퍼.
 * - 플래그 OFF: children 그대로 노출.
 * - 플래그 ON: 초기엔 블러 + 탭하면 선명. 노출 상태는 로컬이라 리마운트 시 초기화된다.
 * 주의: 블러는 DOM에 실제 값이 남는다. "어깨너머 시선 차단" 목적이며 완전한 비밀 보장은 아니다.
 */
export function PrivacyAmount({ children, revealLabel = "금액 보기" }: PrivacyAmountProps) {
  const privacy = usePrivacyAmounts();
  const [revealed, setRevealed] = useState(false);

  if (!privacy || revealed) {
    return <>{children}</>;
  }

  return (
    <button
      type="button"
      aria-label={revealLabel}
      onClick={() => setRevealed(true)}
      className="inline-flex cursor-pointer select-none blur-[14px]"
    >
      {children}
    </button>
  );
}
