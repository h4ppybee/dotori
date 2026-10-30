import { db } from "@/lib/db/schema";
import type { Connection, Holding, SavingsAccount, CoinHolding, HoldingSource } from "@/lib/types";

// 백업 payload 버전(Dexie DB 버전과는 독립된 네임스페이스).
// v2: 저축·연금·코인 포함. v3: 대출 포함.
// v4: 사용자가 직접 입력한 수동 데이터만 백업. API 설정·AUTO 데이터·시세/환율 캐시·settings 제외.
// v5: 자산 스냅샷(assetSnapshots) 포함.
// v6: 순자산 목표(goal) 포함.
// v7: 통장 쪼개기(envelopeItems·envelopeConfig) 포함.
// v8: 가계부(ledgerMonths) 포함.
// 구버전(v1~v7) 백업도 계속 불러올 수 있다(그 안의 API 설정·AUTO·캐시·settings는 무시).
export const SCHEMA_VERSION = 8;
const SUPPORTED_VERSIONS = new Set([1, 2, 3, 4, 5, 6, 7, 8]);

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
  assetSnapshots: unknown[];
  goal: unknown[];
  envelopeItems: unknown[];
  envelopeConfig: unknown[];
  ledgerMonths: unknown[];
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
    members,
    connections,
    holdings,
    snapshots,
    sectorOverrides,
    savings,
    pension,
    coin,
    debts,
    assetSnapshots,
    goal,
    envelopeItems,
    envelopeConfig,
    ledgerMonths,
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
    db.assetSnapshots.toArray(),
    db.goal.toArray(),
    db.envelopeItems.toArray(),
    db.envelopeConfig.toArray(),
    db.ledgerMonths.toArray(),
  ]);

  const payload: BackupPayload = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    data: {
      members,
      connections,
      holdings,
      snapshots,
      sectorOverrides,
      savings,
      pension,
      coin,
      debts,
      assetSnapshots,
      goal,
      envelopeItems,
      envelopeConfig,
      ledgerMonths,
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

  // 입력 정제: 수동 데이터만 통과. 구버전 백업의 API 설정·AUTO·priceCache·fxRates·settings·tokenCache는 무시.
  const manualConnections = ((data.connections ?? []) as Connection[])
    .filter((c) => c.type === "MANUAL");
  const manualHoldings = ((data.holdings ?? []) as Holding[])
    .filter((h) => (h.source ?? "MANUAL") === "MANUAL");
  // savings/coin은 source 백필(v5 이전엔 필드 없음 → MANUAL) 후 MANUAL만 통과.
  const withSource = <T extends { source?: HoldingSource }>(rows: readonly T[]): T[] =>
    rows.map((r) => ({ ...r, source: (r.source ?? "MANUAL") as HoldingSource }));
  const manualSavings = withSource((data.savings ?? []) as SavingsAccount[])
    .filter((r) => r.source === "MANUAL");
  const manualCoin = withSource((data.coin ?? []) as CoinHolding[])
    .filter((r) => r.source === "MANUAL");

  const members = (data.members ?? []) as Parameters<typeof db.members.bulkPut>[0];
  const snapshots = (data.snapshots ?? []) as Parameters<typeof db.snapshots.bulkPut>[0];
  const sectorOverrides = (data.sectorOverrides ?? []) as Parameters<typeof db.sectorOverrides.bulkPut>[0];
  const pension = (data.pension ?? []) as Parameters<typeof db.pension.bulkPut>[0];
  const debts = (data.debts ?? []) as Parameters<typeof db.debts.bulkPut>[0];
  const assetSnapshots = (data.assetSnapshots ?? []) as Parameters<typeof db.assetSnapshots.bulkPut>[0];
  const goal = (data.goal ?? []) as Parameters<typeof db.goal.bulkPut>[0];
  const envelopeItems = (data.envelopeItems ?? []) as Parameters<typeof db.envelopeItems.bulkPut>[0];
  const envelopeConfig = (data.envelopeConfig ?? []) as Parameters<typeof db.envelopeConfig.bulkPut>[0];
  const ledgerMonths = (data.ledgerMonths ?? []) as Parameters<typeof db.ledgerMonths.bulkPut>[0];

  // 트랜잭션 스코프는 db.tables 전체 유지(선택적 삭제가 여러 테이블에 걸침).
  await db.transaction("rw", db.tables, async () => {
    if (opts.mode === "overwrite") {
      // 수동 데이터만 교체. API 설정·AUTO 행·캐시·settings·session은 보존.
      await db.connections.where("type").equals("MANUAL").delete();
      await db.holdings.where("source").equals("MANUAL").delete();
      await db.coin.where("source").equals("MANUAL").delete();
      await db.savings.where("source").equals("MANUAL").delete();
      await db.pension.clear();
      await db.debts.clear();
      await db.assetSnapshots.clear();
      await db.goal.clear();
      await db.envelopeItems.clear();
      await db.envelopeConfig.clear();
      await db.ledgerMonths.clear();
    }
    await db.members.bulkPut(members);
    await db.connections.bulkPut(manualConnections);
    await db.holdings.bulkPut(manualHoldings);
    await db.snapshots.bulkPut(snapshots);
    await db.sectorOverrides.bulkPut(sectorOverrides);
    await db.savings.bulkPut(manualSavings);
    await db.pension.bulkPut(pension);
    await db.coin.bulkPut(manualCoin);
    await db.debts.bulkPut(debts);
    await db.assetSnapshots.bulkPut(assetSnapshots);
    await db.goal.bulkPut(goal);
    await db.envelopeItems.bulkPut(envelopeItems);
    await db.envelopeConfig.bulkPut(envelopeConfig);
    await db.ledgerMonths.bulkPut(ledgerMonths);
  });
}
