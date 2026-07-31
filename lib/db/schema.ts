import Dexie, { type Table } from "dexie";
import type {
  Member, Connection, TokenCache, Holding, PriceCache, FxRate, DailySnapshot, Settings, SavingsAccount,
  PensionAccount, CoinHolding, LoanAccount, AssetSnapshot, Goal,
} from "@/lib/types";

/**
 * 자동 잠금용 세션 레코드. 비추출 CryptoKey(원본 바이트 추출 불가)와 만료시각만 담는다.
 * Dexie의 structured clone으로 CryptoKey 핸들이 저장되며, 원본 키는 IndexedDB에 평문으로 남지 않는다.
 */
export interface SessionRecord {
  id: "current";
  key: CryptoKey;
  expiresAt: number;
}

export class DotoriDB extends Dexie {
  members!: Table<Member, string>;
  connections!: Table<Connection, string>;
  tokenCache!: Table<TokenCache, string>;
  holdings!: Table<Holding, string>;
  priceCache!: Table<PriceCache, string>;     // key: `${symbol}|${currency}`
  fxRates!: Table<FxRate, string>;            // key: pair
  snapshots!: Table<DailySnapshot, string>;   // key: date
  settings!: Table<Settings, string>;         // key: id
  sectorOverrides!: Table<{ symbol: string; sector: string }, string>; // key: symbol
  session!: Table<SessionRecord, string>;     // key: id ("current")
  savings!: Table<SavingsAccount, string>;    // key: id (수동 저축/현금성 계좌)
  pension!: Table<PensionAccount, string>;    // key: id (수동 연금 계좌)
  coin!: Table<CoinHolding, string>;          // key: id (수동 코인 보유)
  debts!: Table<LoanAccount, string>;         // key: id (수동 대출/부채)
  assetSnapshots!: Table<AssetSnapshot, string>; // key: id (수동 전체 자산 스냅샷)
  goal!: Table<Goal, string>; // key: id (순자산 목표, 단일 행)

  constructor() {
    super("dotori");
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
    // v2: 자동 잠금용 세션 볼트 테이블 추가 (lib/db/session-vault.ts)
    this.version(2).stores({
      session: "id",
    });
    // v3: 수동 저축/현금성 계좌 테이블 추가
    this.version(3).stores({
      savings: "id, category, sortOrder",
    });
    // v4: 수동 연금 계좌 + 코인 보유 테이블 추가
    this.version(4).stores({
      pension: "id, category, sortOrder",
      coin: "id, sortOrder",
    });
    // v5: 코인/저축 AUTO 연동 필드 인덱스 추가
    this.version(5).stores({
      coin: "id, sortOrder, connectionId, source",
      savings: "id, category, sortOrder, connectionId, source",
    });
    // v6: 수동 대출/부채 테이블 추가
    this.version(6).stores({
      debts: "id, category, sortOrder",
    });
    // v7: 수동 전체 자산 스냅샷 테이블 추가 (docs/superpowers/specs/2026-07-02-asset-snapshot-design.md)
    this.version(7).stores({
      assetSnapshots: "id, createdAt",
    });
    // v8: 순자산 목표 테이블 추가 (docs/superpowers/specs/2026-07-31-home-net-worth-goal-design.md)
    this.version(8).stores({
      goal: "id",
    });
  }
}
export const db = new DotoriDB();
export const priceKey = (symbol: string, currency: string) => `${symbol}|${currency}`;
