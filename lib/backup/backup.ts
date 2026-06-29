import { db } from "@/lib/db/schema";

export const SCHEMA_VERSION = 1;

interface BackupData {
  members: unknown[];
  connections: unknown[];
  holdings: unknown[];
  priceCache: unknown[];
  fxRates: unknown[];
  snapshots: unknown[];
  settings: unknown[];
  sectorOverrides: unknown[];
}

interface BackupPayload {
  schemaVersion: number;
  exportedAt: number;
  data: Partial<BackupData>;
}

export async function exportAll(): Promise<string> {
  // tokenCache는 휘발성(clientSecret으로 언제든 재발급) + 비밀번호 파생 키로 암호화돼
  // 있어 백업/복원 대상에서 제외한다. 복원 시 죽은 토큰이 주입되어 401을 유발하던 문제 방지.
  const [
    members,
    connections,
    holdings,
    priceCache,
    fxRates,
    snapshots,
    settings,
    sectorOverrides,
  ] = await Promise.all([
    db.members.toArray(),
    db.connections.toArray(),
    db.holdings.toArray(),
    db.priceCache.toArray(),
    db.fxRates.toArray(),
    db.snapshots.toArray(),
    db.settings.toArray(),
    db.sectorOverrides.toArray(),
  ]);

  const payload: BackupPayload = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    data: {
      members,
      connections,
      holdings,
      priceCache,
      fxRates,
      snapshots,
      settings,
      sectorOverrides,
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

  if (parsed.schemaVersion !== SCHEMA_VERSION) {
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
  });
}
