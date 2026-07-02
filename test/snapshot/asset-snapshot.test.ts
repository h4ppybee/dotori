import { describe, it, expect } from "vitest";
import { buildAssetSnapshot } from "@/lib/snapshot/asset-snapshot";
import { buildPortfolio } from "@/lib/portfolio/portfolio-service";
import { buildSavingsVM } from "@/lib/savings/savings-service";
import { buildPensionVM } from "@/lib/pension/pension-service";
import { buildCoinVM } from "@/lib/coin/coin-service";
import { buildDebtVM } from "@/lib/debt/debt-service";
import type { Holding, PriceCache, SavingsAccount, PensionAccount, CoinHolding, LoanAccount } from "@/lib/types";

const holding: Holding = {
  id: "h1", connectionId: "c1", market: "KOSPI", symbol: "005930", name: "삼성전자",
  sector: "반도체", currency: "KRW", quantity: 10, avgBuyPrice: 70_000,
  source: "MANUAL", updatedAt: 1,
};
const price: PriceCache = { key: "005930|KRW", symbol: "005930", currency: "KRW", lastPrice: 80_000, asOf: 1 };
const saving: SavingsAccount = {
  id: "s1", category: "DEPOSIT", name: "청년도약", amount: 1_000_000,
  sortOrder: 0, updatedAt: 1, source: "MANUAL",
};
const usdSaving: SavingsAccount = {
  id: "s2", category: "ETC", name: "달러예금", amount: 100, currency: "USD",
  sortOrder: 0, updatedAt: 1, source: "MANUAL",
};
const pensionAcc: PensionAccount = {
  id: "p1", category: "PERSONAL", name: "TIGER 미국S&P500", quantity: 5,
  buyPrice: 10_000, currentPrice: 12_000, sortOrder: 0, updatedAt: 1,
};
const coin: CoinHolding = {
  id: "cn1", name: "비트코인", quantity: 0.1, buyPrice: 100_000_000,
  currentPrice: 120_000_000, sortOrder: 0, updatedAt: 1, source: "MANUAL",
};
const loan: LoanAccount = {
  id: "d1", category: "CREDIT", name: "신용대출", balance: 5_000_000,
  sortOrder: 0, updatedAt: 1,
};

describe("buildAssetSnapshot", () => {
  it("VM 5종을 스냅샷으로 직렬화한다 (행 매핑·합계·순자산)", () => {
    const snap = buildAssetSnapshot({
      id: "snap1", createdAt: 1_000,
      portfolio: buildPortfolio({ holdings: [holding], prices: [price], sectorOverrides: {} }),
      savings: buildSavingsVM([saving, usdSaving], 1_400),
      pension: buildPensionVM([pensionAcc]),
      coin: buildCoinVM([coin]),
      debt: buildDebtVM([loan]),
    });
    expect(snap.id).toBe("snap1");
    expect(snap.createdAt).toBe(1_000);
    // 주식: 10주 × 80,000 = 800,000 / cost 700,000 / pnl 100,000
    expect(snap.stocks.rows).toEqual([{
      name: "삼성전자", quantity: 10, costKrw: 700_000, valueKrw: 800_000,
      pnlKrw: 100_000, returnPct: expect.closeTo(14.2857, 3),
    }]);
    // 저축: KRW 1,000,000 + USD 100×1,400 = 1,140,000
    expect(snap.savings.totalKrw).toBe(1_140_000);
    expect(snap.savings.rows).toEqual([
      { name: "청년도약", amountKrw: 1_000_000 },
      { name: "달러예금", amountKrw: 140_000 },
    ]);
    // 연금: 5 × 12,000 = 60,000 / 코인: 0.1 × 120,000,000 = 12,000,000
    expect(snap.pension.totalValueKrw).toBe(60_000);
    expect(snap.coin.rows[0]).toMatchObject({ name: "비트코인", valueKrw: 12_000_000, pnlKrw: 2_000_000 });
    // 부채
    expect(snap.debt).toEqual({ totalKrw: 5_000_000, rows: [{ name: "신용대출", amountKrw: 5_000_000 }] });
    // 합계: 800,000 + 1,140,000 + 60,000 + 12,000,000 = 14,000,000
    expect(snap.totalAssetsKrw).toBe(14_000_000);
    expect(snap.totalDebtKrw).toBe(5_000_000);
    expect(snap.netWorthKrw).toBe(9_000_000);
  });

  it("VM이 undefined면 빈 섹션으로 폴백한다", () => {
    const snap = buildAssetSnapshot({ id: "empty", createdAt: 1 });
    expect(snap.stocks).toEqual({ totalValueKrw: 0, totalCostKrw: 0, totalPnlKrw: 0, returnPct: 0, rows: [] });
    expect(snap.savings).toEqual({ totalKrw: 0, rows: [] });
    expect(snap.debt).toEqual({ totalKrw: 0, rows: [] });
    expect(snap.totalAssetsKrw).toBe(0);
    expect(snap.netWorthKrw).toBe(0);
  });

  it("부채가 없으면 순자산 = 자산 총액", () => {
    const snap = buildAssetSnapshot({
      id: "nodebt", createdAt: 1,
      savings: buildSavingsVM([saving]),
    });
    expect(snap.netWorthKrw).toBe(snap.totalAssetsKrw);
    expect(snap.totalAssetsKrw).toBe(1_000_000);
  });
});
