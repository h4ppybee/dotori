"use client";

import { formatKrw } from "@/lib/format";
import { tagColor } from "@/lib/envelope/tag-color";
import type { EnvelopeItemRow as EnvelopeItemRowData } from "@/lib/envelope/envelope-service";

interface EnvelopeItemRowProps {
  row: EnvelopeItemRowData;
  onEdit: () => void;
}

/** 비율(0~100)을 부호 없이 소수점 1자리로. */
function formatShare(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

/**
 * 통장 쪼개기 항목 행 — 탭하면 편집 다이얼로그를 연다.
 * 항목명 + 태그 칩(색) + 통장(보조) + 금액 + 비율. 금액은 뉴트럴 text-ink.
 */
export function EnvelopeItemRow({ row, onEdit }: EnvelopeItemRowProps) {
  const { item, ratioPct } = row;
  const color = tagColor(item.tag);

  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex w-full items-center gap-3 rounded-[12px] px-1 py-3 text-left transition-colors duration-150 hover:bg-surface-soft"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[17px] font-semibold leading-[1.45] tracking-[-0.2px] text-ink">
            {item.name}
          </span>
          <span
            className="inline-flex shrink-0 items-center rounded-full px-2 py-[3px] text-[12px] font-semibold leading-[1.4]"
            style={{ backgroundColor: `${color}1F`, color }}
          >
            {item.tag}
          </span>
        </div>
        <span className="mt-0.5 block truncate text-[13px] font-normal leading-[1.45] text-muted">
          {item.account}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className="text-[15px] font-semibold leading-[1.4] tabular-nums text-ink">
          {formatKrw(item.amountKrw)}
        </span>
        <span className="text-[13px] font-normal leading-[1.4] tabular-nums text-muted">
          {formatShare(ratioPct)}
        </span>
      </div>
    </button>
  );
}
