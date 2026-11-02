import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useAppStore } from "@/stores/app-store";

vi.mock("@/lib/device-sync/engine", () => ({ resolveConflict: vi.fn(), dismissConflict: vi.fn() }));

import { resolveConflict, dismissConflict } from "@/lib/device-sync/engine";
import { SyncConflictDialog } from "@/components/sync/SyncConflictDialog";

const conflict = { remote: { revision: 3, savedAt: "2026-01-01T00:00:00.000Z", deviceName: "다른 기기" } };

afterEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ locked: true, sessionKey: null, syncConflict: null });
});

describe("SyncConflictDialog", () => {
  it("충돌이 없거나 잠겨 있으면 그리지 않는다", () => {
    useAppStore.setState({ locked: false, syncConflict: null });
    const { unmount } = render(<SyncConflictDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();
    unmount();
    useAppStore.setState({ locked: true, syncConflict: conflict });
    render(<SyncConflictDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("출처 기기를 보여주고, 고른 쪽으로 해소한다", async () => {
    useAppStore.setState({ locked: false, syncConflict: conflict });
    vi.mocked(resolveConflict).mockResolvedValue({ status: "applied", remote: conflict.remote });
    render(<SyncConflictDialog />);
    expect(screen.getByRole("dialog")).toHaveTextContent("다른 기기에서");
    fireEvent.click(screen.getByRole("button", { name: "다른 기기 내용 받기" }));
    await waitFor(() => expect(resolveConflict).toHaveBeenCalledWith("remote"));
  });

  it("이 기기 내용으로 덮기를 고를 수 있다", async () => {
    useAppStore.setState({ locked: false, syncConflict: conflict });
    vi.mocked(resolveConflict).mockResolvedValue({ status: "pushed", remote: conflict.remote });
    render(<SyncConflictDialog />);
    fireEvent.click(screen.getByRole("button", { name: "이 기기 내용으로 덮기" }));
    await waitFor(() => expect(resolveConflict).toHaveBeenCalledWith("local"));
  });

  it("닫기는 보류(dismissConflict), 해소에 실패하면 메시지를 보여준다", async () => {
    useAppStore.setState({ locked: false, syncConflict: conflict });
    vi.mocked(resolveConflict).mockResolvedValue({ status: "error", message: "동기화 저장소에 연결하지 못했어요." });
    render(<SyncConflictDialog />);
    fireEvent.click(screen.getByRole("button", { name: "다른 기기 내용 받기" }));
    expect(await screen.findByText("동기화 저장소에 연결하지 못했어요.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(dismissConflict).toHaveBeenCalled();
  });
});
