import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db/schema";
import { putSettings } from "@/lib/db/local-store";
import { saveDailySnapshotIfNeeded } from "@/lib/snapshot/snapshot-service";
import type { PortfolioVM } from "@/lib/portfolio/portfolio-service";

afterEach(async () => { await db.delete(); await db.open(); });

const TODAY = "2026-06-25";

const minimalVm: PortfolioVM = {
  rows: [],
  totalCostKrw: 1_000_000,
  totalValueKrw: 1_200_000,
  totalPnlKrw: 200_000,
  returnPct: 20,
  bySector: [{ sector: "반도체", valueKrw: 1_200_000, pct: 100 }],
  byHolding: [{ symbol: "005930", name: "삼성전자", valueKrw: 1_200_000, pct: 100 }],
};

describe("saveDailySnapshotIfNeeded", () => {
  it("두 번 호출해도 스냅샷이 1건만 저장된다 (date 키 덮어쓰기)", async () => {
    await saveDailySnapshotIfNeeded(minimalVm, TODAY);
    await saveDailySnapshotIfNeeded(minimalVm, TODAY);
    expect(await db.snapshots.count()).toBe(1);
  });

  it("settings에 lastSnapshotDate === today이면 false를 반환하고 스냅샷을 저장하지 않는다", async () => {
    await putSettings({
      id: "app",
      kdfSalt: "x",
      verifier: "y",
      schemaVersion: 1,
      lastSnapshotDate: TODAY,
    });
    const result = await saveDailySnapshotIfNeeded(minimalVm, TODAY);
    expect(result).toBe(false);
    expect(await db.snapshots.count()).toBe(0);
  });

  it("settings에 과거 lastSnapshotDate가 있으면 true를 반환하고 스냅샷을 저장하고 lastSnapshotDate를 갱신한다", async () => {
    await putSettings({
      id: "app",
      kdfSalt: "x",
      verifier: "y",
      schemaVersion: 1,
      lastSnapshotDate: "2026-06-24",
    });
    const result = await saveDailySnapshotIfNeeded(minimalVm, TODAY);
    expect(result).toBe(true);
    expect(await db.snapshots.count()).toBe(1);
    const updated = await db.settings.get("app");
    expect(updated?.lastSnapshotDate).toBe(TODAY);
  });

  it("bySectorJson이 vm.bySector와 round-trip으로 일치한다", async () => {
    await saveDailySnapshotIfNeeded(minimalVm, TODAY);
    const snapshot = await db.snapshots.get(TODAY);
    expect(JSON.parse(snapshot!.bySectorJson)).toEqual(minimalVm.bySector);
  });
});
