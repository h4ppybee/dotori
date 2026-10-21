import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { deriveKey, makeSalt, encrypt } from "@/lib/crypto/crypto";
import { useAppStore } from "@/stores/app-store";
import { db } from "@/lib/db/schema";
import { QueryWrapper } from "@/test/utils/query";

vi.mock("@/lib/sheet-export/export", () => ({ exportToSheet: vi.fn() }));
import { exportToSheet } from "@/lib/sheet-export/export";
import { runSheetExport, useClearSheetExportConfig } from "@/lib/query/use-sheet-export";

afterEach(async () => {
  vi.mocked(exportToSheet).mockReset();
  useAppStore.setState({ lastSheetExport: null });
  await db.delete();
  await db.open();
});

describe("runSheetExport", () => {
  it("ok 결과를 스토어에 기록한다", async () => {
    vi.mocked(exportToSheet).mockResolvedValue({ status: "ok", writtenAt: "W" });
    const key = await deriveKey("pp", makeSalt());
    await runSheetExport(key);
    expect(useAppStore.getState().lastSheetExport?.status).toBe("ok");
  });

  it("error 결과는 메시지와 함께 기록한다", async () => {
    vi.mocked(exportToSheet).mockResolvedValue({ status: "error", message: "실패" });
    await runSheetExport(await deriveKey("pp", makeSalt()));
    expect(useAppStore.getState().lastSheetExport).toMatchObject({ status: "error", message: "실패" });
  });

  it("skipped면 이전 기록을 지운다(설정 해제 후 재갱신 등으로 stale 실패가 남지 않게)", async () => {
    useAppStore.setState({ lastSheetExport: { at: 1, status: "error", message: "이전 실패" } });
    vi.mocked(exportToSheet).mockResolvedValue({ status: "skipped" });
    await runSheetExport(await deriveKey("pp", makeSalt()));
    expect(useAppStore.getState().lastSheetExport).toBeNull();
  });

  it("동시에 두 번 호출해도 exportToSheet는 한 번만 실행되고 같은 결과를 공유한다(single-flight)", async () => {
    let resolveExport: (v: { status: "ok"; writtenAt: string }) => void;
    vi.mocked(exportToSheet).mockImplementation(
      () => new Promise((resolve) => { resolveExport = resolve; }),
    );
    const key = await deriveKey("pp", makeSalt());

    const p1 = runSheetExport(key);
    const p2 = runSheetExport(key);
    resolveExport!({ status: "ok", writtenAt: "W" });
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(exportToSheet).toHaveBeenCalledTimes(1);
    expect(r1).toEqual(r2);

    // 진행 중 플래그가 끝나면 풀려서, 다음 호출은 다시 새로 실행된다
    vi.mocked(exportToSheet).mockResolvedValue({ status: "ok", writtenAt: "W2" });
    await runSheetExport(key);
    expect(exportToSheet).toHaveBeenCalledTimes(2);
  });
});

describe("useClearSheetExportConfig", () => {
  it("연결 해제 시 마지막 내보내기 기록도 함께 지운다", async () => {
    const key = await deriveKey("pp", makeSalt());
    await db.sheetExport.put({
      id: "sheet",
      webAppUrl: "https://script.google.com/macros/s/x/exec",
      secretEnc: await encrypt(key, "secret"),
      updatedAt: Date.now(),
    });
    useAppStore.setState({ lastSheetExport: { at: 1, status: "error", message: "이전 실패" } });

    const { result } = renderHook(() => useClearSheetExportConfig(), { wrapper: QueryWrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(useAppStore.getState().lastSheetExport).toBeNull();
  });
});
