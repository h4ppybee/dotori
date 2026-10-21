import { describe, it, expect, afterEach } from "vitest";
import { useAppStore } from "@/stores/app-store";
import { deriveKey, makeSalt } from "@/lib/crypto/crypto";

afterEach(() => {
  useAppStore.setState({ locked: true, sessionKey: null, lastRefreshAt: null, lastSheetExport: null });
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
});
