import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SnapshotSection } from "@/components/snapshot/SnapshotSection";

vi.mock("@/lib/snapshot/capture", () => ({
  captureAssetSnapshot: vi.fn(),
}));
vi.mock("@/lib/db/local-store", () => ({
  listAssetSnapshots: vi.fn(),
  getAssetSnapshot: vi.fn(),
  deleteAssetSnapshot: vi.fn(),
}));

import { captureAssetSnapshot } from "@/lib/snapshot/capture";
import { listAssetSnapshots } from "@/lib/db/local-store";
import { useAppStore } from "@/stores/app-store";

function renderSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SnapshotSection takeDisabled={false} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // 잠금 상태에서는 목록 쿼리가 비활성이라 에러 경로가 실행되지 않는다.
  useAppStore.setState({ locked: false });
  vi.mocked(listAssetSnapshots).mockResolvedValue([]);
  vi.mocked(captureAssetSnapshot).mockReset();
});

describe("SnapshotSection 에러 표출", () => {
  it("기록 실패 시 에러 안내를 보여준다 (조용한 무반응 금지)", async () => {
    vi.mocked(captureAssetSnapshot).mockRejectedValue(new Error("QuotaExceededError"));
    renderSection();
    const button = await screen.findByRole("button", { name: "+ 지금 기록" });
    await userEvent.click(button);
    await waitFor(() => {
      expect(screen.getByText(/스냅샷을 기록하지 못했어요/)).toBeInTheDocument();
    });
    // 원인 파악을 위해 에러 메시지 원문도 함께 노출한다.
    expect(screen.getByText(/QuotaExceededError/)).toBeInTheDocument();
  });

  it("목록 조회 실패 시 빈 상태로 위장하지 않고 에러 안내를 보여준다", async () => {
    vi.mocked(listAssetSnapshots).mockRejectedValue(new Error("boom"));
    renderSection();
    await waitFor(() => {
      expect(screen.getByText(/스냅샷 목록을 불러오지 못했어요/)).toBeInTheDocument();
    });
    expect(screen.queryByText("아직 기록한 스냅샷이 없어요")).not.toBeInTheDocument();
  });

  it("기록 성공 시 에러 안내가 없다", async () => {
    vi.mocked(captureAssetSnapshot).mockResolvedValue({} as never);
    renderSection();
    const button = await screen.findByRole("button", { name: "+ 지금 기록" });
    await userEvent.click(button);
    await waitFor(() => {
      expect(vi.mocked(captureAssetSnapshot)).toHaveBeenCalled();
    });
    expect(screen.queryByText(/기록하지 못했어요/)).not.toBeInTheDocument();
  });
});
