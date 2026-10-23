import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { db } from "@/lib/db/schema";
import { useAppStore } from "@/stores/app-store";
import { getSyncConfig } from "@/lib/db/local-store";
import { generateSyncKey, formatSyncKey, keyIdOf, parseSyncKey } from "@/lib/device-sync/key";
import { DEVICE_SYNC_MESSAGES } from "@/lib/device-sync/messages";
import {
  startFirstDevice, prepareConnect, connectExistingDevice, restartWithNewKey, disableDeviceSync,
  revealConnectionInfo, setDeviceSyncQueryClient, pullIfNewer,
} from "@/lib/device-sync/engine";
import { createFakeSyncServer } from "@/test/device-sync/fake-server";
import {
  seedSheetOnly, seedSyncedDevice, localHash, makeSessionKey, TEST_SECRET, TEST_WEB_APP_URL,
} from "@/test/device-sync/helpers";
import { member, savings, syncDataWith } from "@/test/device-sync/fixtures";

let server: ReturnType<typeof createFakeSyncServer>;

beforeEach(() => {
  server = createFakeSyncServer(TEST_SECRET);
  vi.stubGlobal("fetch", server.fetch);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setDeviceSyncQueryClient(null);
  useAppStore.setState({ locked: true, sessionKey: null, lastDeviceSync: null, syncConflict: null, dismissedConflictRevision: null });
  await db.delete();
  await db.open();
});

describe("startFirstDevice", () => {
  it("빈 서버면 키를 만들어 저장하고 첫 올리기를 한다", async () => {
    await seedSheetOnly();
    await db.savings.put(savings("s1", 1_000_000));

    const result = await startFirstDevice({ deviceName: "Mac Chrome" });

    expect(result.status).toBe("ok");
    const cfg = await getSyncConfig();
    expect(cfg?.deviceName).toBe("Mac Chrome");
    expect(server.revision()).toBe(1);
    expect(cfg?.lastRevision).toBe(1);
    expect(cfg?.lastSyncedHash).toBe(await localHash());
    if (result.status === "ok") {
      expect(cfg?.keyId).toBe(await keyIdOf(parseOrThrow(result.keyText)));
    }
  });

  it("이미 다른 기기가 시작했으면 alreadyStarted, 설정을 만들지 않는다", async () => {
    await server.remotePut(generateSyncKey(), syncDataWith({}));
    await seedSheetOnly();
    expect(await startFirstDevice({ deviceName: "d" })).toEqual({ status: "alreadyStarted" });
    expect(await getSyncConfig()).toBeUndefined();
  });

  it("시작 확인과 첫 올리기 사이에 다른 기기가 먼저 시작하면(KEY_MISMATCH) 오류를 돌려주고 설정을 지운다", async () => {
    await seedSheetOnly();
    const otherKey = generateSyncKey();
    server.hooks.afterMeta = () => server.remotePut(otherKey, syncDataWith({}));

    const result = await startFirstDevice({ deviceName: "d" });

    expect(result).toEqual({ status: "error", message: DEVICE_SYNC_MESSAGES.keyMismatch });
    expect(await getSyncConfig()).toBeUndefined();
    expect(server.keyId()).toBe(await keyIdOf(otherKey));
    expect(useAppStore.getState().syncConflict).toBeNull();
  });

  it("첫 올리기가 네트워크 오류로 실패하면 오류를 돌려주고 설정을 지운다", async () => {
    await seedSheetOnly();
    vi.stubGlobal("fetch", failPutFetch());

    const result = await startFirstDevice({ deviceName: "d" });

    expect(result).toEqual({ status: "error", message: DEVICE_SYNC_MESSAGES.network });
    expect(await getSyncConfig()).toBeUndefined();
    expect(server.revision()).toBe(0);
  });

  it("시트 연결이 없으면 안내 오류", async () => {
    useAppStore.setState({ locked: false, sessionKey: await makeSessionKey() });
    expect(await startFirstDevice({ deviceName: "d" })).toEqual({ status: "error", message: DEVICE_SYNC_MESSAGES.sheetRequired });
  });
});

describe("prepareConnect / connectExistingDevice", () => {
  it("키 형식·시작 여부·keyId를 먼저 확인한다", async () => {
    await seedSheetOnly();
    expect(await prepareConnect("not-a-key")).toEqual({ status: "error", message: DEVICE_SYNC_MESSAGES.invalidKey });
    expect(await prepareConnect(formatSyncKey(generateSyncKey())))
      .toEqual({ status: "error", message: DEVICE_SYNC_MESSAGES.notStarted });
    await server.remotePut(generateSyncKey(), syncDataWith({}));
    expect(await prepareConnect(formatSyncKey(generateSyncKey())))
      .toEqual({ status: "error", message: DEVICE_SYNC_MESSAGES.keyMismatch });
  });

  it("setup이 만든 멤버 1명만 있으면 '데이터 없음', 수동 데이터가 있으면 확인이 필요하다", async () => {
    const key = generateSyncKey();
    await server.remotePut(key, syncDataWith({}));
    await seedSheetOnly();
    await db.members.put(member("m-setup"));
    expect(await prepareConnect(formatSyncKey(key))).toEqual({ status: "ready", hasLocalData: false });
    await db.savings.put(savings("s-local", 1));
    expect(await prepareConnect(formatSyncKey(key))).toEqual({ status: "ready", hasLocalData: true });
  });

  it("연결하면 원격으로 교체하고 revision·해시를 기록한다", async () => {
    const key = generateSyncKey();
    await server.remotePut(key, syncDataWith({ savings: [savings("s-remote", 5_000_000)] }));
    await seedSheetOnly();
    await db.savings.put(savings("s-local", 1));

    const outcome = await connectExistingDevice({ keyText: formatSyncKey(key).toLowerCase(), deviceName: "iPhone Safari" });

    expect(outcome.status).toBe("applied");
    expect((await db.savings.toArray()).map((s) => s.id)).toEqual(["s-remote"]);
    const cfg = await getSyncConfig();
    expect(cfg?.lastRevision).toBe(1);
    expect(cfg?.deviceName).toBe("iPhone Safari");
    expect(cfg?.lastSyncedHash).toBe(await localHash());
  });

  it("예상하지 못한 예외도 throw하지 않고 오류 결과로 돌려준다", async () => {
    const key = generateSyncKey();
    await server.remotePut(key, syncDataWith({}));
    await seedSheetOnly();
    vi.spyOn(db.syncConfig, "put").mockRejectedValueOnce(new Error("boom"));

    const outcome = await connectExistingDevice({ keyText: formatSyncKey(key), deviceName: "d" });

    expect(outcome).toEqual({ status: "error", message: `${DEVICE_SYNC_MESSAGES.unexpected} boom` });
    expect(await getSyncConfig()).toBeUndefined();
  });

  it("받기에 실패하면 저장한 설정을 지운다", async () => {
    await seedSheetOnly();
    const outcome = await connectExistingDevice({ keyText: formatSyncKey(generateSyncKey()), deviceName: "d" });
    expect(outcome.status).not.toBe("applied");
    expect(await getSyncConfig()).toBeUndefined();
  });
});

describe("restartWithNewKey", () => {
  it("새 키로 바꾸고 reset put으로 서버 keyId를 교체한다(revision은 이어간다)", async () => {
    const oldKey = generateSyncKey();
    await server.remotePut(oldKey, syncDataWith({}));
    await seedSyncedDevice({ key: oldKey, lastRevision: 1, lastSyncedHash: await localHash() });
    await db.savings.put(savings("s1", 1_000_000));

    const result = await restartWithNewKey();

    expect(result.status).toBe("ok");
    expect(server.revision()).toBe(2);
    expect(server.keyId()).not.toBe(await keyIdOf(oldKey));
    expect(server.keyId()).toBe((await getSyncConfig())?.keyId);
  });

  it("reset put이 실패하면 이전 설정(키·revision·해시)을 되돌리고 오류를 돌려준다", async () => {
    const oldKey = generateSyncKey();
    await server.remotePut(oldKey, syncDataWith({}));
    const hash = await localHash();
    await seedSyncedDevice({ key: oldKey, lastRevision: 1, lastSyncedHash: hash });
    const before = await getSyncConfig();
    vi.stubGlobal("fetch", failPutFetch());

    const result = await restartWithNewKey();

    expect(result).toEqual({ status: "error", message: DEVICE_SYNC_MESSAGES.network });
    expect(await getSyncConfig()).toEqual(before);
    expect(server.keyId()).toBe(await keyIdOf(oldKey));
    expect(await revealConnectionInfo()).toMatchObject({ keyText: formatSyncKey(oldKey) });
  });
});

describe("disableDeviceSync / revealConnectionInfo", () => {
  it("정보 보기는 URL·비밀키·키를 복호화해 돌려주고, 끄면 설정과 기록을 지운다", async () => {
    const { key } = await seedSyncedDevice();
    expect(await revealConnectionInfo()).toEqual({
      webAppUrl: TEST_WEB_APP_URL, secret: TEST_SECRET, keyText: formatSyncKey(key),
    });
    useAppStore.getState().setLastDeviceSync({ at: 1, status: "ok" });

    await disableDeviceSync();

    expect(await getSyncConfig()).toBeUndefined();
    expect(useAppStore.getState().lastDeviceSync).toBeNull();
    expect(await revealConnectionInfo()).toBeNull();
  });

  it("끄기는 throw하지 않고 실패를 오류 결과로 돌려준다", async () => {
    await seedSyncedDevice();
    vi.spyOn(db.syncConfig, "delete").mockRejectedValueOnce(new Error("boom"));
    expect(await disableDeviceSync()).toEqual({ status: "error", message: `${DEVICE_SYNC_MESSAGES.unexpected} boom` });
  });

  it("진행 중인 받기가 끝난 뒤에 끈다 — 끈 뒤에 받기 결과가 적용·기록되지 않는다", async () => {
    const key = generateSyncKey();
    await server.remotePut(key, syncDataWith({ savings: [savings("s1", 5_000_000)] }));
    await seedSyncedDevice({ key, lastSyncedHash: await localHash() });
    let release!: () => void;
    server.hooks.beforeGet = () => new Promise<void>((resolve) => { release = resolve; });

    const pulling = pullIfNewer();
    await vi.waitFor(() => expect(server.calls).toContain("sync.get"));
    const disabling = disableDeviceSync();
    release();

    expect((await pulling).status).toBe("applied");
    expect(await disabling).toEqual({ status: "ok" });
    expect(await getSyncConfig()).toBeUndefined();
    expect(useAppStore.getState().lastDeviceSync).toBeNull();
  });
});

/** sync.put만 네트워크 오류로 실패시키는 fetch(나머지는 가짜 서버로). */
function failPutFetch() {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { action?: string };
    if (body.action === "sync.put") {
      throw new TypeError("Failed to fetch");
    }
    return server.fetch(url, init);
  });
}

function parseOrThrow(text: string) {
  const parsed = parseSyncKey(text);
  if (!parsed) {
    throw new Error("키 형식이 아니에요");
  }
  return parsed;
}
