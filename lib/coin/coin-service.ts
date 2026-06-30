import type { CoinHolding } from "@/lib/types";

/**
 * 코인 순수 계산. DB·비동기·Date 없이 입력만으로 결과를 낸다(KRW 고정).
 * 카테고리 없이 평탄. 평가금/손익은 수량×단가로 파생하고, 도넛은 종목별 비중.
 */

export interface CoinHoldingView extends CoinHolding {
  costKrw: number;
  valueKrw: number;
  pnlKrw: number;
  returnPct: number;
  pct: number; // 전체 평가금 대비 비중
}

export interface CoinVM {
  totalValueKrw: number;
  totalCostKrw: number;
  totalPnlKrw: number;
  returnPct: number;
  holdings: CoinHoldingView[]; // sortOrder 정렬, 파생값 포함
  count: number;
}

function returnPct(pnl: number, cost: number): number {
  return cost > 0 ? (pnl / cost) * 100 : 0;
}

export function buildCoinVM(coins: CoinHolding[]): CoinVM {
  const sorted = [...coins].sort((a, b) => a.sortOrder - b.sortOrder);
  const base = sorted.map((c) => {
    const costKrw = c.quantity * c.buyPrice;
    const valueKrw = c.quantity * c.currentPrice;
    const pnlKrw = valueKrw - costKrw;
    return { ...c, costKrw, valueKrw, pnlKrw, returnPct: returnPct(pnlKrw, costKrw) };
  });

  const totalValueKrw = base.reduce((s, v) => s + v.valueKrw, 0);
  const totalCostKrw = base.reduce((s, v) => s + v.costKrw, 0);
  const totalPnlKrw = totalValueKrw - totalCostKrw;

  const holdings: CoinHoldingView[] = base.map((v) => ({
    ...v,
    pct: totalValueKrw > 0 ? (v.valueKrw / totalValueKrw) * 100 : 0,
  }));

  return {
    totalValueKrw,
    totalCostKrw,
    totalPnlKrw,
    returnPct: returnPct(totalPnlKrw, totalCostKrw),
    holdings,
    count: coins.length,
  };
}
