import { describe, it, expect, afterEach, vi } from "vitest";
import { db } from "@/lib/db/schema";
import { refreshSavingsAccrual } from "@/lib/sync/refresh-savings";
import type { SavingsAccount } from "@/lib/types";

afterEach(async () => { vi.restoreAllMocks(); await db.delete(); await db.open(); });

const row = (over: Partial<SavingsAccount>): SavingsAccount => ({
  id: "x",
  category: "DEPOSIT",
  name: "적금",
  amount: 1_000_000,
  monthlyDeposit: 100_000,
  maturityDate: "2027-07-24",
  balanceAsOf: "2026-08-10",
  sortOrder: 0,
  updatedAt: 0,
  source: "MANUAL",
  ...over,
});

describe("refreshSavingsAccrual", () => {
  it("예적금 대상 행만 금액·기준일을 갱신하고 갱신 행 수를 돌려준다", async () => {
    await db.savings.bulkPut([
      row({ id: "dep" }),
      row({ id: "chk", category: "CHECKING" }),
      row({ id: "auto", source: "AUTO", connectionId: "c1" }),
    ]);

    const updated = await refreshSavingsAccrual({ today: "2026-10-14" });

    expect(updated).toBe(1);
    const dep = await db.savings.get("dep");
    expect(dep?.amount).toBe(1_200_000);
    expect(dep?.balanceAsOf).toBe("2026-10-14");
    expect(dep?.updatedAt).toBeGreaterThan(0);
    expect((await db.savings.get("chk"))?.amount).toBe(1_000_000);
    expect((await db.savings.get("auto"))?.balanceAsOf).toBe("2026-08-10");
  });

  it("같은 날 다시 실행하면 중복 증가하지 않는다", async () => {
    await db.savings.put(row({ id: "dep" }));
    await refreshSavingsAccrual({ today: "2026-10-14" });
    expect(await refreshSavingsAccrual({ today: "2026-10-14" })).toBe(0);
    expect((await db.savings.get("dep"))?.amount).toBe(1_200_000);
  });

  it("행 전체를 다시 쓰지 않고 금액·기준일·updatedAt만 갱신한다", async () => {
    await db.savings.bulkPut([row({ id: "dep", note: "메모", bank: "은행A" })]);
    const bulkPutSpy = vi.spyOn(db.savings, "bulkPut");

    expect(await refreshSavingsAccrual({ today: "2026-10-14" })).toBe(1);

    expect(bulkPutSpy).not.toHaveBeenCalled();
    const dep = await db.savings.get("dep");
    expect(dep).toMatchObject({ note: "메모", bank: "은행A", balanceAsOf: "2026-10-14" });
    expect(dep?.amount).toBeGreaterThan(1_000_000);
  });

  it("갱신과 동시에 들어온 다른 필드 변경을 잃지 않는다", async () => {
    await db.savings.bulkPut([row({ id: "dep" })]);

    const running = refreshSavingsAccrual({ today: "2026-10-14" });
    await db.savings.update("dep", { note: "동기화로 받은 메모" });
    await running;

    const dep = await db.savings.get("dep");
    expect(dep?.note).toBe("동기화로 받은 메모");
    expect(dep?.balanceAsOf).toBe("2026-10-14");
  });
});
