import { describe, it, expect, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/utils/query";
import { useAppStore } from "@/stores/app-store";
import { db } from "@/lib/db/schema";
import { CoinManageList } from "@/components/coin/CoinManageList";
import { buildCoinVM } from "@/lib/coin/coin-service";
import type { CoinHolding } from "@/lib/types";

// PrivacyAmount/뮤테이션이 react-query를 쓰므로 DB·store를 초기화한다.
afterEach(async () => {
  await db.delete();
  await db.open();
  useAppStore.setState({ locked: false, sessionKey: null, lastRefreshAt: null });
});

function c(over: Partial<CoinHolding>): CoinHolding {
  return {
    id: over.id ?? "c1",
    name: "코인",
    quantity: 1,
    buyPrice: 1000,
    currentPrice: 1000,
    sortOrder: 0,
    updatedAt: 0,
    source: "MANUAL",
    ...over,
  };
}

const COINS: CoinHolding[] = [
  c({ id: "1", name: "비트코인", exchange: "직접입력", quantity: 0.1, buyPrice: 50000000, currentPrice: 60000000 }),
  c({ id: "2", name: "이더리움", exchange: "업비트", quantity: 2, buyPrice: 3000000, currentPrice: 3500000, source: "AUTO", connectionId: "u1", market: "KRW-ETH" }),
];

describe("CoinManageList AUTO 행 잠금", () => {
  it("업비트 AUTO 코인 행은 출처 배지와 잠금 안내를 보여준다", () => {
    const vm = buildCoinVM(COINS);
    renderWithQuery(<CoinManageList vm={vm} />);
    expect(screen.getByText("이더리움")).toBeInTheDocument();
    expect(screen.getByText(/업비트에서 자동으로 가져와요/)).toBeInTheDocument();
    expect(screen.getAllByText("업비트").length).toBeGreaterThan(0);
  });

  it("편집 모드에서 AUTO 행은 현재가 입력·삭제 버튼이 없고, MANUAL 행만 편집 가능하다", async () => {
    const vm = buildCoinVM(COINS);
    renderWithQuery(<CoinManageList vm={vm} />);
    await userEvent.click(screen.getByRole("button", { name: "편집" }));
    // MANUAL(비트코인)은 현재가 입력이 생긴다.
    expect(screen.getByLabelText("비트코인 현재가")).toBeInTheDocument();
    // AUTO(이더리움)는 입력·삭제 컨트롤이 없다.
    expect(screen.queryByLabelText("이더리움 현재가")).toBeNull();
    expect(screen.queryByLabelText("이더리움 삭제")).toBeNull();
  });
});
