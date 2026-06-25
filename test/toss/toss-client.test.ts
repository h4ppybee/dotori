import { describe, it, expect } from "vitest";
import { normalizeHoldings, normalizePrices, normalizeAccounts } from "@/lib/toss/toss-client";

describe("toss-client normalizers", () => {
  it("normalizes accounts response", () => {
    const raw = { result: [{ accountSeq: "A1" }, { accountSeq: "A2" }] };
    expect(normalizeAccounts(raw)).toEqual(["A1", "A2"]);
  });
  it("normalizes holdings into domain shape", () => {
    const raw = { result: [{
      symbol: "005930", name: "삼성전자", market: "KOSPI", currency: "KRW",
      quantity: 10, avgPrice: 70000, dailyProfitLoss: 1500,
    }] };
    const out = normalizeHoldings(raw);
    expect(out[0]).toMatchObject({ symbol: "005930", quantity: 10, avgBuyPrice: 70000, dailyPnl: 1500 });
  });
  it("normalizes prices keyed by symbol", () => {
    const raw = { result: [{ symbol: "005930", currency: "KRW", price: 72000 }] };
    expect(normalizePrices(raw)).toEqual([{ symbol: "005930", currency: "KRW", lastPrice: 72000 }]);
  });
});
