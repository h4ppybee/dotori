import type { HoldingSource } from "@/lib/types";

/**
 * 손익 계산 순수 함수들. 모두 보유 종목 자체 통화(own currency) 기준으로 동작한다.
 * 원화(KRW) 환산은 portfolio-service에서 이뤄진다.
 */

export function holdingValue({ quantity, price }: { quantity: number; price: number }): number {
  return quantity * price;
}

export function holdingCost({ quantity, avgBuyPrice }: { quantity: number; avgBuyPrice: number }): number {
  return quantity * avgBuyPrice;
}

export function holdingPnl({
  quantity,
  price,
  avgBuyPrice,
}: {
  quantity: number;
  price: number;
  avgBuyPrice: number;
}): number {
  return (price - avgBuyPrice) * quantity;
}

export function returnPct({ pnl, cost }: { pnl: number; cost: number }): number {
  if (cost > 0) {
    return (pnl / cost) * 100;
  }
  return 0;
}

interface DailyPnlInput {
  source: HoldingSource;
  tossDailyPnl?: number | null;
  price?: number;
  prevClose?: number;
  quantity?: number;
}

/**
 * 일간 손익을 보유 종목 자체 통화 기준으로 계산한다. (spec §3 세 갈래)
 * - AUTO: tossDailyPnl 그대로 (없으면 undefined)
 * - MANUAL + prevClose 있음: (price - prevClose) * quantity
 * - MANUAL + prevClose/price/quantity 중 하나라도 없음: undefined
 */
export function dailyPnl(input: DailyPnlInput): number | undefined {
  if (input.source === "AUTO") {
    if (input.tossDailyPnl == null) {
      return undefined;
    }
    return input.tossDailyPnl;
  }
  // MANUAL
  if (input.prevClose == null || input.price == null || input.quantity == null) {
    return undefined;
  }
  return (input.price - input.prevClose) * input.quantity;
}
