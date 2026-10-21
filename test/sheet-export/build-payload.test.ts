import { describe, it, expect } from "vitest";
import { buildPortfolio } from "@/lib/portfolio/portfolio-service";
import { buildSavingsVM } from "@/lib/savings/savings-service";
import { buildPensionVM } from "@/lib/pension/pension-service";
import { buildCoinVM } from "@/lib/coin/coin-service";
import { buildDebtVM } from "@/lib/debt/debt-service";
import { buildSheetPayload, SHEET_TABS } from "@/lib/sheet-export/build-payload";
import type { EnvelopeItem, Holding } from "@/lib/types";

const empty = () => ({
  portfolio: buildPortfolio({ holdings: [], prices: [], sectorOverrides: {} }),
  savings: buildSavingsVM([], undefined),
  pension: buildPensionVM([]),
  coin: buildCoinVM([]),
  debt: buildDebtVM([]),
  envelopeItems: [] as EnvelopeItem[],
  connectionLabels: {} as Record<string, string>,
  exportedAt: "2026.10.21 09:30",
});

const tab = (tabs: ReturnType<typeof buildSheetPayload>, name: string) =>
  tabs.find((t) => t.name === name)!;

const samsung: Holding = {
  id: "h1", connectionId: "c1", market: "KRX", symbol: "005930", name: "삼성전자",
  sector: "미분류", currency: "KRW", quantity: 10, avgBuyPrice: 70_000,
  source: "MANUAL", updatedAt: 1,
};

describe("buildSheetPayload", () => {
  it("빈 데이터면 4개 탭 모두 헤더만, meta는 0원", () => {
    const tabs = buildSheetPayload(empty());
    expect(tabs.map((t) => t.name)).toEqual([
      SHEET_TABS.assets, SHEET_TABS.debts, SHEET_TABS.envelope, SHEET_TABS.meta,
    ]);
    expect(tab(tabs, SHEET_TABS.assets).rows).toHaveLength(1);
    expect(tab(tabs, SHEET_TABS.debts).rows).toHaveLength(1);
    expect(tab(tabs, SHEET_TABS.envelope).rows).toHaveLength(1);
    expect(tab(tabs, SHEET_TABS.meta).rows).toEqual([
      ["내보낸 시각", "총자산", "총부채", "순자산"],
      ["2026.10.21 09:30", 0, 0, 0],
    ]);
  });

  it("주식 행: 증권사 라벨·종목코드 문자열·수익률 소수", () => {
    const input = empty();
    input.portfolio = buildPortfolio({
      holdings: [samsung],
      prices: [{ key: "005930|KRW", symbol: "005930", currency: "KRW", lastPrice: 80_000, asOf: 1 }],
      sectorOverrides: {},
    });
    input.connectionLabels = { c1: "토스" };
    const row = tab(buildSheetPayload(input), SHEET_TABS.assets).rows[1];
    const vmRow = input.portfolio.rows[0];
    expect(row).toEqual([
      "주식", "KRX", "삼성전자", "토스", "005930", 10,
      700_000, 800_000, 100_000, vmRow.returnPct / 100, "KRW", vmRow.sector,
    ]);
    expect(typeof row[4]).toBe("string");
  });

  it("USD 주식·저축은 원화 환산값으로 나간다", () => {
    const input = empty();
    input.portfolio = buildPortfolio({
      holdings: [{ ...samsung, id: "h2", market: "NASDAQ", symbol: "QQQM", name: "QQQM",
        currency: "USD", quantity: 2, avgBuyPrice: 100 }],
      prices: [{ key: "QQQM|USD", symbol: "QQQM", currency: "USD", lastPrice: 150, asOf: 1 }],
      fx: { rate: 1_000 },
      sectorOverrides: {},
    });
    input.savings = buildSavingsVM([{
      id: "s1", category: "CHECKING", name: "달러 통장", bank: "토스뱅크", amount: 10,
      currency: "USD", sortOrder: 0, updatedAt: 1, source: "MANUAL",
    }], 1_000);
    const rows = tab(buildSheetPayload(input), SHEET_TABS.assets).rows;
    expect(rows[1][7]).toBe(300_000);
    expect(rows[1][10]).toBe("USD");
    expect(rows[2]).toEqual(["저축", "입출금", "달러 통장", "토스뱅크", "", "", "", 10_000, "", "", "USD", ""]);
  });

  it("연금·코인 행 매핑과 자산군 순서(주식→저축→연금→코인)", () => {
    const input = empty();
    input.pension = buildPensionVM([{
      id: "p1", category: "PERSONAL", name: "TIGER 미국S&P500", symbol: "360750",
      company: "미래에셋", quantity: 10, buyPrice: 20_000, currentPrice: 25_000,
      sortOrder: 0, updatedAt: 1,
    }]);
    input.coin = buildCoinVM([{
      id: "k1", name: "비트코인", exchange: "업비트", quantity: 0.5, buyPrice: 100_000_000,
      currentPrice: 120_000_000, sortOrder: 0, updatedAt: 1, source: "AUTO", market: "KRW-BTC",
    }]);
    const rows = tab(buildSheetPayload(input), SHEET_TABS.assets).rows;
    expect(rows[1]).toEqual(["연금", "개인연금", "TIGER 미국S&P500", "미래에셋", "360750", 10,
      200_000, 250_000, 50_000, 0.25, "KRW", ""]);
    expect(rows[2]).toEqual(["코인", "", "비트코인", "업비트", "KRW-BTC", 0.5,
      50_000_000, 60_000_000, 10_000_000, 0.2, "KRW", ""]);
  });

  it("부채 행: 카테고리 라벨·금리 소수·빈 값은 빈 문자열", () => {
    const input = empty();
    input.debt = buildDebtVM([{
      id: "d1", category: "JEONSE", name: "전세대출", lender: "국민", balance: 200_000_000,
      interestRate: 3.475, maturityDate: "2028-04-03", sortOrder: 0, updatedAt: 1,
    }]);
    const rows = tab(buildSheetPayload(input), SHEET_TABS.debts).rows;
    expect(rows[1]).toEqual(["전세자금", "전세대출", "국민", 200_000_000, 0.03475, "", "2028-04-03", ""]);
  });

  it("통장 쪼개기: 아내 먼저, 프로필 내 sortOrder 순, 라벨 변환", () => {
    const input = empty();
    input.envelopeItems = [
      { id: "e1", profile: "husband", tag: "투자", account: "기타", name: "투자", amountKrw: 1_200_000, sortOrder: 0, createdAt: 1 },
      { id: "e2", profile: "wife", tag: "저축", account: "신한", name: "청년도약", amountKrw: 700_000, sortOrder: 1, createdAt: 1, note: "자동이체" },
      { id: "e3", profile: "wife", tag: "생활비", account: "토스", name: "용돈", amountKrw: 200_000, sortOrder: 0, createdAt: 1 },
    ];
    const rows = tab(buildSheetPayload(input), SHEET_TABS.envelope).rows;
    expect(rows.slice(1)).toEqual([
      ["아내", "생활비", "토스", "용돈", 200_000, ""],
      ["아내", "저축", "신한", "청년도약", 700_000, "자동이체"],
      ["남편", "투자", "기타", "투자", 1_200_000, ""],
    ]);
  });

  it("meta: 총자산 = 4개 자산군 합, 순자산 = 총자산 − 부채", () => {
    const input = empty();
    input.savings = buildSavingsVM([{
      id: "s1", category: "DEPOSIT", name: "청년도약", amount: 1_000_000,
      sortOrder: 0, updatedAt: 1, source: "MANUAL",
    }], undefined);
    input.debt = buildDebtVM([{ id: "d1", category: "CREDIT", name: "신용", balance: 300_000, sortOrder: 0, updatedAt: 1 }]);
    const meta = tab(buildSheetPayload(input), SHEET_TABS.meta).rows[1];
    expect(meta).toEqual(["2026.10.21 09:30", 1_000_000, 300_000, 700_000]);
  });

  it("모든 셀은 string 또는 number", () => {
    const input = empty();
    input.portfolio = buildPortfolio({ holdings: [samsung], prices: [], sectorOverrides: {} });
    for (const t of buildSheetPayload(input)) {
      for (const r of t.rows) {
        for (const c of r) {
          expect(["string", "number"]).toContain(typeof c);
        }
      }
    }
  });
});
