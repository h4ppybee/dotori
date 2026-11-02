"use client";

import { Chip } from "@/components/ui/Chip";
import type { LedgerRange } from "@/lib/ledger/ledger-service";

const OPTIONS: { value: LedgerRange; label: string }[] = [
  { value: 6, label: "6개월" },
  { value: 12, label: "12개월" },
  { value: "all", label: "전체" },
];

/** 분석 기간 칩(6개월·12개월·전체). 두 차트에 함께 적용된다. */
export function RangeChips({ value, onChange }: { value: LedgerRange; onChange: (range: LedgerRange) => void }) {
  return (
    <div role="group" aria-label="기간" className="flex gap-1.5">
      {OPTIONS.map((o) => (
        <Chip key={o.label} selected={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </Chip>
      ))}
    </div>
  );
}
