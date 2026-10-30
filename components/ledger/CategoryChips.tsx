"use client";

import { Chip } from "@/components/ui/Chip";
import { SLOT_COLORS } from "@/components/ledger/ledger-constants";
import { allNodesInOrder, chipLabel } from "@/lib/ledger/categories";
import { slotOf, type LedgerSelection } from "@/stores/ledger-store";

interface CategoryChipsProps {
  selected: LedgerSelection[];
  onToggle: (id: string) => void;
}

/**
 * 카테고리 칩 — 트리 전 단계(수입·지출·고정지출·식비·배달 …)를 트리 순서로 가로 스크롤.
 * 고른 칩에는 그 슬롯의 선 색 점을 붙인다(칩을 빼도 남은 칩의 색은 그대로).
 */
export function CategoryChips({ selected, onToggle }: CategoryChipsProps) {
  return (
    <div
      role="group"
      aria-label="카테고리"
      className="-mx-5 flex gap-1.5 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {allNodesInOrder().map((node) => {
        const slot = slotOf(selected, node.id);
        return (
          <Chip key={node.id} selected={slot !== undefined} onClick={() => onToggle(node.id)} className="shrink-0 gap-1.5 whitespace-nowrap">
            {slot !== undefined && (
              <span
                data-slot-dot
                aria-hidden="true"
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: SLOT_COLORS[slot] }}
              />
            )}
            {chipLabel(node.id)}
          </Chip>
        );
      })}
    </div>
  );
}
