import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db/schema";
import { captureAssetSnapshot } from "@/lib/snapshot/capture";

afterEach(async () => { await db.delete(); await db.open(); });

describe("captureAssetSnapshot", () => {
  it("DB의 현재 상태로 스냅샷을 만들어 저장한다", async () => {
    await db.savings.put({
      id: "s1", category: "DEPOSIT", name: "청년도약", amount: 1_000_000,
      sortOrder: 0, updatedAt: 1, source: "MANUAL",
    });
    await db.debts.put({
      id: "d1", category: "CREDIT", name: "신용대출", balance: 300_000,
      sortOrder: 0, updatedAt: 1,
    });
    const snap = await captureAssetSnapshot({ id: "cap1", createdAt: 42 });
    expect(snap.netWorthKrw).toBe(700_000);
    const stored = await db.assetSnapshots.get("cap1");
    expect(stored?.createdAt).toBe(42);
    expect(stored?.savings.rows).toEqual([{ name: "청년도약", amountKrw: 1_000_000 }]);
    expect(stored?.debt.totalKrw).toBe(300_000);
  });

  it("빈 DB에서도 0원 스냅샷을 저장한다", async () => {
    const snap = await captureAssetSnapshot({ id: "cap0", createdAt: 1 });
    expect(snap.netWorthKrw).toBe(0);
    expect(await db.assetSnapshots.count()).toBe(1);
  });
});
