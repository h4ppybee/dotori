import { describe, it, expect, afterEach } from "vitest";
import { useAppStore } from "@/stores/app-store";
import { deriveKey, makeSalt } from "@/lib/crypto/crypto";

afterEach(() => {
  useAppStore.setState({ locked: true, sessionKey: null, lastRefreshAt: null });
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
});
