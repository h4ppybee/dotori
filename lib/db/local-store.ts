import { db, priceKey } from "@/lib/db/schema";
import type { Connection, Holding, PriceCache, FxRate, Settings, Member } from "@/lib/types";

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
export async function getSectorOverrides(): Promise<Record<string, string>> {
  const rows = await db.sectorOverrides.toArray();
  return Object.fromEntries(rows.map((r) => [r.symbol, r.sector]));
}
