import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppDataGate, resetAppDataGateForTest } from "@/components/AppDataGate";
import { db } from "@/lib/db/schema";
import { putSettings } from "@/lib/db/local-store";

afterEach(async () => {
  resetAppDataGateForTest();
  await db.delete();
  await db.open();
});

function renderGate(qc: QueryClient) {
  return render(
    <QueryClientProvider client={qc}>
      <AppDataGate>
        <div>앱 콘텐츠</div>
      </AppDataGate>
    </QueryClientProvider>,
  );
}

describe("AppDataGate", () => {
  it("미리 읽기가 끝난 뒤에 화면을 그리고, 그때는 탭 데이터가 캐시에 있다", async () => {
    await putSettings({ id: "app", kdfSalt: "c2FsdA==", verifier: "aXY=.Y3Q=", schemaVersion: 1, lockType: "pin" });
    const qc = new QueryClient();
    renderGate(qc);
    expect(screen.queryByText("앱 콘텐츠")).not.toBeInTheDocument();
    expect(await screen.findByText("앱 콘텐츠")).toBeInTheDocument();
    expect(qc.getQueryState(["envelopeItems"])?.status).toBe("success");
    expect(qc.getQueryState(["goal"])?.status).toBe("success");
  });

  it("한 번 미리 읽었으면 다시 마운트될 때(잠갔다 열 때) 바로 그린다", async () => {
    await putSettings({ id: "app", kdfSalt: "c2FsdA==", verifier: "aXY=.Y3Q=", schemaVersion: 1, lockType: "pin" });
    const qc = new QueryClient();
    const first = renderGate(qc);
    await screen.findByText("앱 콘텐츠");
    first.unmount();
    renderGate(qc);
    expect(screen.getByText("앱 콘텐츠")).toBeInTheDocument();
  });
});
