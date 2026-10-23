import { readManualTables, type ManualTables } from "@/lib/backup/backup";

/**
 * 기기 동기화 데이터 수집·정규화·해시.
 * - 범위: 백업과 같은 수동 데이터(readManualTables)에서 snapshots(과거 일일 스냅샷)만 뺀 12개 테이블.
 * - canonicalize: 순수·동기. 테이블 이름순, 테이블 안에서는 기본 키순, 객체 키는 사전순으로 정렬하고
 *   HASH_EXCLUDED_FIELDS를 뺀 JSON 문자열. 트랜잭션 안에서도 부를 수 있다(await 없음).
 * - 변경 판단은 hashCanonical(canonical) != lastSyncedHash. payload에는 모든 필드를 그대로 보내고
 *   해시에서만 휘발성 필드를 뺀다 → 시세 갱신만으로는 "변경 있음"이 되지 않는다.
 * ⚠️ 동기화 대상 테이블에 새 휘발성 필드(시세·자동 갱신 시각 등)를 추가하면 HASH_EXCLUDED_FIELDS도 갱신한다.
 */

export const SYNC_VERSION = 1;

export type SyncData = Omit<ManualTables, "snapshots">;
export type SyncTable = keyof SyncData;

export const SYNC_TABLES: readonly SyncTable[] = [
  "members", "connections", "holdings", "savings", "coin", "pension", "debts",
  "assetSnapshots", "goal", "envelopeItems", "envelopeConfig", "sectorOverrides",
];

// 정렬 기준 = Dexie 기본 키(lib/db/schema.ts). sectorOverrides만 symbol.
const PRIMARY_KEY: Record<SyncTable, string> = {
  members: "id",
  connections: "id",
  holdings: "id",
  savings: "id",
  coin: "id",
  pension: "id",
  debts: "id",
  assetSnapshots: "id",
  goal: "id",
  envelopeItems: "id",
  envelopeConfig: "id",
  sectorOverrides: "symbol",
};

/** 해시 정규화에서 빼는 행 필드. "*"는 모든 테이블. 테스트로 고정한다. */
export const HASH_EXCLUDED_FIELDS: Readonly<Partial<Record<SyncTable | "*", readonly string[]>>> = {
  "*": ["updatedAt"],         // bulkUpdatePension·refreshSavingsAccrual 등이 기기마다 다른 시각을 찍는다
  pension: ["currentPrice"],  // 통합 갱신이 쓰는 시세
};

export function emptySyncData(): SyncData {
  return {
    members: [], connections: [], holdings: [], savings: [], coin: [], pension: [], debts: [],
    assetSnapshots: [], goal: [], envelopeItems: [], envelopeConfig: [], sectorOverrides: [],
  };
}

export function pickSyncData(t: ManualTables): SyncData {
  return {
    members: t.members,
    connections: t.connections,
    holdings: t.holdings,
    savings: t.savings,
    coin: t.coin,
    pension: t.pension,
    debts: t.debts,
    assetSnapshots: t.assetSnapshots,
    goal: t.goal,
    envelopeItems: t.envelopeItems,
    envelopeConfig: t.envelopeConfig,
    sectorOverrides: t.sectorOverrides,
  };
}

/** DB의 현재 동기화 데이터. Dexie 트랜잭션 안에서 부르면 그 트랜잭션으로 읽는다. */
export async function collectSyncData(): Promise<SyncData> {
  return pickSyncData(await readManualTables());
}

function compareKeys(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

/** 객체 키를 사전순으로 정렬한 JSON. undefined 값은 JSON.stringify처럼 뺀다. 배열 순서는 유지한다. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? "null" : stableStringify(v))).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort(compareKeys);
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function canonicalize(data: Partial<SyncData>): string {
  const out: Record<string, unknown[]> = {};
  for (const table of [...SYNC_TABLES].sort(compareKeys)) {
    const excluded = new Set([...(HASH_EXCLUDED_FIELDS["*"] ?? []), ...(HASH_EXCLUDED_FIELDS[table] ?? [])]);
    const pk = PRIMARY_KEY[table];
    const rows = ((data[table] ?? []) as unknown as Record<string, unknown>[])
      .map((row) => Object.fromEntries(Object.entries(row).filter(([k]) => !excluded.has(k))))
      .sort((a, b) => compareKeys(String(a[pk]), String(b[pk])));
    out[table] = rows;
  }
  return stableStringify(out);
}

export async function hashCanonical(canonical: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 원격 syncVersion이 앱보다 높을 때. 적용하지 않고 새로고침을 안내한다. */
export class SyncVersionError extends Error {
  constructor() {
    super("SYNC_VERSION_NEWER");
    this.name = "SyncVersionError";
  }
}

/** 봉투 평문. 수집 결과 객체 하나를 그대로 직렬화한다(보낸 내용 = 해시 계산 내용). */
export function encodeSyncPayload(data: SyncData, sentAt: number): string {
  return JSON.stringify({ syncVersion: SYNC_VERSION, data, sentAt });
}

export function decodeSyncPayload(text: string): { data: SyncData; sentAt: number } {
  const parsed = JSON.parse(text) as { syncVersion?: unknown; data?: unknown; sentAt?: unknown };
  if (typeof parsed.syncVersion !== "number" || parsed.data === null || typeof parsed.data !== "object") {
    throw new Error("SYNC_PAYLOAD_INVALID");
  }
  if (parsed.syncVersion > SYNC_VERSION) {
    throw new SyncVersionError();
  }
  const raw = parsed.data as Record<string, unknown>;
  const data = emptySyncData();
  for (const table of SYNC_TABLES) {
    const rows = raw[table];
    if (Array.isArray(rows)) {
      (data as unknown as Record<SyncTable, unknown[]>)[table] = rows;
    }
  }
  return { data, sentAt: typeof parsed.sentAt === "number" ? parsed.sentAt : 0 };
}

/** "이 기기에 수동 데이터가 없다" 판단. setup이 만든 멤버 1명만 있는 상태는 비어 있다고 본다. */
export function isEffectivelyEmpty(data: SyncData): boolean {
  if (data.members.length > 1) {
    return false;
  }
  return SYNC_TABLES.filter((t) => t !== "members").every((t) => data[t].length === 0);
}
