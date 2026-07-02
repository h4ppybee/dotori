import { db } from "@/lib/db/schema";

// 백업 payload 버전(Dexie DB 버전과는 독립된 네임스페이스).
// v2: 저축·연금·코인 포함. v3: 대출 포함.
// v4: 사용자가 직접 입력한 수동 데이터만 백업. API 설정·AUTO 데이터·시세/환율 캐시·settings 제외.
// 구버전(v1~v3) 백업도 계속 불러올 수 있다(그 안의 API 설정·AUTO·캐시·settings는 무시).
export const SCHEMA_VERSION = 4;
const SUPPORTED_VERSIONS = new Set([1, 2, 3, 4]);

interface BackupData {
  members: unknown[];
  connections: unknown[];
  holdings: unknown[];
  snapshots: unknown[];
  sectorOverrides: unknown[];
  savings: unknown[];
  pension: unknown[];
  coin: unknown[];
  debts: unknown[];
  // 아래 필드는 v4 export에서 더 이상 쓰지 않지만, 구버전 백업을 읽는
  // 기존 importAll(Task 2에서 정리 예정)이 참조하므로 인터페이스에 남겨둔다.
  priceCache: unknown[];
  fxRates: unknown[];
  settings: unknown[];
}

interface BackupPayload {
  schemaVersion: number;
  exportedAt: number;
  data: Partial<BackupData>;
}

export async function exportAll(): Promise<string> {
  // 수동 데이터만 백업한다. 제외 대상:
  //  - API 설정: connections(TOSS_API/UPBIT_API), tokenCache — 기기별 민감정보
  //  - 자동 데이터: holdings/savings/coin 중 source==="AUTO" — 재연결+새로고침으로 복구
  //  - 재조회 캐시: priceCache, fxRates
  //  - 보안 앵커: settings(kdfSalt/verifier) — 보존된 API 연결 복호화 키가 이 salt에 묶여 있어 덮으면 손상
  const [
    members, connections, holdings, snapshots, sectorOverrides, savings, pension, coin, debts,
  ] = await Promise.all([
    db.members.toArray(),
    db.connections.where("type").equals("MANUAL").toArray(),
    db.holdings.where("source").equals("MANUAL").toArray(),
    db.snapshots.toArray(),
    db.sectorOverrides.toArray(),
    db.savings.where("source").equals("MANUAL").toArray(),
    db.pension.toArray(),
    db.coin.where("source").equals("MANUAL").toArray(),
    db.debts.toArray(),
  ]);

  const payload: BackupPayload = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    data: {
      members, connections, holdings, snapshots, sectorOverrides, savings, pension, coin, debts,
    },
  };

  return JSON.stringify(payload);
}

export async function importAll(json: string, opts: { mode: "merge" | "overwrite" }): Promise<void> {
  let parsed: BackupPayload;
  try {
    parsed = JSON.parse(json) as BackupPayload;
  } catch {
    throw new Error("백업 파일을 읽을 수 없어요");
  }

  if (!SUPPORTED_VERSIONS.has(parsed.schemaVersion)) {
    throw new Error("백업 버전이 호환되지 않아요");
  }

  const data = parsed.data ?? {};

  const members = (data.members ?? []) as Parameters<typeof db.members.bulkPut>[0];
  const connections = (data.connections ?? []) as Parameters<typeof db.connections.bulkPut>[0];
  const holdings = (data.holdings ?? []) as Parameters<typeof db.holdings.bulkPut>[0];
  const priceCache = (data.priceCache ?? []) as Parameters<typeof db.priceCache.bulkPut>[0];
  const fxRates = (data.fxRates ?? []) as Parameters<typeof db.fxRates.bulkPut>[0];
  const snapshots = (data.snapshots ?? []) as Parameters<typeof db.snapshots.bulkPut>[0];
  const settings = (data.settings ?? []) as Parameters<typeof db.settings.bulkPut>[0];
  const sectorOverrides = (data.sectorOverrides ?? []) as Parameters<typeof db.sectorOverrides.bulkPut>[0];
  const savings = (data.savings ?? []) as Parameters<typeof db.savings.bulkPut>[0];
  const pension = (data.pension ?? []) as Parameters<typeof db.pension.bulkPut>[0];
  const coin = (data.coin ?? []) as Parameters<typeof db.coin.bulkPut>[0];
  const debts = (data.debts ?? []) as Parameters<typeof db.debts.bulkPut>[0];

  // v5 이전 백업엔 coin/savings에 source 필드가 없다(Task 1에서 필수 필드가 됨).
  // 없으면 connectionId 없는 순수 수동 데이터로 간주해 MANUAL로 채운다.
  const withSource = <T extends { source?: string }>(rows: readonly T[]): T[] =>
    rows.map((r) => ({ ...r, source: r.source ?? "MANUAL" }));
  const savingsWithSource = withSource(savings);
  const coinWithSource = withSource(coin);

  await db.transaction("rw", db.tables, async () => {
    if (opts.mode === "overwrite") {
      await Promise.all(db.tables.map((t) => t.clear()));
    }
    await db.members.bulkPut(members);
    await db.connections.bulkPut(connections);
    await db.holdings.bulkPut(holdings);
    await db.priceCache.bulkPut(priceCache);
    await db.fxRates.bulkPut(fxRates);
    await db.snapshots.bulkPut(snapshots);
    await db.settings.bulkPut(settings);
    await db.sectorOverrides.bulkPut(sectorOverrides);
    await db.savings.bulkPut(savingsWithSource);
    await db.pension.bulkPut(pension);
    await db.coin.bulkPut(coinWithSource);
    await db.debts.bulkPut(debts);
  });
}
