import { create } from "zustand";
import type { LedgerRange } from "@/lib/ledger/ledger-service";

/** 카테고리 선 색 슬롯(palette 앞 4색에 고정 배정). */
export type LedgerSlot = 0 | 1 | 2 | 3;

/** 분석 카테고리 칩 선택(고른 순서대로). */
export interface LedgerSelection {
  id: string;
  slot: LedgerSlot;
}

const SLOTS: LedgerSlot[] = [0, 1, 2, 3];
const DEFAULT_NODE = "expense.variable.food"; // 식비

/**
 * 칩 토글(순수). 최소 1개는 남기고(마지막 칩은 해제되지 않음 — 같은 배열 반환),
 * 4개인 상태에서 새 칩을 고르면 가장 먼저 고른 것이 빠진다.
 * 슬롯은 고정 배정: 남은 칩의 슬롯은 바뀌지 않고, 새 칩은 비어 있는 가장 앞 슬롯을 쓴다.
 */
export function toggleSelection(selected: LedgerSelection[], id: string): LedgerSelection[] {
  if (selected.some((s) => s.id === id)) {
    if (selected.length <= 1) {
      return selected;
    }
    return selected.filter((s) => s.id !== id);
  }
  const kept = selected.length >= SLOTS.length ? selected.slice(1) : selected;
  const used = new Set(kept.map((s) => s.slot));
  const slot = SLOTS.find((s) => !used.has(s)) ?? 0;
  return [...kept, { id, slot }];
}

/** 선택된 칩의 슬롯. 선택되지 않았으면 undefined. */
export function slotOf(selected: LedgerSelection[], id: string): LedgerSlot | undefined {
  return selected.find((s) => s.id === id)?.slot;
}

interface LedgerAnalysisState {
  range: LedgerRange;
  selected: LedgerSelection[];
  setRange: (range: LedgerRange) => void;
  toggleNode: (id: string) => void;
  reset: () => void;
}

const initial = (): Pick<LedgerAnalysisState, "range" | "selected"> => ({
  range: 12,
  selected: [{ id: DEFAULT_NODE, slot: 0 }],
});

/**
 * 가계부 분석 화면의 기간·카테고리 칩 선택. 메모리에만 둔다(영속화 없음) —
 * 서브탭을 오가도 유지되고, 새로고침하면 기본값(12개월·식비)으로 돌아간다.
 */
export const useLedgerStore = create<LedgerAnalysisState>((set) => ({
  ...initial(),
  setRange: (range) => set({ range }),
  toggleNode: (id) => set((s) => ({ selected: toggleSelection(s.selected, id) })),
  reset: () => set(initial()),
}));
