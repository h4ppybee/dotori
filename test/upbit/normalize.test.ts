import { describe, it, expect } from "vitest";
import { normalizeUpbitAccounts } from "@/lib/upbit/normalize";

const rows = [
  { currency: "KRW", balance: "150000.0", locked: "50000.0", avg_buy_price: "0", unit_currency: "KRW" },
  { currency: "BTC", balance: "0.1", locked: "0.0", avg_buy_price: "50000000", unit_currency: "KRW" },
  { currency: "ETH", balance: "1.0", locked: "0.5", avg_buy_price: "3000000", unit_currency: "KRW" },
];
const names = { "KRW-BTC": "비트코인", "KRW-ETH": "이더리움" };
const prices = { "KRW-BTC": 60000000, "KRW-ETH": 3500000 };

describe("normalizeUpbitAccounts", () => {
  it("KRW는 예수금(balance+locked), 나머지는 코인으로 분리한다", () => {
    const { coins, cash } = normalizeUpbitAccounts(rows, names, prices);
    expect(cash).toEqual({ currency: "KRW", amount: 200000 });
    expect(coins).toHaveLength(2);
    const btc = coins.find((c) => c.market === "KRW-BTC")!;
    expect(btc).toMatchObject({ currency: "BTC", name: "비트코인", quantity: 0.1, avgBuyPrice: 50000000, currentPrice: 60000000 });
    const eth = coins.find((c) => c.market === "KRW-ETH")!;
    expect(eth.quantity).toBe(1.5); // balance + locked
  });

  it("현재가 조회 실패(price 없음) 시 currentPrice는 undefined로 둔다(폴백은 upsert 단계 책임)", () => {
    const { coins } = normalizeUpbitAccounts([rows[1]], names, {});
    expect(coins[0].currentPrice).toBeUndefined();
  });

  it("한글명 매핑 실패 시 currency 코드를 이름으로 쓴다", () => {
    const { coins } = normalizeUpbitAccounts([rows[1]], {}, prices);
    expect(coins[0].name).toBe("BTC");
  });

  it("예수금이 없으면 cash는 null", () => {
    const { cash } = normalizeUpbitAccounts([rows[1]], names, prices);
    expect(cash).toBeNull();
  });

  it("수량 0 자산은 코인에서 제외한다", () => {
    const zero = [{ currency: "XRP", balance: "0", locked: "0", avg_buy_price: "0", unit_currency: "KRW" }];
    const { coins } = normalizeUpbitAccounts(zero, names, prices);
    expect(coins).toHaveLength(0);
  });
});
