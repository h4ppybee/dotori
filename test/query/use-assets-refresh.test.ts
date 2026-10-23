import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAppStore } from "@/stores/app-store";
import { deriveKey, makeSalt } from "@/lib/crypto/crypto";
import { QueryWrapper } from "@/test/utils/query";

vi.mock("@/lib/sync/refresh", () => ({
  refreshAll: vi.fn(),
  refreshPensionPrices: vi.fn(),
}));
vi.mock("@/lib/sync/refresh-upbit", () => ({ refreshUpbit: vi.fn() }));
vi.mock("@/lib/sync/refresh-savings", () => ({ refreshSavingsAccrual: vi.fn() }));
vi.mock("@/lib/sync/fx-fallback", () => ({ ensureFxFallback: vi.fn() }));
vi.mock("@/lib/query/use-sheet-export", () => ({ runSheetExport: vi.fn() }));
vi.mock("@/lib/device-sync/engine", () => ({ awaitPendingPull: vi.fn(), pushIfChanged: vi.fn() }));

import { refreshAll, refreshPensionPrices } from "@/lib/sync/refresh";
import { refreshUpbit } from "@/lib/sync/refresh-upbit";
import { refreshSavingsAccrual } from "@/lib/sync/refresh-savings";
import { ensureFxFallback } from "@/lib/sync/fx-fallback";
import { runSheetExport } from "@/lib/query/use-sheet-export";
import { awaitPendingPull, pushIfChanged } from "@/lib/device-sync/engine";
import { useAssetsRefresh } from "@/lib/query/use-assets-refresh";

/** resolve를 바깥에서 쥘 수 있는 제어 가능한 Promise. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

afterEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ locked: true, sessionKey: null, lastRefreshAt: null });
});

describe("useAssetsRefresh — 자동 시트 내보내기의 세션 키", () => {
  it("요청 도중 화면을 벗어나 훅이 사라진 뒤 잠겨도 stale 세션 키로 내보내지 않는다", async () => {
    // 훅을 쓰던 컴포넌트가 언마운트되면(탭 이동 등) 더 이상 리렌더되지 않으므로,
    // onSuccess가 렌더 시점 클로저의 sessionKey를 그대로 쓰면 언마운트 전의 유효했던
    // 키로 내보내기가 실행될 수 있다. onSuccess는 그 순간의 스토어 값을 다시 읽어야 한다.
    const key = await deriveKey("pp", makeSalt());
    useAppStore.setState({ locked: false, sessionKey: key });
    const setLastRefreshSpy = vi.spyOn(useAppStore.getState(), "setLastRefresh");

    vi.mocked(ensureFxFallback).mockResolvedValue(true);
    vi.mocked(refreshAll).mockResolvedValue({ vm: {} as never, failures: [] });
    vi.mocked(refreshPensionPrices).mockResolvedValue({ updated: 0, failures: [] });
    vi.mocked(refreshUpbit).mockResolvedValue({ failures: [] } as never);
    const savings = deferred<number>();
    vi.mocked(refreshSavingsAccrual).mockReturnValue(savings.promise);

    const { result, unmount } = renderHook(() => useAssetsRefresh(), { wrapper: QueryWrapper });
    result.current.mutate();

    await waitFor(() => expect(refreshSavingsAccrual).toHaveBeenCalled());

    // 갱신이 아직 끝나지 않은 사이에 화면을 벗어나고(훅 언마운트), 자동 잠금으로 세션 키가 사라진다.
    unmount();
    useAppStore.setState({ locked: true, sessionKey: null });
    savings.resolve(0);

    // onSuccess가 끝까지 실행됐음을 setLastRefresh 호출로 확인한다(언마운트 후엔 리렌더로 알 수 없음).
    await waitFor(() => expect(setLastRefreshSpy).toHaveBeenCalled());
    expect(runSheetExport).not.toHaveBeenCalled();
    expect(pushIfChanged).not.toHaveBeenCalled();
  });

  it("세션 키가 유지되면 갱신 성공 후 자동 내보내기를 실행한다", async () => {
    const key = await deriveKey("pp", makeSalt());
    useAppStore.setState({ locked: false, sessionKey: key });

    vi.mocked(ensureFxFallback).mockResolvedValue(true);
    vi.mocked(refreshAll).mockResolvedValue({ vm: {} as never, failures: [] });
    vi.mocked(refreshPensionPrices).mockResolvedValue({ updated: 0, failures: [] });
    vi.mocked(refreshUpbit).mockResolvedValue({ failures: [] } as never);
    vi.mocked(refreshSavingsAccrual).mockResolvedValue(0);
    vi.mocked(runSheetExport).mockResolvedValue({ status: "ok", writtenAt: "W" });

    const { result } = renderHook(() => useAssetsRefresh(), { wrapper: QueryWrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(runSheetExport).toHaveBeenCalledWith(key);
  });
});

describe("useAssetsRefresh — 기기 동기화 순서", () => {
  it("진행 중인 받기가 끝날 때까지 갱신을 시작하지 않고, 성공하면 바뀐 내용을 올린다", async () => {
    const key = await deriveKey("pp", makeSalt());
    useAppStore.setState({ locked: false, sessionKey: key });
    vi.mocked(ensureFxFallback).mockResolvedValue(true);
    vi.mocked(refreshAll).mockResolvedValue({ vm: {} as never, failures: [] });
    vi.mocked(refreshPensionPrices).mockResolvedValue({ updated: 0, failures: [] });
    vi.mocked(refreshUpbit).mockResolvedValue({ failures: [] } as never);
    vi.mocked(refreshSavingsAccrual).mockResolvedValue(0);
    vi.mocked(runSheetExport).mockResolvedValue({ status: "ok", writtenAt: "W" });
    const pull = deferred<void>();
    vi.mocked(awaitPendingPull).mockReturnValueOnce(pull.promise);

    const { result } = renderHook(() => useAssetsRefresh(), { wrapper: QueryWrapper });
    result.current.mutate();

    await waitFor(() => expect(awaitPendingPull).toHaveBeenCalled());
    expect(ensureFxFallback).not.toHaveBeenCalled();

    pull.resolve();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(ensureFxFallback).toHaveBeenCalled();
    expect(pushIfChanged).toHaveBeenCalledTimes(1);
  });
});
