import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { db } from "@/lib/db/schema";
import { useAppStore } from "@/stores/app-store";
import { getSyncConfig } from "@/lib/db/local-store";
import { generateSyncKey } from "@/lib/device-sync/key";
import { DEVICE_SYNC_MESSAGES } from "@/lib/device-sync/messages";
import {
  pullIfNewer, pushIfChanged, syncNow, resolveConflict, awaitPendingPull, pendingPullPromise,
  startDeviceSync, setDeviceSyncQueryClient, dismissConflict,
} from "@/lib/device-sync/engine";
import { createFakeSyncServer } from "@/test/device-sync/fake-server";
import { seedSyncedDevice, localHash, makeSessionKey, TEST_SECRET } from "@/test/device-sync/helpers";
import { member, apiConnection, savings, syncDataWith } from "@/test/device-sync/fixtures";

let server: ReturnType<typeof createFakeSyncServer>;

beforeEach(() => {
  server = createFakeSyncServer(TEST_SECRET);
  vi.stubGlobal("fetch", server.fetch);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  setDeviceSyncQueryClient(null);
  useAppStore.setState({ locked: true, sessionKey: null, lastDeviceSync: null, syncConflict: null, dismissedConflictRevision: null });
  await db.delete();
  await db.open();
});

const fakeQueryClient = () => ({ invalidateQueries: vi.fn() });

describe("pullIfNewer", () => {
  it("동기화가 꺼져 있으면 요청하지 않는다", async () => {
    useAppStore.setState({ locked: false, sessionKey: await makeSessionKey() });
    expect(await pullIfNewer()).toEqual({ status: "skipped" });
    expect(server.calls).toEqual([]);
  });

  it("서버 revision이 마지막과 같으면 meta만 보고 끝낸다", async () => {
    const key = generateSyncKey();
    await server.remotePut(key, syncDataWith({}));
    await seedSyncedDevice({ key, lastRevision: 1, lastSyncedHash: "h" });
    expect((await pullIfNewer()).status).toBe("noop");
    expect(server.calls).toEqual(["sync.meta"]);
  });

  it("로컬이 그대로면 받아서 적용하고, 재계산 해시·revision을 기록하고, 쿼리를 무효화한다", async () => {
    const key = generateSyncKey();
    await server.remotePut(key, syncDataWith({ savings: [savings("s1", 5_000_000)] }));
    await seedSyncedDevice({ key, lastSyncedHash: await localHash() });
    const client = fakeQueryClient();
    setDeviceSyncQueryClient(client);

    const outcome = await pullIfNewer();

    expect(outcome).toMatchObject({ status: "applied", remote: { revision: 1, deviceName: "다른 기기" } });
    expect((await db.savings.get("s1"))?.amount).toBe(5_000_000);
    const cfg = await getSyncConfig();
    expect(cfg?.lastRevision).toBe(1);
    expect(cfg?.lastSyncedHash).toBe(await localHash());
    expect(client.invalidateQueries).toHaveBeenCalled();
    expect(useAppStore.getState().lastDeviceSync).toMatchObject({ status: "ok", remote: { deviceName: "다른 기기" } });
  });

  it("로컬도 바뀌었지만 내용이 원격과 같으면 자동 해소한다(다이얼로그 없음)", async () => {
    const key = generateSyncKey();
    await server.remotePut(key, syncDataWith({ savings: [{ ...savings("s1", 1_000_000), updatedAt: 777 }] }));
    await seedSyncedDevice({ key, lastSyncedHash: "old-hash" });
    await db.savings.put(savings("s1", 1_000_000));

    expect((await pullIfNewer()).status).toBe("autoResolved");
    expect(useAppStore.getState().syncConflict).toBeNull();
    const cfg = await getSyncConfig();
    expect(cfg?.lastRevision).toBe(1);
    expect(cfg?.lastSyncedHash).toBe(await localHash());
  });

  it("로컬과 원격이 모두 바뀌었으면 충돌로 표시하고 적용하지 않는다", async () => {
    const key = generateSyncKey();
    await server.remotePut(key, syncDataWith({ savings: [savings("s1", 2_000_000)] }));
    await seedSyncedDevice({ key, lastSyncedHash: "old-hash" });
    await db.savings.put(savings("s1", 1_000_000));

    expect((await pullIfNewer()).status).toBe("conflict");
    expect(useAppStore.getState().syncConflict).toEqual({
      remote: { revision: 1, savedAt: expect.any(String), deviceName: "다른 기기" },
    });
    expect((await db.savings.get("s1"))?.amount).toBe(1_000_000);
    expect((await getSyncConfig())?.lastRevision).toBe(0);
  });

  it("받는 도중 잠기면 충돌 다이얼로그를 띄우지 않는다(기록만 남긴다)", async () => {
    const key = generateSyncKey();
    await server.remotePut(key, syncDataWith({ savings: [savings("s1", 2_000_000)] }));
    await seedSyncedDevice({ key, lastSyncedHash: "old-hash" });
    await db.savings.put(savings("s1", 1_000_000));
    let release!: () => void;
    server.hooks.beforeGet = () => new Promise<void>((resolve) => { release = resolve; });

    const pulling = pullIfNewer();
    await vi.waitFor(() => expect(server.calls).toContain("sync.get"));
    useAppStore.getState().lock();
    release();

    expect((await pulling).status).toBe("conflict");
    expect(useAppStore.getState().syncConflict).toBeNull();
    expect(useAppStore.getState().lastDeviceSync).toMatchObject({ status: "conflict" });
  });

  it("meta와 get 사이에 다른 기기가 올리면 get 응답의 revision을 기록한다", async () => {
    const key = generateSyncKey();
    await server.remotePut(key, syncDataWith({ savings: [savings("s1", 1_000_000)] }));
    await seedSyncedDevice({ key, lastSyncedHash: await localHash() });
    server.hooks.afterMeta = () => server.remotePut(key, syncDataWith({ savings: [savings("s1", 3_000_000)] }));

    expect(await pullIfNewer()).toMatchObject({ status: "applied", remote: { revision: 2 } });
    expect((await getSyncConfig())?.lastRevision).toBe(2);
    expect((await db.savings.get("s1"))?.amount).toBe(3_000_000);
  });

  it("서버 keyId가 내 키와 다르면 오류를 기록하고 적용하지 않는다", async () => {
    await server.remotePut(generateSyncKey(), syncDataWith({ savings: [savings("s1", 1)] }));
    await seedSyncedDevice({ lastSyncedHash: await localHash() });

    expect(await pullIfNewer()).toEqual({ status: "error", message: DEVICE_SYNC_MESSAGES.keyMismatch });
    expect(await db.savings.count()).toBe(0);
    expect(useAppStore.getState().lastDeviceSync).toMatchObject({ status: "error", message: DEVICE_SYNC_MESSAGES.keyMismatch });
  });

  it("멤버 병합으로 원격과 달라진 기기도 다음 받기가 충돌이 되지 않는다", async () => {
    const key = generateSyncKey();
    await db.members.put(member("m-local"));
    await db.connections.put(apiConnection("api1", "m-local"));
    await server.remotePut(key, syncDataWith({ members: [member("m-remote")] }));
    await seedSyncedDevice({ key, lastSyncedHash: await localHash() });

    expect((await pullIfNewer()).status).toBe("applied");
    await server.remotePut(key, syncDataWith({ members: [member("m-remote")], savings: [savings("s1", 1_000_000)] }));
    expect((await pullIfNewer()).status).toBe("applied");
    expect((await db.members.toArray()).map((m) => m.id).sort()).toEqual(["m-local", "m-remote"]);
  });

  it("동시에 두 번 부르면 같은 프로미스를 돌려준다(single-flight)", async () => {
    await seedSyncedDevice();
    const a = pullIfNewer();
    const b = pullIfNewer();
    expect(b).toBe(a);
    await a;
    expect(server.calls.filter((c) => c === "sync.meta")).toHaveLength(1);
  });
});

describe("awaitPendingPull", () => {
  it("받기가 없으면 바로 끝난다", async () => {
    await expect(awaitPendingPull(10)).resolves.toBeUndefined();
  });

  it("타임아웃이 나면 그 받기를 보류해 적용하지 않는다", async () => {
    const key = generateSyncKey();
    await server.remotePut(key, syncDataWith({ savings: [savings("s1", 5_000_000)] }));
    await seedSyncedDevice({ key, lastSyncedHash: await localHash() });
    let release!: () => void;
    server.hooks.beforeGet = () => new Promise<void>((resolve) => { release = resolve; });

    const pulling = pullIfNewer();
    await awaitPendingPull(10);
    await vi.waitFor(() => expect(server.calls).toContain("sync.get"));
    release();

    expect(await pulling).toEqual({ status: "deferred" });
    expect(await db.savings.count()).toBe(0);
    expect((await getSyncConfig())?.lastRevision).toBe(0);
  });

  it("제때 끝나면 적용된 뒤에 돌아온다", async () => {
    const key = generateSyncKey();
    await server.remotePut(key, syncDataWith({ savings: [savings("s1", 5_000_000)] }));
    await seedSyncedDevice({ key, lastSyncedHash: await localHash() });

    void pullIfNewer();
    await awaitPendingPull(5_000);
    expect((await db.savings.get("s1"))?.amount).toBe(5_000_000);
  });
});

describe("pushIfChanged", () => {
  it("바뀐 내용이 있으면 올리고, 다시 부르면 요청 없이 끝낸다", async () => {
    await seedSyncedDevice({ lastSyncedHash: await localHash() });
    await db.savings.put(savings("s1", 1_000_000));

    expect(await pushIfChanged()).toMatchObject({ status: "pushed", remote: { revision: 1, deviceName: "이 기기" } });
    expect(server.revision()).toBe(1);
    const cfg = await getSyncConfig();
    expect(cfg?.lastRevision).toBe(1);
    expect(cfg?.lastSyncedHash).toBe(await localHash());

    server.calls.length = 0;
    expect((await pushIfChanged()).status).toBe("noop");
    expect(server.calls).toEqual([]);
  });

  it("CONFLICT면 받기 경로로 가서 충돌 다이얼로그를 띄운다", async () => {
    const key = generateSyncKey();
    await server.remotePut(key, syncDataWith({ savings: [savings("s1", 2_000_000)] }));
    await seedSyncedDevice({ key, lastSyncedHash: "old-hash" });
    await db.savings.put(savings("s1", 1_000_000));

    expect((await pushIfChanged()).status).toBe("conflict");
    expect(useAppStore.getState().syncConflict?.remote.revision).toBe(1);
    expect(server.revision()).toBe(1);
  });
});

describe("syncNow", () => {
  it("빈 서버에서는 받을 것이 없으니 바로 올린다", async () => {
    await seedSyncedDevice();
    await db.savings.put(savings("s1", 1_000_000));
    expect((await syncNow()).status).toBe("pushed");
    expect(server.calls).toEqual(["sync.meta", "sync.put"]);
  });
});

describe("충돌 다이얼로그 닫기(보류)", () => {
  async function seedConflict() {
    const key = generateSyncKey();
    await server.remotePut(key, syncDataWith({ savings: [savings("s1", 2_000_000)] }));
    await seedSyncedDevice({ key, lastSyncedHash: "old-hash" });
    await db.savings.put(savings("s1", 1_000_000));
    expect((await pullIfNewer()).status).toBe("conflict");
    return key;
  }

  it("닫은 revision은 자동 동기화에서 다시 띄우지 않고, 새 revision이 오면 다시 띄운다", async () => {
    const key = await seedConflict();
    dismissConflict();

    expect((await pullIfNewer()).status).toBe("conflict");
    expect(useAppStore.getState().syncConflict).toBeNull();
    expect(useAppStore.getState().lastDeviceSync).toMatchObject({ status: "conflict" });

    await server.remotePut(key, syncDataWith({ savings: [savings("s1", 3_000_000)] }));
    expect((await pullIfNewer()).status).toBe("conflict");
    expect(useAppStore.getState().syncConflict?.remote.revision).toBe(2);
  });

  it("'지금 동기화하기'(사용자 요청)는 닫은 revision이어도 다시 띄운다", async () => {
    await seedConflict();
    dismissConflict();

    expect((await syncNow({ reopenDismissedConflict: true })).status).toBe("conflict");
    expect(useAppStore.getState().syncConflict?.remote.revision).toBe(1);
  });
});

describe("resolveConflict", () => {
  async function seedConflict() {
    const key = generateSyncKey();
    await server.remotePut(key, syncDataWith({ savings: [savings("s1", 2_000_000)] }));
    await seedSyncedDevice({ key, lastSyncedHash: "old-hash" });
    await db.savings.put(savings("s1", 1_000_000));
    expect((await pullIfNewer()).status).toBe("conflict");
  }

  it("이 기기 내용으로 덮기 → force put, 충돌 해제", async () => {
    await seedConflict();
    expect((await resolveConflict("local")).status).toBe("pushed");
    expect(server.revision()).toBe(2);
    expect(useAppStore.getState().syncConflict).toBeNull();
    expect((await getSyncConfig())?.lastSyncedHash).toBe(await localHash());
  });

  it("다른 기기 내용 받기 → 기대값 비교 없이 적용", async () => {
    await seedConflict();
    expect((await resolveConflict("remote")).status).toBe("applied");
    expect((await db.savings.get("s1"))?.amount).toBe(2_000_000);
    expect(useAppStore.getState().syncConflict).toBeNull();
    expect((await getSyncConfig())?.lastRevision).toBe(1);
  });
});

describe("startDeviceSync", () => {
  it("등록 시점에 이미 잠금 해제 상태면 즉시 받기를 시작한다", async () => {
    await seedSyncedDevice();
    const stop = startDeviceSync(fakeQueryClient());
    expect(pendingPullPromise()).not.toBeNull();
    await awaitPendingPull();
    expect(server.calls).toContain("sync.meta");
    stop();
  });

  it("잠금 해제되는 순간 동기적으로 받기를 시작한다", async () => {
    const { sessionKey } = await seedSyncedDevice();
    useAppStore.setState({ locked: true, sessionKey: null });
    const stop = startDeviceSync(fakeQueryClient());
    expect(pendingPullPromise()).toBeNull();

    useAppStore.getState().unlock(sessionKey);
    expect(pendingPullPromise()).not.toBeNull(); // 같은 틱 — React effect보다 먼저 잡힌다
    await awaitPendingPull();
    expect(server.calls).toContain("sync.meta");
    stop();
  });

  it("세션 키 교체(PIN 변경)는 받기를 시작하지 않는다", async () => {
    await seedSyncedDevice();
    const stop = startDeviceSync(fakeQueryClient());
    await awaitPendingPull();
    server.calls.length = 0;
    useAppStore.getState().unlock(await makeSessionKey());
    expect(pendingPullPromise()).toBeNull();
    stop();
  });
});
