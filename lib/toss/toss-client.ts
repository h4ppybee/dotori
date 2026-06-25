const TOSS_BASE = process.env.TOSS_API_BASE ?? "https://openapi.tossinvest.com";

// ── injectable sleep (테스트에서 setSleep으로 교체 가능) ──────────────────────
let _sleep: (ms: number) => Promise<void> = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function setSleep(fn: (ms: number) => Promise<void>): void {
  _sleep = fn;
}

const DEFAULT_RETRY_AFTER_MS = 500;

// ── numeric guard helper ──────────────────────────────────────────────────────
function toNum(v: unknown): number | null {
  if (v == null) {
    return null;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) {
    return null;
  }
  return n;
}

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

// 토스 API 응답 원시 타입 (신뢰 경계: unknown → 구조 좁히기용)
type RawRow = Record<string, unknown>;
interface RawList {
  result?: unknown[];
}

function toRawList(raw: unknown): unknown[] {
  const r = raw as RawList;
  return Array.isArray(r?.result) ? r.result : [];
}

export const normalizeAccounts = (raw: unknown): string[] =>
  toRawList(raw).map((a) => String((a as RawRow).accountSeq ?? "")).filter(Boolean);

export const normalizeHoldings = (raw: unknown): NormalizedHolding[] => {
  const rows: NormalizedHolding[] = [];
  for (const item of toRawList(raw)) {
    const h = item as RawRow;
    const currency = h.currency;
    if (currency !== "KRW" && currency !== "USD") {
      continue;
    }
    const quantity = toNum(h.quantity);
    if (quantity === null) {
      continue;
    }
    const avgBuyPrice = toNum(h.avgPrice);
    if (avgBuyPrice === null) {
      continue;
    }
    const dailyPnl =
      h.dailyProfitLoss != null ? toNum(h.dailyProfitLoss) ?? undefined : undefined;
    rows.push({
      symbol: String(h.symbol ?? ""),
      name: String(h.name ?? ""),
      market: String(h.market ?? ""),
      currency,
      quantity,
      avgBuyPrice,
      dailyPnl,
    });
  }
  return rows;
};

export const normalizePrices = (raw: unknown): NormalizedPrice[] => {
  const rows: NormalizedPrice[] = [];
  for (const item of toRawList(raw)) {
    const p = item as RawRow;
    const currency = p.currency;
    if (currency !== "KRW" && currency !== "USD") {
      continue;
    }
    const lastPrice = toNum(p.price);
    if (lastPrice === null) {
      continue;
    }
    rows.push({ symbol: String(p.symbol ?? ""), currency, lastPrice });
  }
  return rows;
};

export class TossError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "TossError";
  }
}

// ── 429 재시도 헬퍼 ────────────────────────────────────────────────────────────
async function waitForRateLimit(res: Response): Promise<void> {
  const retryAfter = res.headers.get("Retry-After");
  const ms = retryAfter ? parseFloat(retryAfter) * 1000 : DEFAULT_RETRY_AFTER_MS;
  await _sleep(ms);
}

async function tossGet(token: string, path: string, params?: Record<string, string>): Promise<unknown> {
  const url = new URL(`${TOSS_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const doFetch = () =>
    fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

  const res = await doFetch();
  if (res.status === 429) {
    await waitForRateLimit(res);
    const retry = await doFetch();
    if (!retry.ok) {
      throw new TossError(retry.status, await retry.text());
    }
    return retry.json();
  }
  if (!res.ok) {
    throw new TossError(res.status, await res.text());
  }
  return res.json();
}

export async function exchangeToken(
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const doFetch = () =>
    fetch(`${TOSS_BASE}/api/v2/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

  const res = await doFetch();
  if (res.status === 429) {
    await waitForRateLimit(res);
    const retry = await doFetch();
    if (!retry.ok) {
      throw new TossError(retry.status, await retry.text());
    }
    const j = (await retry.json()) as Record<string, unknown>;
    return { accessToken: String(j.access_token ?? ""), expiresIn: Number(j.expires_in) };
  }
  if (!res.ok) {
    throw new TossError(res.status, await res.text());
  }
  const j = (await res.json()) as Record<string, unknown>;
  return { accessToken: String(j.access_token ?? ""), expiresIn: Number(j.expires_in) };
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
  const j = (await res.json()) as Record<string, unknown>;
  const resultObj = j.result != null ? (j.result as Record<string, unknown>) : null;
  return { rate: Number(resultObj?.rate ?? j.rate) };
}
