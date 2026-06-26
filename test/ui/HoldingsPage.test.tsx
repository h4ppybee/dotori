import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useAppStore } from "@/stores/app-store";
import { db } from "@/lib/db/schema";
import { upsertManualHolding, upsertConnection, upsertMember } from "@/lib/db/local-store";
import { deriveKey, makeSalt } from "@/lib/crypto/crypto";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// useRefresh가 QueryClientProvider 없이도 동작하도록 목킹
vi.mock("@/lib/query/use-portfolio", () => ({
  useRefresh: () => ({ mutate: vi.fn() }),
}));

async function seedSessionKey() {
  const key = await deriveKey("test-pp", makeSalt());
  useAppStore.setState({ locked: false, sessionKey: key });
  return key;
}

afterEach(async () => {
  await db.delete();
  await db.open();
  useAppStore.setState({ locked: true, sessionKey: null, lastRefreshAt: null });
  vi.clearAllMocks();
});

async function renderHoldingsPage() {
  const { default: HoldingsPage } = await import("@/app/holdings/page");
  return render(<HoldingsPage />);
}

describe("HoldingsPage — 빈 상태", () => {
  beforeEach(async () => {
    await seedSessionKey();
  });

  it("빈 상태 텍스트가 렌더링된다", async () => {
    await renderHoldingsPage();
    await waitFor(() => {
      expect(
        screen.getByText(/아직 직접 추가한 종목이 없어요/),
      ).toBeInTheDocument();
    });
  });
});

describe("HoldingsPage — 보유 종목 목록", () => {
  beforeEach(async () => {
    await seedSessionKey();
  });

  it("MANUAL 보유 종목 행이 렌더링된다", async () => {
    // 멤버 생성
    await upsertMember({ id: "m-1", name: "테스트 멤버" });

    // MANUAL 연결 생성
    const conn = await upsertConnection({
      id: "conn-manual-1",
      memberId: "m-1",
      type: "MANUAL",
      label: "직접 보유",
    });

    // MANUAL 종목 시드
    await upsertManualHolding({
      connectionId: conn.id,
      market: "KOSPI",
      symbol: "005930",
      name: "삼성전자",
      sector: "IT",
      currency: "KRW",
      quantity: 10,
      avgBuyPrice: 70000,
    });

    await renderHoldingsPage();

    await waitFor(() => {
      expect(screen.getByText("삼성전자")).toBeInTheDocument();
    });
  });

  it("MANUAL이 아닌 AUTO 종목은 표시되지 않는다", async () => {
    // 멤버 생성
    await upsertMember({ id: "m-2", name: "테스트 멤버 2" });

    // TOSS_API 연결 생성
    const conn = await upsertConnection({
      id: "conn-auto-1",
      memberId: "m-2",
      type: "TOSS_API",
      label: "토스 증권",
    });

    // AUTO 종목 직접 삽입 (upsertAutoHolding은 AUTO를 설정하므로 우회해서 수동 삽입)
    await db.holdings.put({
      id: "h-auto-1",
      connectionId: conn.id,
      market: "KOSPI",
      symbol: "000660",
      name: "SK하이닉스",
      sector: "IT",
      currency: "KRW",
      quantity: 5,
      avgBuyPrice: 130000,
      source: "AUTO",
      updatedAt: Date.now(),
    });

    await renderHoldingsPage();

    // 잠시 기다린 후 AUTO 종목이 없는지 확인
    await waitFor(() => {
      expect(
        screen.queryByText("SK하이닉스"),
      ).not.toBeInTheDocument();
    });
  });
});
