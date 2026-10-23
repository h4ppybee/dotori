import { describe, it, expect, afterEach } from "vitest";
import Dexie from "dexie";
import { db } from "@/lib/db/schema";
import { decrypt } from "@/lib/crypto/crypto";
import {
  getSyncConfig, saveSyncConfig, updateSyncState, clearSyncConfig,
} from "@/lib/db/local-store";

afterEach(async () => {
  await db.delete();
  await db.open();
});

// PBKDF2(310k)는 느리므로 저장 테스트에는 바로 만든 AES-GCM 키를 세션 키로 쓴다.
const makeSessionKey = () =>
  crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

// 형식 검증은 lib/device-sync/key.ts 몫 — 여기서는 문자열 왕복만 본다.
const KEY_TEXT = "TEST-KEY0-TEXT";

describe("syncConfig 설정", () => {
  it("저장 전에는 undefined", async () => {
    expect(await getSyncConfig()).toBeUndefined();
  });

  it("동기화 키를 세션 키로 암호화해 저장한다", async () => {
    const key = await makeSessionKey();
    await saveSyncConfig(key, {
      syncKeyText: KEY_TEXT, keyId: "0011223344556677", deviceName: "테스트 기기",
      lastRevision: 0, lastSyncedHash: null,
    });
    const cfg = await getSyncConfig();
    expect(cfg?.keyId).toBe("0011223344556677");
    expect(cfg?.deviceName).toBe("테스트 기기");
    expect(cfg?.syncKeyEnc).not.toContain(KEY_TEXT);
    expect(await decrypt(key, cfg!.syncKeyEnc)).toBe(KEY_TEXT);
    expect(cfg?.lastRevision).toBe(0);
    expect(cfg?.lastSyncedHash).toBeNull();
  });

  it("updateSyncState는 revision·해시만 바꾸고, clearSyncConfig는 지운다", async () => {
    const key = await makeSessionKey();
    await saveSyncConfig(key, {
      syncKeyText: KEY_TEXT, keyId: "0011223344556677", deviceName: "테스트 기기",
      lastRevision: 0, lastSyncedHash: null,
    });
    const before = await getSyncConfig();
    await updateSyncState({ lastRevision: 3, lastSyncedHash: "abc" });
    const after = await getSyncConfig();
    expect(after?.lastRevision).toBe(3);
    expect(after?.lastSyncedHash).toBe("abc");
    expect(after?.syncKeyEnc).toBe(before?.syncKeyEnc);
    await clearSyncConfig();
    expect(await getSyncConfig()).toBeUndefined();
  });
});

// v10 시점의 전체 스토어 정의(lib/db/schema.ts의 v1~v10 누적 결과).
const V10_STORES = {
  members: "id",
  connections: "id, memberId, type",
  tokenCache: "connectionId",
  holdings: "id, connectionId, symbol, source",
  priceCache: "key, symbol",
  fxRates: "pair",
  snapshots: "date",
  settings: "id",
  sectorOverrides: "symbol",
  session: "id",
  savings: "id, category, sortOrder, connectionId, source",
  pension: "id, category, sortOrder",
  coin: "id, sortOrder, connectionId, source",
  debts: "id, category, sortOrder",
  assetSnapshots: "id, createdAt",
  goal: "id",
  envelopeItems: "id, profile, sortOrder",
  envelopeConfig: "id",
  sheetExport: "id",
};

describe("Dexie v11 업그레이드", () => {
  it("source가 없는 savings·coin 행을 MANUAL로 채워 인덱스 조회에 잡히게 한다", async () => {
    db.close();
    await Dexie.delete("dotori");
    const legacy = new Dexie("dotori");
    legacy.version(10).stores(V10_STORES);
    await legacy.open();
    await legacy.table("savings").bulkPut([
      { id: "s-legacy", category: "CHECKING", name: "파킹통장", amount: 1_000_000, sortOrder: 0, updatedAt: 1 },
      { id: "s-auto", category: "CHECKING", name: "거래소 원화", amount: 10_000, sortOrder: 1, updatedAt: 1,
        source: "AUTO", connectionId: "api-1" },
    ]);
    await legacy.table("coin").put({
      id: "c-legacy", name: "코인A", quantity: 1, buyPrice: 100, currentPrice: 100, sortOrder: 0, updatedAt: 1,
    });
    legacy.close();

    await db.open();

    expect((await db.savings.where("source").equals("MANUAL").toArray()).map((r) => r.id)).toEqual(["s-legacy"]);
    expect((await db.savings.get("s-auto"))?.source).toBe("AUTO");
    expect((await db.coin.where("source").equals("MANUAL").toArray()).map((r) => r.id)).toEqual(["c-legacy"]);
    expect(await db.syncConfig.count()).toBe(0);
  });
});
