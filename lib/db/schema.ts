import Dexie, { type Table } from "dexie";
import type {
  Member, Connection, TokenCache, Holding, PriceCache, FxRate, DailySnapshot, Settings,
} from "@/lib/types";

export class FinoteDB extends Dexie {
  members!: Table<Member, string>;
  connections!: Table<Connection, string>;
  tokenCache!: Table<TokenCache, string>;
  holdings!: Table<Holding, string>;
  priceCache!: Table<PriceCache, string>;     // key: `${symbol}|${currency}`
  fxRates!: Table<FxRate, string>;            // key: pair
  snapshots!: Table<DailySnapshot, string>;   // key: date
  settings!: Table<Settings, string>;         // key: id
  sectorOverrides!: Table<{ symbol: string; sector: string }, string>; // key: symbol

  constructor() {
    super("finote");
    this.version(1).stores({
      members: "id",
      connections: "id, memberId, type",
      tokenCache: "connectionId",
      holdings: "id, connectionId, symbol, source",
      priceCache: "key, symbol",
      fxRates: "pair",
      snapshots: "date",
      settings: "id",
      sectorOverrides: "symbol",
    });
  }
}
export const db = new FinoteDB();
export const priceKey = (symbol: string, currency: string) => `${symbol}|${currency}`;
