import { describe, it, expect } from "vitest";
import {
  axisLabels,
  buildMonthView,
  buildSeries,
  canCarryOver,
  carryOverFromPrevious,
  hasLedgerAmounts,
  sumNode,
  type LedgerMonthAmounts,
} from "@/lib/ledger/ledger-service";

// 둥근 가상 금액
const amounts: Record<string, number> = {
  "income.salary": 3_000_000,
  "income.side": 200_000,
  "expense.fixed.housing": 500_000,
  "expense.variable.food.delivery": 100_000,
  "expense.variable.food.dining": 50_000,
  "saving.deposit": 1_000_000,
  "legacy.x": 999_000, // 알 수 없는 ID — 합계에서 무시
};

describe("sumNode", () => {
  it("노드 아래 잎만 더하고 알 수 없는 키는 무시한다", () => {
    expect(sumNode(amounts, "expense")).toBe(650_000);
    expect(sumNode(amounts, "expense.variable.food")).toBe(150_000);
    expect(sumNode(amounts, "income.salary")).toBe(3_000_000);
    expect(sumNode(amounts, "legacy.x")).toBe(0);
  });
});

describe("buildMonthView", () => {
  it("수입·지출·저축 합계와 남은 돈, 노드별 합계", () => {
    const v = buildMonthView(amounts);
    expect(v.income).toBe(3_200_000);
    expect(v.expense).toBe(650_000);
    expect(v.saving).toBe(1_000_000);
    expect(v.remaining).toBe(1_550_000);
    expect(v.nodes.get("expense.variable")).toBe(150_000);
    expect(v.nodes.get("expense.fixed.telecom")).toBe(0);
  });
  it("남은 돈은 음수가 될 수 있다", () => {
    const v = buildMonthView({ "expense.fixed.housing": 500_000 });
    expect(v.remaining).toBe(-500_000);
  });
});

describe("hasLedgerAmounts", () => {
  it("현재 잎에 0보다 큰 값이 있어야 true", () => {
    expect(hasLedgerAmounts({})).toBe(false);
    expect(hasLedgerAmounts({ "legacy.x": 100 })).toBe(false);
    expect(hasLedgerAmounts({ "saving.etc": 10_000 })).toBe(true);
  });
});

describe("buildSeries", () => {
  const rows: LedgerMonthAmounts[] = [
    { id: "2025-12", amounts: { "income.salary": 3_000_000, "expense.variable.food.dining": 100_000 } },
    { id: "2026-02", amounts: { "saving.invest": 500_000 } },
  ];

  it("endMonth에서 거슬러 올라간 연속 월, 빈 달은 0", () => {
    const s = buildSeries(rows, { endMonth: "2026-02", range: 6, nodeIds: ["expense.variable.food"] });
    expect(s.months).toEqual(["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(s.income).toEqual([0, 0, 0, 3_000_000, 0, 0]);
    expect(s.expense).toEqual([0, 0, 0, 100_000, 0, 0]);
    expect(s.saving).toEqual([0, 0, 0, 0, 0, 500_000]);
    expect(s.byNode["expense.variable.food"]).toEqual([0, 0, 0, 100_000, 0, 0]);
    expect(s.monthsWithData).toBe(2);
  });

  it("12개월 축", () => {
    const s = buildSeries(rows, { endMonth: "2026-10", range: 12, nodeIds: [] });
    expect(s.months).toHaveLength(12);
    expect(s.months[0]).toBe("2025-11");
    expect(s.monthsWithData).toBe(2);
  });

  it("all은 금액이 있는 가장 오래된 달부터(메모만 있는 달 제외)", () => {
    const withMemoOnly: LedgerMonthAmounts[] = [{ id: "2024-01", amounts: {} }, { id: "2024-06", amounts: { "income.side": 100_000 } }, ...rows];
    const s = buildSeries(withMemoOnly, { endMonth: "2026-02", range: "all", nodeIds: [] });
    expect(s.months[0]).toBe("2024-06");
    expect(s.months[s.months.length - 1]).toBe("2026-02");
    expect(s.months).toHaveLength(21);
  });

  it("all의 시작 달이 6개월보다 최근이면 6개월 축", () => {
    const s = buildSeries(rows, { endMonth: "2026-02", range: "all", nodeIds: [] });
    expect(s.months).toHaveLength(6);
    expect(s.months[0]).toBe("2025-09");
  });

  it("기록이 없으면 all도 6개월 축", () => {
    const s = buildSeries([], { endMonth: "2026-02", range: "all", nodeIds: [] });
    expect(s.months).toHaveLength(6);
    expect(s.monthsWithData).toBe(0);
  });
});

describe("지난달에서 가져오기", () => {
  const prev = {
    "income.salary": 3_000_000,
    "expense.fixed.telecom": 50_000,
    "expense.variable.food.dining": 100_000,
    "saving.deposit": 500_000,
    "legacy.x": 1_000,
  };

  it("carryOverFromPrevious는 수입·고정지출·저축 잎만 복사한다", () => {
    expect(carryOverFromPrevious(prev)).toEqual({
      "income.salary": 3_000_000,
      "expense.fixed.telecom": 50_000,
      "saving.deposit": 500_000,
    });
  });

  it("canCarryOver: 이번 달이 비고 전 달 대상 잎에 값이 있을 때만", () => {
    expect(canCarryOver({}, prev)).toBe(true);
    expect(canCarryOver({ "legacy.x": 5 }, prev)).toBe(true);
    expect(canCarryOver({ "expense.variable.etc": 10_000 }, prev)).toBe(false);
    expect(canCarryOver({}, { "expense.variable.food.dining": 100_000 })).toBe(false);
    expect(canCarryOver({}, undefined)).toBe(false);
  });
});

describe("axisLabels", () => {
  it("6개 이하면 모두 표시, 같은 해면 M월", () => {
    expect(axisLabels(["2026-05", "2026-06", "2026-07"])).toEqual([
      { index: 0, text: "5월" },
      { index: 1, text: "6월" },
      { index: 2, text: "7월" },
    ]);
  });

  it("최대 6개, 마지막 달은 항상 포함, 해를 넘으면 첫 라벨과 1월에 연도", () => {
    const months = ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
    const labels = axisLabels(months);
    expect(labels.length).toBeLessThanOrEqual(6);
    expect(labels[labels.length - 1]).toEqual({ index: 11, text: "10월" });
    expect(labels.map((l) => l.text)).toEqual(["'25.12", "2월", "4월", "6월", "8월", "10월"]);
  });

  it("라벨이 1월에 걸리면 연도를 붙인다", () => {
    const months = ["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"];
    expect(axisLabels(months).map((l) => l.text)).toEqual(["'25.9", "10월", "11월", "12월", "'26.1", "2월"]);
  });

  it("간격은 끝 달 기준으로 맞춘다(7개월이면 2칸씩)", () => {
    const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"];
    expect(axisLabels(months).map((l) => l.index)).toEqual([0, 2, 4, 6]);
  });

  it("빈 축은 빈 배열", () => {
    expect(axisLabels([])).toEqual([]);
  });
});
