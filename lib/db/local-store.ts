import { db, priceKey } from "@/lib/db/schema";
import type {
  Connection, Holding, PriceCache, FxRate, Settings, Member, SavingsAccount, SavingsCategory,
  PensionAccount, PensionCategory, CoinHolding, LoanAccount, LoanCategory, AssetSnapshot, Goal,
  EnvelopeItem, EnvelopeConfig, EnvelopeProfile, SheetExportConfig, BiometricConfig,
} from "@/lib/types";
import { toLocalYmd } from "@/lib/format";
import { encrypt } from "@/lib/crypto/crypto";
import { TAG_PRESETS, ACCOUNT_PRESETS } from "@/lib/envelope/presets";

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

export const getGoal = () => db.goal.get("goal");
export const putGoal = (g: Goal) => db.goal.put(g);
export const deleteGoal = () => db.goal.delete("goal");

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
  // 금액 기준일: 새 계좌이거나 금액이 바뀌었을 때만 오늘로 찍는다(예적금 자동 증가의 기준).
  const amountChanged = !existing || (s.amount !== undefined && s.amount !== existing.amount);
  const rec = {
    ...existing,
    ...s,
    id: s.id ?? uid(),
    category,
    sortOrder,
    source: existing?.source ?? "MANUAL",
    balanceAsOf: amountChanged ? toLocalYmd(now()) : existing.balanceAsOf,
    updatedAt: now(),
  } as SavingsAccount;
  await db.savings.put(rec);
  return rec;
}

export const deleteSavings = (id: string) => db.savings.delete(id);

/** 편집 모드 일괄 저장. updatedAt를 갱신하고, 금액이 바뀐 행만 기준일을 오늘로 찍어 bulkPut. */
export async function bulkUpdateSavings(rows: SavingsAccount[]): Promise<void> {
  const existing = await db.savings.bulkGet(rows.map((r) => r.id));
  const today = toLocalYmd(now());
  const stamped = rows.map((r, i) => {
    const prev = existing[i];
    const amountChanged = !prev || prev.amount !== r.amount;
    return {
      ...r,
      balanceAsOf: amountChanged ? today : r.balanceAsOf,
      updatedAt: now(),
    };
  });
  await db.savings.bulkPut(stamped);
}

// ── 대출/부채 (수동) ─────────────────────────────────────────────────────
export const listDebts = () => db.debts.toArray();

async function nextDebtSortOrder(): Promise<number> {
  const rows = await db.debts.toArray();
  const max = rows.reduce((m, r) => Math.max(m, r.sortOrder), -1);
  return max + 1;
}

export async function upsertDebt(
  d: Partial<LoanAccount> & { id?: string },
): Promise<LoanAccount> {
  const existing = d.id ? await db.debts.get(d.id) : undefined;
  const sortOrder = d.sortOrder ?? existing?.sortOrder ?? (await nextDebtSortOrder());
  const rec = {
    ...existing,
    ...d,
    id: d.id ?? uid(),
    category: (d.category ?? existing?.category ?? "ETC") as LoanCategory,
    sortOrder,
    updatedAt: now(),
  } as LoanAccount;
  await db.debts.put(rec);
  return rec;
}

export const deleteDebt = (id: string) => db.debts.delete(id);

// ── 저축/현금성 계좌 (업비트 AUTO 예수금) ───────────────────────────────────
export async function upsertAutoSavings(row: { connectionId: string; amount: number }): Promise<void> {
  const id = `upbit-krw:${row.connectionId}`;
  const existing = await db.savings.get(id);
  await db.savings.put({
    id,
    category: "CHECKING",
    name: "업비트 원화",
    bank: "업비트",
    amount: row.amount,
    currency: "KRW",
    sortOrder: existing?.sortOrder ?? (await nextSavingsSortOrder("CHECKING")),
    updatedAt: now(),
    source: "AUTO",
    connectionId: row.connectionId,
  });
}

export async function pruneAutoSavings(connectionId: string): Promise<void> {
  const rows = await db.savings
    .where("connectionId").equals(connectionId)
    .and((x) => x.source === "AUTO").toArray();
  await db.savings.bulkDelete(rows.map((r) => r.id));
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
    ...existing, ...c, id: c.id ?? uid(), sortOrder, source: existing?.source ?? "MANUAL", updatedAt: now(),
  } as CoinHolding;
  await db.coin.put(rec);
  return rec;
}

export const deleteCoin = (id: string) => db.coin.delete(id);

export async function bulkUpdateCoin(rows: CoinHolding[]): Promise<void> {
  const stamped = rows.map((r) => ({ ...r, updatedAt: now() }));
  await db.coin.bulkPut(stamped);
}

// ── 코인 보유 (업비트 AUTO) ─────────────────────────────────────────────────
export async function upsertAutoCoin(row: {
  connectionId: string; market: string; name: string;
  quantity: number; buyPrice: number; currentPrice?: number; exchange?: string;
}): Promise<void> {
  const id = `upbit:${row.connectionId}:${row.market}`;
  const existing = await db.coin.get(id);
  // currentPrice 미지정(ticker 실패): 기존 행이면 이전값 유지, 신규면 buyPrice 폴백
  const currentPrice = row.currentPrice ?? existing?.currentPrice ?? row.buyPrice;
  await db.coin.put({
    id,
    name: row.name,
    exchange: row.exchange ?? "업비트",
    quantity: row.quantity,
    buyPrice: row.buyPrice,
    currentPrice,
    sortOrder: existing?.sortOrder ?? (await nextCoinSortOrder()),
    updatedAt: now(),
    source: "AUTO",
    connectionId: row.connectionId,
    market: row.market,
  });
}

export async function pruneAutoCoins(connectionId: string, keepMarkets: string[]): Promise<void> {
  const keep = new Set(keepMarkets);
  const rows = await db.coin
    .where("connectionId").equals(connectionId)
    .and((x) => x.source === "AUTO" && !keep.has(x.market ?? "")).toArray();
  await db.coin.bulkDelete(rows.map((r) => r.id));
}

// ── 자산 스냅샷 (수동 전체 기록) ─────────────────────────────────────────
export const addAssetSnapshot = (s: AssetSnapshot) => db.assetSnapshots.put(s);

/** createdAt 내림차순(최신 우선). limit 지정 시 상위 N개만. */
export function listAssetSnapshots(limit?: number): Promise<AssetSnapshot[]> {
  const q = db.assetSnapshots.orderBy("createdAt").reverse();
  if (limit != null) {
    return q.limit(limit).toArray();
  }
  return q.toArray();
}

export const getAssetSnapshot = (id: string) => db.assetSnapshots.get(id);
export const deleteAssetSnapshot = (id: string) => db.assetSnapshots.delete(id);

// ── 통장 쪼개기 항목 (수동) ──────────────────────────────────────────────
export const listEnvelopeItems = () => db.envelopeItems.toArray();
export const getEnvelopeItem = (id: string) => db.envelopeItems.get(id);

/** 새 항목 sortOrder = 해당 프로필 최대값 + 1. */
async function nextEnvelopeSortOrder(profile: EnvelopeProfile): Promise<number> {
  const rows = await db.envelopeItems.where("profile").equals(profile).toArray();
  return rows.reduce((m, r) => Math.max(m, r.sortOrder), -1) + 1;
}

export async function upsertEnvelopeItem(
  s: Partial<EnvelopeItem> & { id?: string; profile: EnvelopeProfile },
): Promise<EnvelopeItem> {
  const existing = s.id ? await db.envelopeItems.get(s.id) : undefined;
  const sortOrder = s.sortOrder ?? existing?.sortOrder ?? (await nextEnvelopeSortOrder(s.profile));
  const rec = {
    ...existing,
    ...s,
    id: s.id ?? uid(),
    sortOrder,
    createdAt: existing?.createdAt ?? now(),
  } as EnvelopeItem;
  await db.envelopeItems.put(rec);
  return rec;
}

export const deleteEnvelopeItem = (id: string) => db.envelopeItems.delete(id);

/** 편집 모드 일괄 저장. */
export async function bulkUpdateEnvelope(rows: EnvelopeItem[]): Promise<void> {
  await db.envelopeItems.bulkPut(rows);
}

// ── 통장 쪼개기 설정 (커스텀 태그·은행, 단일 행) ─────────────────────────
const DEFAULT_ENVELOPE_CONFIG: EnvelopeConfig = { id: "envelope", customTags: [], customAccounts: [] };
export const getEnvelopeConfig = async (): Promise<EnvelopeConfig> =>
  (await db.envelopeConfig.get("envelope")) ?? DEFAULT_ENVELOPE_CONFIG;
export const putEnvelopeConfig = (c: EnvelopeConfig) => db.envelopeConfig.put(c);

/** 시트에서 가져온 항목(id·순서·생성시각은 여기서 붙인다). */
export type EnvelopeImportRow = Pick<EnvelopeItem, "profile" | "tag" | "account" | "name" | "amountKrw" | "note">;

/**
 * 통장 쪼개기 항목을 통째로 교체한다(시트 가져오기). 한 트랜잭션에서
 * 기존 항목 삭제 → 프로필별 입력 순서대로 sortOrder 0..n → 프리셋·기존 커스텀에 없는 태그·통장을 커스텀에 추가.
 */
export async function replaceEnvelopeItems(rows: EnvelopeImportRow[]): Promise<void> {
  await db.transaction("rw", db.envelopeItems, db.envelopeConfig, async () => {
    const order: Record<EnvelopeProfile, number> = { wife: 0, husband: 0 };
    const createdAt = now();
    const items: EnvelopeItem[] = rows.map((r) => ({
      ...r,
      id: uid(),
      sortOrder: order[r.profile]++,
      createdAt,
    }));
    await db.envelopeItems.clear();
    await db.envelopeItems.bulkAdd(items);

    const cfg = await getEnvelopeConfig();
    const addMissing = (presets: readonly string[], custom: string[], values: string[]) => {
      const known = new Set([...presets, ...custom]);
      const added = [...custom];
      for (const v of values) {
        if (!known.has(v)) {
          known.add(v);
          added.push(v);
        }
      }
      return added;
    };
    await putEnvelopeConfig({
      ...cfg,
      customTags: addMissing(TAG_PRESETS, cfg.customTags, rows.map((r) => r.tag)),
      customAccounts: addMissing(ACCOUNT_PRESETS, cfg.customAccounts, rows.map((r) => r.account)),
    });
  });
}

// ── 구글 시트 내보내기 설정 (기기별, 단일 행) ─────────────────────────────
export const getSheetExportConfig = () => db.sheetExport.get("sheet");

/** 비밀키는 세션 키로 암호화해 저장한다(원문 비밀키는 영속화하지 않음). */
export async function saveSheetExportConfig(
  key: CryptoKey,
  input: { webAppUrl: string; secret: string },
): Promise<SheetExportConfig> {
  const rec: SheetExportConfig = {
    id: "sheet",
    webAppUrl: input.webAppUrl,
    secretEnc: await encrypt(key, input.secret),
    updatedAt: now(),
  };
  await db.sheetExport.put(rec);
  return rec;
}

export const clearSheetExportConfig = () => db.sheetExport.delete("sheet");

// ─── Face ID 잠금 해제 설정 ───
export const getBiometricConfig = () => db.biometric.get("biometric");

export async function saveBiometricConfig(input: Omit<BiometricConfig, "id">): Promise<void> {
  await db.biometric.put({ id: "biometric", ...input });
}

export const clearBiometricConfig = () => db.biometric.delete("biometric");
