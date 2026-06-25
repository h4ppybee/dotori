const TOSS_BASE = process.env.TOSS_API_BASE ?? "https://openapi.tossinvest.com";

export interface NormalizedHolding {
  symbol: string;
  name: string;
  market: string;
  currency: "KRW" | "USD";
  quantity: number;
  avgBuyPrice: number;
  dailyPnl?: number;
}

export interface NormalizedPrice {
  symbol: string;
  currency: "KRW" | "USD";
  lastPrice: number;
}

export const normalizeAccounts = (raw: unknown): string[] =>
  ((raw as any)?.result ?? []).map((a: any) => a.accountSeq);

export const normalizeHoldings = (raw: unknown): NormalizedHolding[] =>
  ((raw as any)?.result ?? []).map((h: any) => ({
    symbol: h.symbol,
    name: h.name,
    market: h.market,
    currency: h.currency,
    quantity: Number(h.quantity),
    avgBuyPrice: Number(h.avgPrice),
    dailyPnl: h.dailyProfitLoss != null ? Number(h.dailyProfitLoss) : undefined,
  }));

export const normalizePrices = (raw: unknown): NormalizedPrice[] =>
  ((raw as any)?.result ?? []).map((p: any) => ({
    symbol: p.symbol,
    currency: p.currency,
    lastPrice: Number(p.price),
  }));

export class TossError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "TossError";
  }
}

async function tossGet(token: string, path: string, params?: Record<string, string>): Promise<unknown> {
  const url = new URL(`${TOSS_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new TossError(res.status, await res.text());
  }
  return res.json();
}

export async function exchangeToken(
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const res = await fetch(`${TOSS_BASE}/api/v2/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) {
    throw new TossError(res.status, await res.text());
  }
  const j: any = await res.json();
  return { accessToken: j.access_token, expiresIn: j.expires_in };
}

export async function fetchAccounts(token: string): Promise<string[]> {
  const raw = await tossGet(token, "/api/v1/accounts");
  return normalizeAccounts(raw);
}

export async function fetchHoldings(
  token: string,
  accountSeq: string,
): Promise<NormalizedHolding[]> {
  const url = new URL(`${TOSS_BASE}/api/v1/holdings`);
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Tossinvest-Account": accountSeq,
    },
  });
  if (!res.ok) {
    throw new TossError(res.status, await res.text());
  }
  const raw = await res.json();
  return normalizeHoldings(raw);
}

const PRICES_BATCH_MAX = 200;

export async function fetchPrices(
  token: string,
  symbols: { symbol: string; currency: string }[],
): Promise<NormalizedPrice[]> {
  const batches: { symbol: string; currency: string }[][] = [];
  for (let i = 0; i < symbols.length; i += PRICES_BATCH_MAX) {
    batches.push(symbols.slice(i, i + PRICES_BATCH_MAX));
  }

  const results: NormalizedPrice[] = [];
  for (const batch of batches) {
    const symbolList = batch.map((s) => s.symbol).join(",");
    const raw = await tossGet(token, "/api/v1/prices", { symbols: symbolList });
    results.push(...normalizePrices(raw));
  }
  return results;
}

export async function fetchExchangeRate(token: string): Promise<{ rate: number }> {
  const url = new URL(`${TOSS_BASE}/api/v1/exchange-rate`);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new TossError(res.status, await res.text());
  }
  const j: any = await res.json();
  return { rate: Number(j.result?.rate ?? j.rate) };
}
