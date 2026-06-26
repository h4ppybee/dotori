import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAppStore } from "@/stores/app-store";
import { useSessionGuard } from "@/lib/auth/use-session-guard";
import { AUTO_LOCK_MS } from "@/lib/db/session-vault";

beforeEach(() => {
  vi.useFakeTimers();
  useAppStore.setState({ locked: false, sessionKey: null, lastRefreshAt: null });
});

afterEach(() => {
  vi.useRealTimers();
  useAppStore.setState({ locked: true, sessionKey: null, lastRefreshAt: null });
});

describe("useSessionGuard", () => {
  it("마지막 활동 후 AUTO_LOCK_MS가 지나면 잠근다", () => {
    renderHook(() => useSessionGuard());

    act(() => {
      vi.advanceTimersByTime(AUTO_LOCK_MS - 1000);
    });
    expect(useAppStore.getState().locked).toBe(false);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(useAppStore.getState().locked).toBe(true);
  });

  it("활동이 있으면 만료시각을 슬라이딩으로 연장한다", () => {
    renderHook(() => useSessionGuard());

    // 만료 직전까지 진행
    act(() => {
      vi.advanceTimersByTime(AUTO_LOCK_MS - 60_000);
    });
    // 클릭 활동 → 만료시각이 now + AUTO_LOCK_MS로 갱신됨
    act(() => {
      window.dispatchEvent(new MouseEvent("click"));
    });
    // 원래 만료 시점을 지나도 잠기지 않아야 한다
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(useAppStore.getState().locked).toBe(false);
  });

  it("잠긴 상태에서는 타이머를 걸지 않는다", () => {
    useAppStore.setState({ locked: true });
    renderHook(() => useSessionGuard());

    act(() => {
      vi.advanceTimersByTime(AUTO_LOCK_MS * 2);
    });
    // 잠금 상태 유지 (예외 없이)
    expect(useAppStore.getState().locked).toBe(true);
  });
});
