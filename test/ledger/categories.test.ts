import { describe, it, expect } from "vitest";
import {
  LEAF_IDS,
  LEDGER_TREE,
  allNodesInOrder,
  chipLabel,
  findNode,
  isLeafId,
  leavesUnder,
} from "@/lib/ledger/categories";

describe("가계부 카테고리 트리", () => {
  it("잎은 24개이고 spec 트리 순서를 따른다", () => {
    expect(LEAF_IDS).toEqual([
      "income.salary",
      "income.side",
      "income.financial",
      "expense.fixed.housing",
      "expense.fixed.allowance",
      "expense.fixed.transport",
      "expense.fixed.insurance",
      "expense.fixed.telecom",
      "expense.fixed.subscription",
      "expense.variable.food.delivery",
      "expense.variable.food.dining",
      "expense.variable.food.groceries",
      "expense.variable.social",
      "expense.variable.beauty",
      "expense.variable.selfdev",
      "expense.variable.leisure",
      "expense.variable.household",
      "expense.variable.gifts",
      "expense.variable.health",
      "expense.variable.travel",
      "expense.variable.etc",
      "saving.invest",
      "saving.deposit",
      "saving.etc",
    ]);
  });

  it("최상위는 수입·지출·저축 순서", () => {
    expect(LEDGER_TREE.map((n) => [n.id, n.label])).toEqual([
      ["income", "수입"],
      ["expense", "지출"],
      ["saving", "저축"],
    ]);
  });

  it("findNode는 모든 깊이의 노드를 찾고, 없으면 undefined", () => {
    expect(findNode("expense.variable.food")?.label).toBe("식비");
    expect(findNode("expense.variable.food.delivery")?.label).toBe("배달");
    expect(findNode("nope")).toBeUndefined();
  });

  it("leavesUnder는 노드 아래 잎(잎이면 자기 자신)", () => {
    expect(leavesUnder("expense.variable.food")).toEqual([
      "expense.variable.food.delivery",
      "expense.variable.food.dining",
      "expense.variable.food.groceries",
    ]);
    expect(leavesUnder("income.salary")).toEqual(["income.salary"]);
    expect(leavesUnder("expense.fixed")).toHaveLength(6);
    expect(leavesUnder("expense")).toHaveLength(18);
    expect(leavesUnder("nope")).toEqual([]);
  });

  it("isLeafId는 현재 트리의 잎만 true", () => {
    expect(isLeafId("income.salary")).toBe(true);
    expect(isLeafId("expense.variable.food")).toBe(false);
    expect(isLeafId("legacy.x")).toBe(false);
  });

  it("allNodesInOrder는 깊이 우선 전체 노드", () => {
    const ids = allNodesInOrder().map((n) => n.id);
    expect(ids.slice(0, 5)).toEqual(["income", "income.salary", "income.side", "income.financial", "expense"]);
    expect(ids).toHaveLength(3 + 2 + 1 + 24);
  });

  it("chipLabel은 전 노드에서 중복이 없고 기타는 소속을 붙인다", () => {
    const labels = allNodesInOrder().map((n) => chipLabel(n.id));
    expect(new Set(labels).size).toBe(labels.length);
    expect(chipLabel("expense.variable.etc")).toBe("기타(지출)");
    expect(chipLabel("saving.etc")).toBe("기타(저축)");
    expect(chipLabel("expense.variable.food")).toBe("식비");
  });
});
