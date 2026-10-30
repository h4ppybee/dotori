import { describe, it, expect, beforeEach } from "vitest";
import { slotOf, toggleSelection, useLedgerStore, type LedgerSelection } from "@/stores/ledger-store";

const FOOD = "expense.variable.food";

beforeEach(() => {
  useLedgerStore.getState().reset();
});

describe("ledger-store", () => {
  it("기본값: 12개월, 식비 하나(슬롯 0)", () => {
    const s = useLedgerStore.getState();
    expect(s.range).toBe(12);
    expect(s.selected).toEqual([{ id: FOOD, slot: 0 }]);
  });

  it("setRange", () => {
    useLedgerStore.getState().setRange("all");
    expect(useLedgerStore.getState().range).toBe("all");
  });

  it("toggleNode로 추가·해제하고 마지막 하나는 해제되지 않는다", () => {
    const { toggleNode } = useLedgerStore.getState();
    toggleNode("expense.fixed");
    expect(useLedgerStore.getState().selected.map((s) => s.id)).toEqual([FOOD, "expense.fixed"]);
    toggleNode(FOOD);
    expect(useLedgerStore.getState().selected.map((s) => s.id)).toEqual(["expense.fixed"]);
    toggleNode("expense.fixed");
    expect(useLedgerStore.getState().selected.map((s) => s.id)).toEqual(["expense.fixed"]);
  });

  it("reset은 기본값으로 되돌린다", () => {
    useLedgerStore.getState().setRange(6);
    useLedgerStore.getState().toggleNode("expense");
    useLedgerStore.getState().reset();
    expect(useLedgerStore.getState().range).toBe(12);
    expect(useLedgerStore.getState().selected).toEqual([{ id: FOOD, slot: 0 }]);
  });
});

describe("toggleSelection — 슬롯 고정 배정", () => {
  const four: LedgerSelection[] = [
    { id: "a", slot: 0 },
    { id: "b", slot: 1 },
    { id: "c", slot: 2 },
    { id: "d", slot: 3 },
  ];

  it("칩을 빼도 남은 칩의 슬롯은 그대로이고, 새 칩은 빈 가장 앞 슬롯을 쓴다", () => {
    let sel = toggleSelection(four, "b");
    expect(slotOf(sel, "c")).toBe(2);
    expect(slotOf(sel, "d")).toBe(3);
    sel = toggleSelection(sel, "e");
    expect(slotOf(sel, "e")).toBe(1);
    expect(sel.map((s) => s.id)).toEqual(["a", "c", "d", "e"]);
  });

  it("4개에서 새 칩을 고르면 가장 먼저 고른 것이 빠지고 그 슬롯을 쓴다", () => {
    const sel = toggleSelection(four, "e");
    expect(sel.map((s) => s.id)).toEqual(["b", "c", "d", "e"]);
    expect(slotOf(sel, "e")).toBe(0);
    expect(slotOf(sel, "a")).toBeUndefined();
  });

  it("마지막 하나는 해제되지 않는다(같은 배열 반환)", () => {
    const one: LedgerSelection[] = [{ id: "a", slot: 2 }];
    expect(toggleSelection(one, "a")).toBe(one);
  });
});
