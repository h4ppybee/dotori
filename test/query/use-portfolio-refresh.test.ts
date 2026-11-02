import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAppStore } from "@/stores/app-store";
import { QueryWrapper } from "@/test/utils/query";
import { makeSessionKey } from "@/test/device-sync/helpers";

vi.mock("@/lib/sync/refresh", () => ({ refreshAll: vi.fn() }));
vi.mock("@/lib/device-sync/engine", () => ({ awaitPendingPull: vi.fn() }));

import { refreshAll } from "@/lib/sync/refresh";
import { awaitPendingPull } from "@/lib/device-sync/engine";
import { useRefresh } from "@/lib/query/use-portfolio";

afterEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ locked: true, sessionKey: null, lastRefreshAt: null });
});

describe("useRefresh(주식)", () => {
  it("진행 중인 받기를 먼저 기다린다", async () => {
    useAppStore.setState({ locked: false, sessionKey: await makeSessionKey() });
    vi.mocked(refreshAll).mockResolvedValue({ vm: {} as never, failures: [] });
    let release!: () => void;
    vi.mocked(awaitPendingPull).mockReturnValueOnce(new Promise<void>((resolve) => { release = resolve; }));

    const { result } = renderHook(() => useRefresh(), { wrapper: QueryWrapper });
    result.current.mutate();

    await waitFor(() => expect(awaitPendingPull).toHaveBeenCalled());
    expect(refreshAll).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(refreshAll).toHaveBeenCalled();
  });
});
