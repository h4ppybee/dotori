import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

// 동기화 설정 읽기·저장 사이의 순서를 테스트에서 제어한다(나머지 local-store는 실제 구현).
const gate = vi.hoisted(() => ({ release: null as null | (() => void), armed: false }));

vi.mock("@/lib/db/local-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/local-store")>();
  return {
    ...actual,
    // 무장된 첫 읽기는 값(설정 없음)을 읽은 뒤 저장이 끝날 때까지(최대 50ms) 돌아오지 않는다.
    getSyncConfig: async () => {
      const value = await actual.getSyncConfig();
      if (gate.armed) {
        gate.armed = false;
        await new Promise<void>((resolve) => {
          gate.release = resolve;
          setTimeout(resolve, 50);
        });
      }
      return value;
    },
    saveSyncConfig: async (...args: Parameters<typeof actual.saveSyncConfig>) => {
      const rec = await actual.saveSyncConfig(...args);
      gate.release?.();
      return rec;
    },
  };
});

import { db } from "@/lib/db/schema";
import { useAppStore } from "@/stores/app-store";
import { getSyncConfig } from "@/lib/db/local-store";
import { pushIfChanged, startFirstDevice, setDeviceSyncQueryClient } from "@/lib/device-sync/engine";
import { createFakeSyncServer } from "@/test/device-sync/fake-server";
import { seedSheetOnly, TEST_SECRET } from "@/test/device-sync/helpers";
import { savings } from "@/test/device-sync/fixtures";

let server: ReturnType<typeof createFakeSyncServer>;

beforeEach(() => {
  server = createFakeSyncServer(TEST_SECRET);
  vi.stubGlobal("fetch", server.fetch);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  gate.armed = false;
  gate.release = null;
  setDeviceSyncQueryClient(null);
  useAppStore.setState({ locked: true, sessionKey: null, lastDeviceSync: null, syncConflict: null, dismissedConflictRevision: null });
  await db.delete();
  await db.open();
});

describe("startFirstDevice — 진행 중인 올리기와 겹칠 때", () => {
  it("설정이 생기기 전에 시작된 올리기(skipped)를 재사용하지 않고 직접 첫 올리기를 한다", async () => {
    await seedSheetOnly();
    await db.savings.put(savings("s1", 1_000_000));

    gate.armed = true;
    const pending = pushIfChanged(); // 통합 갱신 onSuccess 등 — 아직 설정이 없다
    const result = await startFirstDevice({ deviceName: "d" });

    expect(await pending).toEqual({ status: "skipped" });
    expect(result.status).toBe("ok");
    expect(server.revision()).toBe(1);
    expect((await getSyncConfig())?.lastRevision).toBe(1);
  });
});
