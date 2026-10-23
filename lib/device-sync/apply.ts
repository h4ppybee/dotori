import { db } from "@/lib/db/schema";
import { collectSyncData, canonicalize, type SyncData } from "@/lib/device-sync/collect";
import type { HoldingSource } from "@/lib/types";

/** 받기 도중(수집 ~ 적용 사이) 사용자가 로컬을 바꿨을 때. 트랜잭션을 롤백하고 충돌로 전환한다. */
export class ConflictDuringApply extends Error {
  constructor() {
    super("SYNC_LOCAL_CHANGED_DURING_APPLY");
    this.name = "ConflictDuringApply";
  }
}

const withSource = <T extends { source?: HoldingSource }>(rows: readonly T[]): T[] =>
  rows.map((r) => ({ ...r, source: (r.source ?? "MANUAL") as HoldingSource }));

/**
 * 받은 동기화 데이터를 단일 트랜잭션으로 적용한다(docs/device-sync.md "적용 규칙").
 * - connections: MANUAL만 교체(API 연결 보존). holdings·savings·coin: MANUAL만 교체(AUTO 보존).
 * - pension·debts·assetSnapshots·goal·envelopeItems·envelopeConfig·sectorOverrides: 전체 교체(삭제 전파).
 * - members: 원격 members + 로컬 non-MANUAL 연결이 참조하는 로컬 멤버(원격에 같은 id가 없을 때) 보존.
 * - expectedCanonical: 트랜잭션 안에서 현재 상태를 다시 읽어 **동기 계산한** canonical과 비교, 다르면 롤백.
 *   트랜잭션 안에서는 Dexie 읽기·쓰기와 동기 계산만 한다(crypto.subtle 등 IDB 밖 await 금지 — 트랜잭션이 커밋돼 버린다).
 * 반환: 적용 직후(같은 트랜잭션 안) canonical. 엔진이 트랜잭션 밖에서 해시해 lastSyncedHash로 쓴다.
 */
export async function applySyncPayload(
  remote: SyncData,
  opts: { expectedCanonical?: string } = {},
): Promise<{ canonicalAfter: string }> {
  // 스코프는 db.tables — 수집 함수(readManualTables)가 snapshots까지 읽고, 적용 중 다른 쓰기가 끼지 않게 한다.
  return db.transaction("rw", db.tables, async () => {
    if (opts.expectedCanonical !== undefined) {
      const current = canonicalize(await collectSyncData());
      if (current !== opts.expectedCanonical) {
        throw new ConflictDuringApply();
      }
    }

    // members 병합 — 이 기기 setup이 만든 "나"를 이 기기의 API 연결이 참조하므로 통째로 바꾸면 연결이 고아가 된다.
    const localMembers = await db.members.toArray();
    const apiConnections = (await db.connections.toArray()).filter((c) => c.type !== "MANUAL");
    const referenced = new Set(apiConnections.map((c) => c.memberId));
    const remoteMemberIds = new Set(remote.members.map((m) => m.id));
    const keptMembers = localMembers.filter((m) => referenced.has(m.id) && !remoteMemberIds.has(m.id));
    await db.members.clear();
    await db.members.bulkPut([...remote.members, ...keptMembers]);

    await db.connections.where("type").equals("MANUAL").delete();
    await db.connections.bulkPut(remote.connections.filter((c) => c.type === "MANUAL"));

    await db.holdings.where("source").equals("MANUAL").delete();
    await db.holdings.bulkPut(remote.holdings.filter((h) => (h.source ?? "MANUAL") === "MANUAL"));

    await db.savings.where("source").equals("MANUAL").delete();
    await db.savings.bulkPut(withSource(remote.savings).filter((r) => r.source === "MANUAL"));

    await db.coin.where("source").equals("MANUAL").delete();
    await db.coin.bulkPut(withSource(remote.coin).filter((r) => r.source === "MANUAL"));

    await db.pension.clear();
    await db.pension.bulkPut(remote.pension);
    await db.debts.clear();
    await db.debts.bulkPut(remote.debts);
    await db.assetSnapshots.clear();
    await db.assetSnapshots.bulkPut(remote.assetSnapshots);
    await db.goal.clear();
    await db.goal.bulkPut(remote.goal);
    await db.envelopeItems.clear();
    await db.envelopeItems.bulkPut(remote.envelopeItems);
    await db.envelopeConfig.clear();
    await db.envelopeConfig.bulkPut(remote.envelopeConfig);
    await db.sectorOverrides.clear();
    await db.sectorOverrides.bulkPut(remote.sectorOverrides);

    return { canonicalAfter: canonicalize(await collectSyncData()) };
  });
}
