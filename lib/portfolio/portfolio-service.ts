import type { Holding, PriceCache } from "@/lib/types";
import { resolveSector } from "@/lib/sector/sector-map";
import { mergeHoldings } from "@/lib/portfolio/merge";
import { toKrw } from "@/lib/portfolio/fx";
import { holdingValue, holdingCost, returnPct, dailyPnl } from "@/lib/portfolio/pnl";
import { bySector, byHolding } from "@/lib/portfolio/ratios";

export interface PortfolioRow {
  holding: Holding;
  priceKrw: number;
  valueKrw: number;
  costKrw: number;
  pnlKrw: number;
  returnPct: number;
  dailyPnlKrw?: number;
  sector: string;
}

export interface PortfolioVM {
  rows: PortfolioRow[];
  totalCostKrw: number;
  totalValueKrw: number;
  totalPnlKrw: number;
  returnPct: number;
  totalDailyPnlKrw?: number;
  bySector: { sector: string; valueKrw: number; pct: number }[];
  byHolding: { symbol: string; name: string; valueKrw: number; pct: number }[];
}

/**
 * 보유 종목 + 가격 캐시 + 환율 + 섹터 재정의를 합쳐 대시보드 뷰모델을 만든다. (spec §3, §4-1)
 * 순수 함수: DB·비동기·Date 없음. 6.1~6.4와 sector-map을 조합한다.
 */
export function buildPortfolio(input: {
  holdings: Holding[];
  prices: PriceCache[];
  fx?: { rate: number };
  sectorOverrides: Record<string, string>;
}): PortfolioVM {
  const { holdings, prices, fx, sectorOverrides } = input;
  const rate = fx?.rate;

  const priceBySymbolCcy = new Map<string, PriceCache>();
  for (const p of prices) {
    priceBySymbolCcy.set(`${p.symbol}|${p.currency}`, p);
  }

  const ordered = mergeHoldings(holdings);

  const rows: PortfolioRow[] = ordered.map((holding) => {
    const cache = priceBySymbolCcy.get(`${holding.symbol}|${holding.currency}`);

    // 가격 결정(자체 통화): priceCache.lastPrice > manualPrice > avgBuyPrice
    let resolvedPrice: number;
    if (cache != null) {
      resolvedPrice = cache.lastPrice;
    } else if (holding.manualPrice != null) {
      resolvedPrice = holding.manualPrice;
    } else {
      resolvedPrice = holding.avgBuyPrice;
    }

    const priceKrw = toKrw(resolvedPrice, holding.currency, rate);
    const valueKrw = toKrw(
      holdingValue({ quantity: holding.quantity, price: resolvedPrice }),
      holding.currency,
      rate,
    );
    const costKrw = toKrw(
      holdingCost({ quantity: holding.quantity, avgBuyPrice: holding.avgBuyPrice }),
      holding.currency,
      rate,
    );
    const pnlKrw = valueKrw - costKrw;

    const sector = resolveSector(holding.symbol, sectorOverrides);

    const dailyOwn = dailyPnl({
      source: holding.source,
      tossDailyPnl: holding.tossDailyPnl,
      price: resolvedPrice,
      prevClose: cache?.prevClose,
      quantity: holding.quantity,
    });

    const row: PortfolioRow = {
      holding,
      priceKrw,
      valueKrw,
      costKrw,
      pnlKrw,
      returnPct: returnPct({ pnl: pnlKrw, cost: costKrw }),
      sector,
    };

    if (dailyOwn != null) {
      row.dailyPnlKrw = toKrw(dailyOwn, holding.currency, rate);
    }

    return row;
  });

  const totalCostKrw = rows.reduce((s, r) => s + r.costKrw, 0);
  const totalValueKrw = rows.reduce((s, r) => s + r.valueKrw, 0);
  const totalPnlKrw = totalValueKrw - totalCostKrw;

  const dailyRows = rows.filter((r) => r.dailyPnlKrw != null);
  let totalDailyPnlKrw: number | undefined;
  if (dailyRows.length > 0) {
    totalDailyPnlKrw = dailyRows.reduce((s, r) => s + (r.dailyPnlKrw as number), 0);
  }

  return {
    rows,
    totalCostKrw,
    totalValueKrw,
    totalPnlKrw,
    returnPct: returnPct({ pnl: totalPnlKrw, cost: totalCostKrw }),
    totalDailyPnlKrw,
    bySector: bySector(rows.map((r) => ({ sector: r.sector, valueKrw: r.valueKrw }))),
    byHolding: byHolding(
      rows.map((r) => ({ symbol: r.holding.symbol, name: r.holding.name, valueKrw: r.valueKrw })),
    ),
  };
}
