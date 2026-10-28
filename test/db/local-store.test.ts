import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db/schema";
import * as store from "@/lib/db/local-store";
import type { AssetSnapshot } from "@/lib/types";

afterEach(async () => { await db.delete(); await db.open(); });

const makeSnap = (id: string, createdAt: number): AssetSnapshot => ({
  id, createdAt, netWorthKrw: createdAt, totalAssetsKrw: createdAt, totalDebtKrw: 0,
  stocks: { totalValueKrw: 0, totalCostKrw: 0, totalPnlKrw: 0, returnPct: 0, rows: [] },
  pension: { totalValueKrw: 0, totalCostKrw: 0, totalPnlKrw: 0, returnPct: 0, rows: [] },
  coin: { totalValueKrw: 0, totalCostKrw: 0, totalPnlKrw: 0, returnPct: 0, rows: [] },
  savings: { totalKrw: 0, rows: [] },
  debt: { totalKrw: 0, rows: [] },
});

describe("local-store", () => {
  it("upserts a connection and lists it", async () => {
    const c = await store.upsertConnection({ memberId: "m1", type: "MANUAL", label: "미래에셋" });
    expect(c.id).toBeTruthy();
    const all = await store.listConnections();
    expect(all).toHaveLength(1);
  });

  it("upserts AUTO holdings by connectionId+symbol (no duplicate)", async () => {
    await store.upsertAutoHolding({ connectionId: "c1", market: "KOSPI", symbol: "005930",
      name: "삼성전자", currency: "KRW", quantity: 10, avgBuyPrice: 70000, sector: "반도체" });
    await store.upsertAutoHolding({ connectionId: "c1", market: "KOSPI", symbol: "005930",
      name: "삼성전자", currency: "KRW", quantity: 12, avgBuyPrice: 71000, sector: "반도체" });
    const holdings = await store.listHoldings();
    expect(holdings).toHaveLength(1);
    expect(holdings[0].quantity).toBe(12);
    expect(holdings[0].source).toBe("AUTO");
  });

  it("stores price with composite key", async () => {
    await store.putPrice({ symbol: "005930", currency: "KRW", lastPrice: 72000, asOf: 100 });
    const p = await store.getPrice("005930", "KRW");
    expect(p?.lastPrice).toBe(72000);
  });

  it("prunes AUTO holdings not in keepSymbols (keeps the rest)", async () => {
    await store.upsertAutoHolding({ connectionId: "c1", market: "KOSPI", symbol: "005930",
      name: "삼성전자", currency: "KRW", quantity: 10, avgBuyPrice: 70000, sector: "반도체" });
    await store.upsertAutoHolding({ connectionId: "c1", market: "KOSPI", symbol: "000660",
      name: "SK하이닉스", currency: "KRW", quantity: 5, avgBuyPrice: 100000, sector: "반도체" });
    // 다른 connection의 AUTO 행은 영향받지 않아야 한다.
    await store.upsertAutoHolding({ connectionId: "c2", market: "KOSPI", symbol: "035720",
      name: "카카오", currency: "KRW", quantity: 3, avgBuyPrice: 50000, sector: "IT" });
    // MANUAL 행도 영향받지 않아야 한다.
    await store.upsertManualHolding({ connectionId: "c1", market: "KOSPI", symbol: "068270",
      name: "셀트리온", sector: "바이오", currency: "KRW", quantity: 2, avgBuyPrice: 180000 });

    await store.pruneAutoHoldings("c1", ["005930"]);

    const holdings = await store.listHoldings();
    const symbols = holdings.map((h) => `${h.connectionId}:${h.symbol}:${h.source}`).sort();
    expect(symbols).toEqual(["c1:005930:AUTO", "c1:068270:MANUAL", "c2:035720:AUTO"]);
  });

  it("reads sector overrides as a map", async () => {
    await store.putSectorOverride("005930", "전자");
    expect(await store.getSectorOverrides()).toEqual({ "005930": "전자" });
  });

  it("privacyAmounts 플래그를 저장하고 다시 읽는다", async () => {
    await store.putSettings({
      id: "app",
      kdfSalt: "s",
      verifier: "v",
      schemaVersion: 1,
      privacyAmounts: true,
    });
    const got = await store.getSettings();
    expect(got?.privacyAmounts).toBe(true);
  });
});

describe("asset snapshot CRUD", () => {
  it("추가하고 createdAt 내림차순으로 limit 조회한다", async () => {
    await store.addAssetSnapshot(makeSnap("a", 1));
    await store.addAssetSnapshot(makeSnap("b", 3));
    await store.addAssetSnapshot(makeSnap("c", 2));
    const top2 = await store.listAssetSnapshots(2);
    expect(top2.map((s) => s.id)).toEqual(["b", "c"]);
    const all = await store.listAssetSnapshots();
    expect(all.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("단건 조회·삭제", async () => {
    await store.addAssetSnapshot(makeSnap("a", 1));
    expect((await store.getAssetSnapshot("a"))?.id).toBe("a");
    await store.deleteAssetSnapshot("a");
    expect(await store.getAssetSnapshot("a")).toBeUndefined();
  });
});

describe("replaceEnvelopeItems", () => {
  it("기존 항목을 지우고 시트 순서대로 넣으며, 프리셋에 없는 태그·통장만 커스텀에 더한다", async () => {
    await store.upsertEnvelopeItem({ profile: "wife", tag: "저축", account: "토스", name: "지울 항목", amountKrw: 1 });
    await store.putEnvelopeConfig({ id: "envelope", customTags: ["여행"], customAccounts: ["은행C"] });

    await store.replaceEnvelopeItems([
      { profile: "wife", tag: "저축", account: "신한", name: "청년도약적금", amountKrw: 500_000 },
      { profile: "husband", tag: "투자", account: "은행C", name: "적립식", amountKrw: 300_000, note: "메모" },
      { profile: "wife", tag: "경조사", account: "기타", name: "모임회비", amountKrw: 40_000 },
    ]);

    const items = (await store.listEnvelopeItems()).sort((a, b) =>
      a.profile.localeCompare(b.profile) || a.sortOrder - b.sortOrder);
    expect(items.map((i) => [i.profile, i.name, i.sortOrder, i.note])).toEqual([
      ["husband", "적립식", 0, "메모"],
      ["wife", "청년도약적금", 0, undefined],
      ["wife", "모임회비", 1, undefined],
    ]);
    expect(items.every((i) => i.id && i.createdAt > 0)).toBe(true);

    const cfg = await store.getEnvelopeConfig();
    expect(cfg.customTags).toEqual(["여행", "경조사"]);
    expect(cfg.customAccounts).toEqual(["은행C", "기타"]);
  });
});
