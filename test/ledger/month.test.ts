import { describe, it, expect } from "vitest";
import { addMonths, currentMonth, formatMonthTitle, monthRange } from "@/lib/ledger/month";

describe("월 헬퍼", () => {
  it("addMonths는 연도 경계를 넘는다", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2025-12", 1)).toBe("2026-01");
    expect(addMonths("2026-10", -12)).toBe("2025-10");
    expect(addMonths("2026-10", 0)).toBe("2026-10");
  });

  it("monthRange는 양 끝을 포함한 연속 월", () => {
    expect(monthRange("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(monthRange("2026-03", "2026-03")).toEqual(["2026-03"]);
    expect(monthRange("2026-04", "2026-03")).toEqual([]);
  });

  it("formatMonthTitle", () => {
    expect(formatMonthTitle("2026-10")).toBe("2026년 10월");
    expect(formatMonthTitle("2026-01")).toBe("2026년 1월");
  });

  it("currentMonth는 주입한 Date의 로컬 연·월", () => {
    expect(currentMonth(new Date(2026, 9, 30))).toBe("2026-10");
    expect(currentMonth(new Date(2026, 0, 1))).toBe("2026-01");
  });
});
