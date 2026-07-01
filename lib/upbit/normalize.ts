export interface NormalizedUpbitCoin {
  market: string;
  currency: string;
  name: string;
  quantity: number;
  avgBuyPrice: number;
  currentPrice?: number; // ticker 성공분만. undefined면 upsert가 기존값 유지 → 신규는 avgBuyPrice 폴백
}

export interface NormalizedUpbitCash {
  currency: "KRW";
  amount: number;
}

export interface UpbitAccountsResult {
  coins: NormalizedUpbitCoin[];
  cash: NormalizedUpbitCash | null;
}

export type RawUpbitAccount = {
  currency?: string;
  balance?: string;
  locked?: string;
  avg_buy_price?: string;
  unit_currency?: string;
};

const toNum = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};

export function normalizeUpbitAccounts(
  rows: RawUpbitAccount[],
  names: Record<string, string>,
  prices: Record<string, number>,
): UpbitAccountsResult {
  let cash: NormalizedUpbitCash | null = null;
  const coins: NormalizedUpbitCoin[] = [];
  for (const r of rows) {
    const currency = String(r.currency ?? "");
    if (!currency) {
      continue;
    }
    const qty = toNum(r.balance) + toNum(r.locked);
    if (currency === "KRW") {
      if (qty > 0) {
        cash = { currency: "KRW", amount: qty };
      }
      continue;
    }
    if (qty <= 0) {
      continue;
    }
    const market = `KRW-${currency}`;
    coins.push({
      market,
      currency,
      name: names[market] ?? currency,
      quantity: qty,
      avgBuyPrice: toNum(r.avg_buy_price),
      currentPrice: market in prices ? prices[market] : undefined,
    });
  }
  return { coins, cash };
}
