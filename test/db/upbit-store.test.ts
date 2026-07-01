import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { db } from "@/lib/db/schema";
import {
  upsertAutoCoin, pruneAutoCoins, listCoin,
  upsertAutoSavings, pruneAutoSavings, listSavings, upsertCoin,
} from "@/lib/db/local-store";

beforeEach(async () => {
  await db.coin.clear();
  await db.savings.clear();
});

describe("upsertAutoCoin / pruneAutoCoins", () => {
  it("AUTO 코인을 안정적 id로 upsert하고, 다시 넣으면 수량/현재가만 갱신한다", async () => {
    await upsertAutoCoin({ connectionId: "c1", market: "KRW-BTC", name: "비트코인", quantity: 0.1, buyPrice: 5000, currentPrice: 6000 });
    await upsertAutoCoin({ connectionId: "c1", market: "KRW-BTC", name: "비트코인", quantity: 0.2, buyPrice: 5000, currentPrice: 7000 });
    const rows = await listCoin();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("upbit:c1:KRW-BTC");
    expect(rows[0].source).toBe("AUTO");
    expect(rows[0].quantity).toBe(0.2);
    expect(rows[0].currentPrice).toBe(7000);
  });

  it("currentPrice 미지정(ticker 실패) 시 기존 현재가를 유지한다", async () => {
    await upsertAutoCoin({ connectionId: "c1", market: "KRW-BTC", name: "비트코인", quantity: 0.1, buyPrice: 5000, currentPrice: 6000 });
    await upsertAutoCoin({ connectionId: "c1", market: "KRW-BTC", name: "비트코인", quantity: 0.1, buyPrice: 5000 });
    const rows = await listCoin();
    expect(rows[0].currentPrice).toBe(6000);
  });

  it("신규 행에 currentPrice가 없으면 buyPrice로 폴백한다", async () => {
    await upsertAutoCoin({ connectionId: "c1", market: "KRW-XRP", name: "리플", quantity: 10, buyPrice: 700 });
    const rows = await listCoin();
    const xrp = rows.find((r) => r.market === "KRW-XRP")!;
    expect(xrp.currentPrice).toBe(700);
  });

  it("prune은 해당 연결의 AUTO 행 중 seen에 없는 것만 지우고 MANUAL·타 연결은 보존한다", async () => {
    await upsertAutoCoin({ connectionId: "c1", market: "KRW-BTC", name: "비트코인", quantity: 1, buyPrice: 1, currentPrice: 1 });
    await upsertAutoCoin({ connectionId: "c1", market: "KRW-ETH", name: "이더리움", quantity: 1, buyPrice: 1, currentPrice: 1 });
    await upsertAutoCoin({ connectionId: "c2", market: "KRW-BTC", name: "비트코인", quantity: 1, buyPrice: 1, currentPrice: 1 });
    await upsertCoin({ name: "손입력", quantity: 1, buyPrice: 1, currentPrice: 1 });
    await pruneAutoCoins("c1", ["KRW-BTC"]);
    const rows = await listCoin();
    expect(rows.find((r) => r.market === "KRW-ETH" && r.connectionId === "c1")).toBeUndefined();
    expect(rows.find((r) => r.id === "upbit:c1:KRW-BTC")).toBeDefined();
    expect(rows.find((r) => r.id === "upbit:c2:KRW-BTC")).toBeDefined();
    expect(rows.find((r) => r.name === "손입력")).toBeDefined();
  });
});

describe("upsertAutoSavings / pruneAutoSavings", () => {
  it("업비트 KRW 예수금을 연결당 1개 AUTO 현금성 행으로 upsert한다", async () => {
    await upsertAutoSavings({ connectionId: "c1", amount: 100000 });
    await upsertAutoSavings({ connectionId: "c1", amount: 250000 });
    const rows = await listSavings();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("upbit-krw:c1");
    expect(rows[0].source).toBe("AUTO");
    expect(rows[0].category).toBe("CHECKING");
    expect(rows[0].currency).toBe("KRW");
    expect(rows[0].amount).toBe(250000);
  });

  it("pruneAutoSavings는 해당 연결 AUTO 예수금 행만 삭제한다", async () => {
    await upsertAutoSavings({ connectionId: "c1", amount: 100000 });
    await pruneAutoSavings("c1");
    expect(await listSavings()).toHaveLength(0);
  });
});
