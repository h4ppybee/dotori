"use client";

import type { EnvelopeProfile } from "@/lib/types";

type SegmentValue = "combined" | EnvelopeProfile;

interface ProfileSegmentProps {
  value: SegmentValue;
  onChange: (v: SegmentValue) => void;
}

const SEGMENTS: { key: SegmentValue; label: string }[] = [
  { key: "combined", label: "통합" },
  { key: "wife", label: "아내" },
  { key: "husband", label: "남편" },
];

/**
 * 프로필 세그먼트 컨트롤 (통합 / 아내 / 남편).
 * surface-soft pill 컨테이너 위에서 활성 세그먼트만 흰 카드로 떠오른다(토스 세그먼트 톤).
 */
export function ProfileSegment({ value, onChange }: ProfileSegmentProps) {
  return (
    <div
      className="flex gap-1 rounded-full bg-surface-soft p-1"
      role="tablist"
      aria-label="프로필 선택"
    >
      {SEGMENTS.map((seg) => {
        const active = value === seg.key;
        return (
          <button
            key={seg.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(seg.key)}
            className={`
              flex-1 rounded-full px-4 py-2
              text-[15px] font-semibold leading-[1.4] tracking-[-0.1px]
              transition-colors duration-150 cursor-pointer
              ${active ? "bg-surface-card text-ink shadow-card" : "text-muted hover:text-body"}
            `}
          >
            {seg.label}
          </button>
        );
      })}
    </div>
  );
}
