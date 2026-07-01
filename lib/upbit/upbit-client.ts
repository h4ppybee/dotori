import { buildUpbitJwt } from "./upbit-jwt";
import type { RawUpbitAccount } from "./normalize";

const UPBIT_BASE = "https://api.upbit.com";

export class UpbitError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "UpbitError";
  }
}

const toNum = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};

async function upbitGet(path: string, jwt?: string): Promise<unknown> {
  const headers: Record<string, string> = {};
  if (jwt) {
    headers.Authorization = `Bearer ${jwt}`;
  }
  const res = await fetch(`${UPBIT_BASE}${path}`, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    throw new UpbitError(res.status, await res.text());
  }
  return res.json();
}

export async function fetchUpbitAccounts(accessKey: string, secretKey: string): Promise<RawUpbitAccount[]> {
  const jwt = buildUpbitJwt(accessKey, secretKey);
  const raw = (await upbitGet("/v1/accounts", jwt)) as RawUpbitAccount[];
  return Array.isArray(raw) ? raw : [];
}

export async function fetchUpbitTickers(markets: string[]): Promise<Record<string, number>> {
  if (markets.length === 0) {
    return {};
  }
  const raw = (await upbitGet(`/v1/ticker?markets=${markets.join(",")}`)) as { market: string; trade_price: number }[];
  const out: Record<string, number> = {};
  for (const t of raw ?? []) {
    out[t.market] = toNum(t.trade_price);
  }
  return out;
}

export async function fetchUpbitMarketNames(): Promise<Record<string, string>> {
  const raw = (await upbitGet("/v1/market/all")) as { market: string; korean_name: string }[];
  const out: Record<string, string> = {};
  for (const m of raw ?? []) {
    out[m.market] = m.korean_name;
  }
  return out;
}
