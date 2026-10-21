import { describe, it, expect, vi, afterEach } from "vitest";
import { deriveKey, makeSalt } from "@/lib/crypto/crypto";
import { useAppStore } from "@/stores/app-store";

vi.mock("@/lib/sheet-export/export", () => ({ exportToSheet: vi.fn() }));
import { exportToSheet } from "@/lib/sheet-export/export";
import { runSheetExport } from "@/lib/query/use-sheet-export";

afterEach(() => {
  vi.mocked(exportToSheet).mockReset();
  useAppStore.setState({ lastSheetExport: null });
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

  it("skipped면 기록하지 않는다", async () => {
    vi.mocked(exportToSheet).mockResolvedValue({ status: "skipped" });
    await runSheetExport(await deriveKey("pp", makeSalt()));
    expect(useAppStore.getState().lastSheetExport).toBeNull();
  });
});
