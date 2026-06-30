import { db, priceKey } from "@/lib/db/schema";
import type {
  Connection, Holding, PriceCache, FxRate, Settings, Member, SavingsAccount, SavingsCategory,
  PensionAccount, PensionCategory, CoinHolding,
} from "@/lib/types";

const now = () => Date.now();
const uid = () => crypto.randomUUID();

export async function upsertConnection(
  input: Omit<Connection, "id" | "createdAt" | "updatedAt"> & { id?: string },
): Promise<Connection> {
  const existing = input.id ? await db.connections.get(input.id) : undefined;
  const conn: Connection = {
    ...existing, ...input,
    id: input.id ?? uid(),
    createdAt: existing?.createdAt ?? now(),
    updatedAt: now(),
  } as Connection;
  await db.connections.put(conn);
  return conn;
}
export const listConnections = () => db.connections.toArray();
export const deleteConnection = (id: string) => db.connections.delete(id);

export async function upsertAutoHolding(
  h: Omit<Holding, "id" | "source" | "updatedAt">,
): Promise<void> {
  const match = await db.holdings
    .where("connectionId").equals(h.connectionId)
    .and((x) => x.symbol === h.symbol && x.source === "AUTO").first();
  await db.holdings.put({ ...match, ...h, id: match?.id ?? uid(), source: "AUTO", updatedAt: now() });
}

export async function upsertManualHolding(h: Partial<Holding> & { id?: string }): Promise<Holding> {
  const existing = h.id ? await db.holdings.get(h.id) : undefined;
  const rec = { ...existing, ...h, id: h.id ?? uid(), source: "MANUAL", updatedAt: now() } as Holding;
  await db.holdings.put(rec);
  return rec;
}
export async function pruneAutoHoldings(connectionId: string, keepSymbols: string[]): Promise<void> {
  const keep = new Set(keepSymbols);
  const rows = await db.holdings
    .where("connectionId").equals(connectionId)
    .and((x) => x.source === "AUTO" && !keep.has(x.symbol)).toArray();
  await db.holdings.bulkDelete(rows.map((r) => r.id));
}

export const listHoldings = () => db.holdings.toArray();
export const deleteHolding = (id: string) => db.holdings.delete(id);

export async function putPrice(p: Omit<PriceCache, "key">): Promise<void> {
  await db.priceCache.put({ ...p, key: priceKey(p.symbol, p.currency) });
}
export const getPrice = (symbol: string, currency: string) => db.priceCache.get(priceKey(symbol, currency));
export const listPrices = () => db.priceCache.toArray();

export const putFx = (fx: FxRate) => db.fxRates.put(fx);
export const getFx = () => db.fxRates.get("USDKRW");

export const getSettings = () => db.settings.get("app");
export const putSettings = (s: Settings) => db.settings.put(s);

export const upsertMember = (m: Member) => db.members.put(m);
export const listMembers = () => db.members.toArray();

export async function putSectorOverride(symbol: string, sector: string): Promise<void> {
  await db.sectorOverrides.put({ symbol, sector });
}
export async function deleteSectorOverride(symbol: string): Promise<void> {
  await db.sectorOverrides.delete(symbol);
}
export async function getSectorOverrides(): Promise<Record<string, string>> {
  const rows = await db.sectorOverrides.toArray();
  return Object.fromEntries(rows.map((r) => [r.symbol, r.sector]));
}

// ── 저축/현금성 계좌 (수동) ──────────────────────────────────────────────
export const listSavings = () => db.savings.toArray();

/** 새 계좌의 sortOrder는 해당 카테고리 최대값 + 1. */
async function nextSavingsSortOrder(category: SavingsCategory): Promise<number> {
  const rows = await db.savings.where("category").equals(category).toArray();
  const max = rows.reduce((m, r) => Math.max(m, r.sortOrder), -1);
  return max + 1;
}

export async function upsertSavings(
  s: Partial<SavingsAccount> & { id?: string },
): Promise<SavingsAccount> {
  const existing = s.id ? await db.savings.get(s.id) : undefined;
  const category = (s.category ?? existing?.category ?? "ETC") as SavingsCategory;
  const sortOrder =
    s.sortOrder ?? existing?.sortOrder ?? (await nextSavingsSortOrder(category));
  const rec = {
    ...existing,
    ...s,
    id: s.id ?? uid(),
    category,
    sortOrder,
    updatedAt: now(),
  } as SavingsAccount;
  await db.savings.put(rec);
  return rec;
}

export const deleteSavings = (id: string) => db.savings.delete(id);

/** 편집 모드 일괄 저장. updatedAt를 갱신해 bulkPut. */
export async function bulkUpdateSavings(rows: SavingsAccount[]): Promise<void> {
  const stamped = rows.map((r) => ({ ...r, updatedAt: now() }));
  await db.savings.bulkPut(stamped);
}

// ── 연금 계좌 (수동) ──────────────────────────────────────────────────────
export const listPension = () => db.pension.toArray();

async function nextPensionSortOrder(category: PensionCategory): Promise<number> {
  const rows = await db.pension.where("category").equals(category).toArray();
  const max = rows.reduce((m, r) => Math.max(m, r.sortOrder), -1);
  return max + 1;
}

export async function upsertPension(
  p: Partial<PensionAccount> & { id?: string },
): Promise<PensionAccount> {
  const existing = p.id ? await db.pension.get(p.id) : undefined;
  const category = (p.category ?? existing?.category ?? "PERSONAL") as PensionCategory;
  const sortOrder =
    p.sortOrder ?? existing?.sortOrder ?? (await nextPensionSortOrder(category));
  const rec = {
    ...existing, ...p, id: p.id ?? uid(), category, sortOrder, updatedAt: now(),
  } as PensionAccount;
  await db.pension.put(rec);
  return rec;
}

export const deletePension = (id: string) => db.pension.delete(id);

export async function bulkUpdatePension(rows: PensionAccount[]): Promise<void> {
  const stamped = rows.map((r) => ({ ...r, updatedAt: now() }));
  await db.pension.bulkPut(stamped);
}

// ── 코인 보유 (수동) ──────────────────────────────────────────────────────
export const listCoin = () => db.coin.toArray();

async function nextCoinSortOrder(): Promise<number> {
  const rows = await db.coin.toArray();
  const max = rows.reduce((m, r) => Math.max(m, r.sortOrder), -1);
  return max + 1;
}

export async function upsertCoin(
  c: Partial<CoinHolding> & { id?: string },
): Promise<CoinHolding> {
  const existing = c.id ? await db.coin.get(c.id) : undefined;
  const sortOrder = c.sortOrder ?? existing?.sortOrder ?? (await nextCoinSortOrder());
  const rec = {
    ...existing, ...c, id: c.id ?? uid(), sortOrder, updatedAt: now(),
  } as CoinHolding;
  await db.coin.put(rec);
  return rec;
}

export const deleteCoin = (id: string) => db.coin.delete(id);

export async function bulkUpdateCoin(rows: CoinHolding[]): Promise<void> {
  const stamped = rows.map((r) => ({ ...r, updatedAt: now() }));
  await db.coin.bulkPut(stamped);
}
