"use client";

import { useEffect, useRef, useState } from "react";
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
 * 처음 그릴 때 고른 칩 중 맨 앞 칩이 보이도록 칩 줄을 스크롤한다(기본 "식비"가 화면 밖에 있으므로).
 * 이후 선택이 바뀔 때는 스크롤하지 않는다 — 방금 누른 칩은 이미 보이고, 다른 칩으로 튀면 누르던 자리를 잃는다.
 */
export function CategoryChips({ selected, onToggle }: CategoryChipsProps) {
  const nodes = allNodesInOrder();
  const chipRefs = useRef(new Map<string, HTMLButtonElement>());
  const [initialId] = useState(() => nodes.find((n) => slotOf(selected, n.id) !== undefined)?.id ?? null);

  useEffect(() => {
    if (initialId == null) {
      return;
    }
    // jsdom 등 scrollIntoView가 없는 환경은 건너뛴다.
    chipRefs.current.get(initialId)?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [initialId]);

  return (
    <div
      role="group"
      aria-label="카테고리"
      className="-mx-5 flex gap-1.5 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {nodes.map((node) => {
        const slot = slotOf(selected, node.id);
        return (
          <Chip
            key={node.id}
            ref={(el) => {
              if (el) {
                chipRefs.current.set(node.id, el);
              } else {
                chipRefs.current.delete(node.id);
              }
            }}
            selected={slot !== undefined}
            onClick={() => onToggle(node.id)}
            className="shrink-0 gap-1.5 whitespace-nowrap"
          >
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
