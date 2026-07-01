import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db/schema";
import { importAll } from "@/lib/backup/backup";

afterEach(async () => {
  await db.delete();
  await db.open();
});

describe("importAll: coin/savings source backfill", () => {
  it("v5 이전 백업(source 필드 없음)을 복원하면 coin/savings 행의 source가 MANUAL로 채워진다", async () => {
    const legacyPayload = JSON.stringify({
      schemaVersion: 2,
      exportedAt: Date.now(),
      data: {
        savings: [
          { id: "s1", category: "DEPOSIT", name: "청약", amount: 1000, sortOrder: 0, updatedAt: 1 },
        ],
        coin: [
          { id: "c1", name: "비트코인", quantity: 0.02, buyPrice: 100, currentPrice: 80, sortOrder: 0, updatedAt: 1 },
        ],
      },
    });

    await importAll(legacyPayload, { mode: "overwrite" });

    const savings = await db.savings.get("s1");
    const coin = await db.coin.get("c1");
    expect(savings?.source).toBe("MANUAL");
    expect(coin?.source).toBe("MANUAL");
  });

  it("source가 이미 있는 백업 행은 그대로 유지된다", async () => {
    const payload = JSON.stringify({
      schemaVersion: 2,
      exportedAt: Date.now(),
      data: {
        savings: [
          { id: "s2", category: "DEPOSIT", name: "업비트 원화", amount: 500, sortOrder: 0, updatedAt: 1,
            source: "AUTO", connectionId: "conn1" },
        ],
        coin: [
          { id: "c2", name: "이더리움", quantity: 1, buyPrice: 200, currentPrice: 250, sortOrder: 0, updatedAt: 1,
            source: "AUTO", connectionId: "conn1" },
        ],
      },
    });

    await importAll(payload, { mode: "overwrite" });

    const savings = await db.savings.get("s2");
    const coin = await db.coin.get("c2");
    expect(savings?.source).toBe("AUTO");
    expect(coin?.source).toBe("AUTO");
  });
});
