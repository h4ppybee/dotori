import { describe, it, expect, afterEach } from "vitest";
import { useAppStore } from "@/stores/app-store";
import { deriveKey, makeSalt } from "@/lib/crypto/crypto";

afterEach(() => {
  useAppStore.setState({ locked: true, sessionKey: null, lastRefreshAt: null, lastSheetExport: null, lastDeviceSync: null, syncConflict: null });
});

describe("app-store", () => {
  it("starts locked with no session key", () => {
    const s = useAppStore.getState();
    expect(s.locked).toBe(true);
    expect(s.sessionKey).toBeNull();
    expect(s.lastRefreshAt).toBeNull();
  });

  it("unlock stores the key and clears lock", async () => {
    const key = await deriveKey("pp", makeSalt());
    useAppStore.getState().unlock(key);
    const s = useAppStore.getState();
    expect(s.locked).toBe(false);
    expect(s.sessionKey).toBe(key);
  });

  it("lock clears the key and re-locks", async () => {
    const key = await deriveKey("pp", makeSalt());
    useAppStore.getState().unlock(key);
    useAppStore.getState().lock();
    const s = useAppStore.getState();
    expect(s.locked).toBe(true);
    expect(s.sessionKey).toBeNull();
  });

  it("setLastRefresh updates the timestamp", () => {
    useAppStore.getState().setLastRefresh(1234);
    expect(useAppStore.getState().lastRefreshAt).toBe(1234);
  });

  it("setLastSheetExport는 마지막 결과를 기록하고 localStorage에 영속화한다", () => {
    useAppStore.getState().setLastSheetExport({ at: 10, status: "error", message: "실패" });
    expect(useAppStore.getState().lastSheetExport).toEqual({ at: 10, status: "error", message: "실패" });
    const persisted = JSON.parse(localStorage.getItem("dotori-app") ?? "{}");
    expect(persisted.state.lastSheetExport).toEqual({ at: 10, status: "error", message: "실패" });
  });

  it("clearLastSheetExport는 마지막 결과를 지운다", () => {
    useAppStore.getState().setLastSheetExport({ at: 10, status: "error", message: "실패" });
    useAppStore.getState().clearLastSheetExport();
    expect(useAppStore.getState().lastSheetExport).toBeNull();
    const persisted = JSON.parse(localStorage.getItem("dotori-app") ?? "{}");
    expect(persisted.state.lastSheetExport).toBeNull();
  });
  it("setLastDeviceSync는 기록하고 localStorage에 영속화한다", () => {
    const status = {
      at: 10, status: "ok" as const,
      remote: { revision: 2, savedAt: "2026-01-01T00:00:00.000Z", deviceName: "다른 기기" },
    };
    useAppStore.getState().setLastDeviceSync(status);
    expect(useAppStore.getState().lastDeviceSync).toEqual(status);
    const persisted = JSON.parse(localStorage.getItem("dotori-app") ?? "{}");
    expect(persisted.state.lastDeviceSync).toEqual(status);
  });

  it("clearLastDeviceSync는 기록을 지운다", () => {
    useAppStore.getState().setLastDeviceSync({ at: 10, status: "error", message: "실패" });
    useAppStore.getState().clearLastDeviceSync();
    expect(useAppStore.getState().lastDeviceSync).toBeNull();
  });

  it("syncConflict는 영속화하지 않고, 잠그면 비운다", async () => {
    const key = await deriveKey("pp", makeSalt());
    useAppStore.getState().unlock(key);
    useAppStore.getState().setSyncConflict({ remote: { revision: 3, savedAt: "S", deviceName: "다른 기기" } });
    const persisted = JSON.parse(localStorage.getItem("dotori-app") ?? "{}");
    expect(persisted.state.syncConflict).toBeUndefined();
    useAppStore.getState().lock();
    expect(useAppStore.getState().syncConflict).toBeNull();
  });
});
