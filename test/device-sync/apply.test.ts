import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db/schema";
import { collectSyncData, canonicalize } from "@/lib/device-sync/collect";
import { applySyncPayload, ConflictDuringApply } from "@/lib/device-sync/apply";
import {
  member, manualConnection, apiConnection, holding, savings, coin, syncDataWith,
} from "@/test/device-sync/fixtures";

afterEach(async () => {
  await db.delete();
  await db.open();
});

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe("applySyncPayload", () => {
  it("수동 데이터만 교체하고 API 연결·AUTO 행은 보존한다", async () => {
    await db.members.put(member("m1"));
    await db.connections.bulkPut([manualConnection("man-old", "m1"), apiConnection("api1", "m1")]);
    await db.holdings.bulkPut([holding("h-old", "MANUAL", "man-old"), holding("h-auto", "AUTO", "api1")]);
    await db.savings.bulkPut([savings("s-old", 1_000_000), savings("s-auto", 10_000, "AUTO")]);
    await db.coin.bulkPut([coin("c-old"), coin("c-auto", "AUTO")]);
    await db.debts.put({ id: "d-old", category: "CREDIT", name: "신용대출", balance: 1_000_000, sortOrder: 0, updatedAt: 1 });

    await applySyncPayload(syncDataWith({
      members: [member("m1")],
      connections: [manualConnection("man-new", "m1")],
      holdings: [holding("h-new", "MANUAL", "man-new")],
      savings: [savings("s-new", 5_000_000)],
      coin: [coin("c-new")],
    }));

    expect(ids(await db.connections.toArray())).toEqual(["api1", "man-new"]);
    expect(ids(await db.holdings.toArray())).toEqual(["h-auto", "h-new"]);
    expect(ids(await db.savings.toArray())).toEqual(["s-auto", "s-new"]);
    expect(ids(await db.coin.toArray())).toEqual(["c-auto", "c-new"]);
    expect(await db.debts.count()).toBe(0); // 전체 교체 테이블은 원격에 없으면 지워진다
  });

  it("sectorOverrides 삭제를 전파한다", async () => {
    await db.sectorOverrides.bulkPut([{ symbol: "000001", sector: "반도체" }, { symbol: "000002", sector: "인터넷" }]);
    await applySyncPayload(syncDataWith({ sectorOverrides: [{ symbol: "000002", sector: "인터넷" }] }));
    expect(await db.sectorOverrides.toArray()).toEqual([{ symbol: "000002", sector: "인터넷" }]);
  });

  it("멤버는 병합한다: 원격 멤버 + 로컬 API 연결이 참조하는 로컬 멤버", async () => {
    await db.members.bulkPut([member("m-local", "나"), member("m-unused", "예전 멤버")]);
    await db.connections.put(apiConnection("api1", "m-local"));

    await applySyncPayload(syncDataWith({ members: [member("m-remote", "가족 구성원")] }));

    expect(ids(await db.members.toArray())).toEqual(["m-local", "m-remote"]);
  });

  it("원격에 같은 id 멤버가 있으면 원격 값을 쓴다", async () => {
    await db.members.put(member("m1", "이전 이름"));
    await db.connections.put(apiConnection("api1", "m1"));
    await applySyncPayload(syncDataWith({ members: [member("m1", "새 이름")] }));
    expect(await db.members.toArray()).toEqual([{ id: "m1", name: "새 이름" }]);
  });

  it("source가 없는 원격 savings·coin 행은 MANUAL로 채워 넣는다", async () => {
    const legacySavings = { ...savings("s1", 1_000_000) } as Partial<ReturnType<typeof savings>>;
    delete legacySavings.source;
    await applySyncPayload(syncDataWith({ savings: [legacySavings as ReturnType<typeof savings>] }));
    expect((await db.savings.get("s1"))?.source).toBe("MANUAL");
  });

  it("expectedCanonical이 현재 상태와 다르면 ConflictDuringApply로 롤백한다", async () => {
    // 받기를 시작할 때는 비어 있었는데(expected), 적용 직전에 사용자가 s-local을 추가한 상황
    const expected = canonicalize(syncDataWith({}));
    await db.savings.put(savings("s-local", 1_000_000));

    await expect(applySyncPayload(
      syncDataWith({ savings: [savings("s-remote", 2_000_000)] }),
      { expectedCanonical: expected },
    )).rejects.toBeInstanceOf(ConflictDuringApply);

    expect(ids(await db.savings.toArray())).toEqual(["s-local"]);
  });

  it("expectedCanonical이 같으면 적용한다", async () => {
    await db.savings.put(savings("s-local", 1_000_000));
    const expected = canonicalize(await collectSyncData());
    await applySyncPayload(syncDataWith({ savings: [savings("s-remote", 2_000_000)] }), { expectedCanonical: expected });
    expect(ids(await db.savings.toArray())).toEqual(["s-remote"]);
  });

  it("적용 후 canonical(멤버 병합 결과 포함)을 돌려준다", async () => {
    await db.members.put(member("m-local"));
    await db.connections.put(apiConnection("api1", "m-local"));
    const remote = syncDataWith({ members: [member("m-remote")] });

    const { canonicalAfter } = await applySyncPayload(remote);

    expect(canonicalAfter).toBe(canonicalize(await collectSyncData()));
    expect(canonicalAfter).not.toBe(canonicalize(remote)); // 병합으로 보존된 m-local 때문에 원격과 다르다
  });
});
