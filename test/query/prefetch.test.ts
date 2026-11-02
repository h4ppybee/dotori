import { describe, it, expect, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db/schema";
import { prefetchAppData } from "@/lib/query/prefetch";
import { RECENT_SNAPSHOT_LIMIT } from "@/lib/query/use-asset-snapshots";
import { putSettings } from "@/lib/db/local-store";

afterEach(async () => {
  await db.delete();
  await db.open();
});

describe("prefetchAppData", () => {
  it("모든 탭이 첫 렌더에 쓰는 쿼리를 캐시에 채운다", async () => {
    // 잠금이 풀린 시점에는 설정 행이 항상 있다
    await putSettings({ id: "app", kdfSalt: "c2FsdA==", verifier: "aXY=.Y3Q=", schemaVersion: 1, lockType: "pin" });
    const qc = new QueryClient();
    await prefetchAppData(qc);
    const keys = [
      ["portfolio"],
      ["savings"],
      ["pension"],
      ["coin"],
      ["debts"],
      ["goal"],
      ["envelopeItems"],
      ["envelopeConfig"],
      ["assetSnapshots", RECENT_SNAPSHOT_LIMIT],
      ["settings"],
      ["biometric"],
      ["biometric-available"],
      ["sheet-export-config"],
      ["ledgerMonths"],
    ];
    for (const key of keys) {
      expect(qc.getQueryState(key)?.status, JSON.stringify(key)).toBe("success");
    }
  });

  it("일부 조회가 실패해도 throw하지 않는다", async () => {
    const qc = new QueryClient();
    db.close();
    await expect(prefetchAppData(qc)).resolves.toBeUndefined();
    await db.open();
  });
});
