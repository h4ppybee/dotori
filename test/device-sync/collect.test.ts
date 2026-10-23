import { describe, it, expect, afterEach, vi } from "vitest";
import { db } from "@/lib/db/schema";
import { bulkUpdatePension } from "@/lib/db/local-store";
import { refreshSavingsAccrual } from "@/lib/sync/refresh-savings";
import {
  collectSyncData, canonicalize, hashCanonical, HASH_EXCLUDED_FIELDS, SYNC_TABLES, SYNC_VERSION,
  encodeSyncPayload, decodeSyncPayload, SyncVersionError, isEffectivelyEmpty, emptySyncData,
} from "@/lib/device-sync/collect";
import {
  member, manualConnection, apiConnection, holding, savings, coin, pension, syncDataWith,
} from "@/test/device-sync/fixtures";

afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete();
  await db.open();
});

const currentHash = async () => hashCanonical(canonicalize(await collectSyncData()));

describe("collectSyncData", () => {
  it("수동 데이터만 모으고 snapshots는 뺀다", async () => {
    await db.members.put(member("m1"));
    await db.connections.bulkPut([manualConnection("man1", "m1"), apiConnection("api1", "m1")]);
    await db.holdings.bulkPut([holding("h-man", "MANUAL", "man1"), holding("h-auto", "AUTO", "api1")]);
    await db.savings.bulkPut([savings("s-man", 1_000_000), savings("s-auto", 10_000, "AUTO")]);
    await db.coin.bulkPut([coin("c-man"), coin("c-auto", "AUTO")]);
    await db.snapshots.put({ date: "2026-01-01", totalCostKrw: 0, totalValueKrw: 0, totalPnlKrw: 0,
      returnPct: 0, bySectorJson: "{}", byHoldingJson: "{}" });
    await db.sectorOverrides.put({ symbol: "000001", sector: "반도체" });

    const data = await collectSyncData();

    expect(Object.keys(data).sort()).toEqual([...SYNC_TABLES].sort());
    expect(data.connections.map((c) => c.id)).toEqual(["man1"]);
    expect(data.holdings.map((h) => h.id)).toEqual(["h-man"]);
    expect(data.savings.map((s) => s.id)).toEqual(["s-man"]);
    expect(data.coin.map((c) => c.id)).toEqual(["c-man"]);
    expect(data.sectorOverrides).toEqual([{ symbol: "000001", sector: "반도체" }]);
    expect("snapshots" in data).toBe(false);
  });
});

describe("canonicalize", () => {
  it("해시 제외 필드는 모든 테이블의 updatedAt과 pension.currentPrice다", () => {
    expect(HASH_EXCLUDED_FIELDS).toEqual({ "*": ["updatedAt"], pension: ["currentPrice"] });
  });

  it("행 순서·키 순서·updatedAt·연금 현재가에 영향받지 않는다", () => {
    const a = syncDataWith({
      savings: [savings("s1", 1_000_000), savings("s2", 2_000_000)],
      pension: [pension("p1", 10_000)],
    });
    const restamped = { ...savings("s1", 1_000_000), updatedAt: 999 };
    const keyShuffled = Object.fromEntries(Object.entries(restamped).reverse()) as typeof restamped;
    const b = syncDataWith({
      savings: [savings("s2", 2_000_000), keyShuffled],
      pension: [pension("p1", 12_345)],
    });
    expect(canonicalize(b)).toBe(canonicalize(a));
  });

  it("실제 값이 바뀌면 달라진다", () => {
    const a = syncDataWith({ savings: [savings("s1", 1_000_000)] });
    const b = syncDataWith({ savings: [savings("s1", 1_000_001)] });
    expect(canonicalize(b)).not.toBe(canonicalize(a));
  });

  it("빠진 테이블은 빈 배열과 같다", () => {
    expect(canonicalize({ savings: [] })).toBe(canonicalize(emptySyncData()));
  });

  it("sectorOverrides는 기본 키(symbol)로 정렬한다", () => {
    const a = syncDataWith({ sectorOverrides: [{ symbol: "B", sector: "x" }, { symbol: "A", sector: "y" }] });
    const b = syncDataWith({ sectorOverrides: [{ symbol: "A", sector: "y" }, { symbol: "B", sector: "x" }] });
    expect(canonicalize(a)).toBe(canonicalize(b));
  });
});

describe("hashCanonical", () => {
  it("SHA-256 hex", async () => {
    expect(await hashCanonical("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("연금 시세 갱신(bulkUpdatePension)만으로는 해시가 바뀌지 않는다", async () => {
    await db.pension.put(pension("p1", 10_000));
    const before = await currentHash();
    await bulkUpdatePension([pension("p1", 15_000)]);
    expect(await currentHash()).toBe(before);
  });

  it("예적금 자동 증가는 같은 입력이면 실행 시각과 무관하게 같은 해시가 된다", async () => {
    const deposit = {
      ...savings("d1", 5_000_000), category: "DEPOSIT" as const,
      monthlyDeposit: 500_000, maturityDate: "2027-01-24", balanceAsOf: "2026-01-10",
    };
    await db.savings.put(deposit);
    const before = await currentHash();

    vi.spyOn(Date, "now").mockReturnValue(1_000);
    await refreshSavingsAccrual({ today: "2026-03-01" });
    const first = await currentHash();

    await db.savings.put(deposit);
    vi.spyOn(Date, "now").mockReturnValue(9_999_999);
    await refreshSavingsAccrual({ today: "2026-03-01" });

    expect(await currentHash()).toBe(first);
    expect(first).not.toBe(before);
    expect((await db.savings.get("d1"))?.amount).toBe(6_000_000); // 01-25·02-25 두 번 납입
  });
});

describe("동기화 평문", () => {
  it("encode → decode 왕복", () => {
    const data = syncDataWith({ savings: [savings("s1", 1_000_000)] });
    const decoded = decodeSyncPayload(encodeSyncPayload(data, 42));
    expect(decoded.sentAt).toBe(42);
    expect(decoded.data).toEqual(data);
  });

  it("앱보다 높은 syncVersion이면 SyncVersionError", () => {
    const text = JSON.stringify({ syncVersion: SYNC_VERSION + 1, data: {}, sentAt: 1 });
    expect(() => decodeSyncPayload(text)).toThrow(SyncVersionError);
  });

  it("형식이 아니면 오류", () => {
    expect(() => decodeSyncPayload("{}")).toThrow();
    expect(() => decodeSyncPayload("not json")).toThrow();
  });
});

describe("isEffectivelyEmpty", () => {
  it("setup이 만든 멤버 1명만 있으면 비어 있다고 본다", () => {
    expect(isEffectivelyEmpty(syncDataWith({ members: [member("m1")] }))).toBe(true);
  });

  it("수동 데이터가 하나라도 있거나 멤버가 둘 이상이면 비어 있지 않다", () => {
    expect(isEffectivelyEmpty(syncDataWith({ savings: [savings("s1", 1)] }))).toBe(false);
    expect(isEffectivelyEmpty(syncDataWith({ members: [member("m1"), member("m2")] }))).toBe(false);
  });
});
