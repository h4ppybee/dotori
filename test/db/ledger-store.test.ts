import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db/schema";
import { listLedgerMonths, saveLedgerAmounts, saveLedgerMemo } from "@/lib/db/local-store";

afterEach(async () => { await db.delete(); await db.open(); });

describe("가계부 저장(ledgerMonths)", () => {
  it("행이 없는 달에 금액을 저장하면 메모 빈 문자열로 행을 만든다", async () => {
    await saveLedgerAmounts("2026-10", { "income.salary": 3_000_000 });
    const row = await db.ledgerMonths.get("2026-10");
    expect(row?.amounts).toEqual({ "income.salary": 3_000_000 });
    expect(row?.memo).toBe("");
    expect(row?.updatedAt).toBeGreaterThan(0);
  });

  it("행이 없는 달에 메모를 저장하면 빈 금액으로 행을 만든다", async () => {
    await saveLedgerMemo("2026-10", "이번 달은 외식이 많았다");
    const row = await db.ledgerMonths.get("2026-10");
    expect(row?.amounts).toEqual({});
    expect(row?.memo).toBe("이번 달은 외식이 많았다");
  });

  it("금액 저장은 메모를, 메모 저장은 금액을 지우지 않는다", async () => {
    await saveLedgerMemo("2026-10", "회고");
    await saveLedgerAmounts("2026-10", { "saving.deposit": 500_000 });
    expect((await db.ledgerMonths.get("2026-10"))?.memo).toBe("회고");

    await saveLedgerMemo("2026-10", "회고 수정");
    const row = await db.ledgerMonths.get("2026-10");
    expect(row?.amounts).toEqual({ "saving.deposit": 500_000 });
    expect(row?.memo).toBe("회고 수정");
  });

  it("금액 저장은 잎 값을 통째로 교체하고 0·빠진 잎은 키를 지우되, 알 수 없는 ID는 보존한다", async () => {
    await db.ledgerMonths.put({
      id: "2026-10",
      amounts: { "income.salary": 3_000_000, "income.side": 100_000, "legacy.x": 500 },
      memo: "",
      updatedAt: 1,
    });
    await saveLedgerAmounts("2026-10", { "income.salary": 0, "saving.invest": 200_000 });
    expect((await db.ledgerMonths.get("2026-10"))?.amounts).toEqual({
      "saving.invest": 200_000,
      "legacy.x": 500,
    });
  });

  it("인자에 섞인 잎이 아닌 키는 저장하지 않는다", async () => {
    await saveLedgerAmounts("2026-10", { "expense.variable.food": 100_000, "income.salary": 1_000_000 });
    expect((await db.ledgerMonths.get("2026-10"))?.amounts).toEqual({ "income.salary": 1_000_000 });
  });

  it("유한하지 않은 값은 건너뛰고 상한(1조 원)을 넘으면 자른다", async () => {
    await saveLedgerAmounts("2026-10", {
      "income.salary": Infinity,
      "income.side": NaN,
      "saving.invest": 5_000_000_000_000,
      "saving.deposit": 100_000,
    });
    expect((await db.ledgerMonths.get("2026-10"))?.amounts).toEqual({
      "saving.invest": 1_000_000_000_000,
      "saving.deposit": 100_000,
    });
  });

  it("금액도 메모도 없으면 행을 지운다", async () => {
    await saveLedgerAmounts("2026-10", { "income.salary": 1_000_000 });
    await saveLedgerAmounts("2026-10", {});
    expect(await db.ledgerMonths.get("2026-10")).toBeUndefined();

    await saveLedgerMemo("2026-09", "메모");
    await saveLedgerMemo("2026-09", "");
    expect(await db.ledgerMonths.get("2026-09")).toBeUndefined();
  });

  it("알 수 없는 ID만 남아 있으면 행을 지우지 않는다", async () => {
    await db.ledgerMonths.put({ id: "2026-10", amounts: { "legacy.x": 500 }, memo: "m", updatedAt: 1 });
    await saveLedgerMemo("2026-10", "");
    expect((await db.ledgerMonths.get("2026-10"))?.amounts).toEqual({ "legacy.x": 500 });
  });

  it("listLedgerMonths는 월 오름차순", async () => {
    await saveLedgerMemo("2026-10", "b");
    await saveLedgerMemo("2025-12", "a");
    await saveLedgerMemo("2026-02", "c");
    expect((await listLedgerMonths()).map((r) => r.id)).toEqual(["2025-12", "2026-02", "2026-10"]);
  });
});
