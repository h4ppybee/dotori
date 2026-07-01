import { describe, it, expect, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithQuery } from "@/test/utils/query";
import { useAppStore } from "@/stores/app-store";
import { db } from "@/lib/db/schema";
import { PensionManageList } from "@/components/pension/PensionManageList";
import { CoinManageList } from "@/components/coin/CoinManageList";
import { InvestmentHero } from "@/components/ui/InvestmentHero";
import { buildPensionVM } from "@/lib/pension/pension-service";
import { buildCoinVM } from "@/lib/coin/coin-service";
import type { PensionAccount, CoinHolding } from "@/lib/types";

afterEach(async () => {
  await db.delete();
  await db.open();
  useAppStore.setState({ locked: false, sessionKey: null, lastRefreshAt: null, amountsRevealed: false });
});

const PENSIONS: PensionAccount[] = [
  { id: "1", category: "PERSONAL", name: "TIGER 미국S&P500", company: "미래에셋", fundType: "ETF", quantity: 244, buyPrice: 24567, currentPrice: 26160, sortOrder: 0, updatedAt: 0 },
  { id: "2", category: "RETIREMENT", name: "퇴직 ETF", quantity: 10, buyPrice: 1000, currentPrice: 1100, sortOrder: 0, updatedAt: 0 },
];

const COINS: CoinHolding[] = [
  { id: "btc", name: "비트코인", exchange: "업비트", quantity: 0.02, buyPrice: 160598977, currentPrice: 84699700, sortOrder: 0, updatedAt: 0, source: "MANUAL" },
];

describe("InvestmentHero", () => {
  it("평가금과 수익 라벨을 보여준다", () => {
    const vm = buildPensionVM(PENSIONS);
    renderWithQuery(
      <InvestmentHero label="연금 평가금" totalValueKrw={vm.totalValueKrw} totalPnlKrw={vm.totalPnlKrw} returnPct={vm.returnPct} sub={`총 ${vm.count}개`} />,
    );
    expect(screen.getByText("연금 평가금")).toBeInTheDocument();
    expect(screen.getByText(/총수익/)).toBeInTheDocument();
  });
});

describe("PensionManageList", () => {
  it("종목·회사·유형 메타와 평가금을 보여주고, 카테고리 필터가 동작한다", () => {
    const vm = buildPensionVM(PENSIONS);
    const { unmount } = renderWithQuery(<PensionManageList vm={vm} />);
    expect(screen.getByText("TIGER 미국S&P500")).toBeInTheDocument();
    expect(screen.getByText(/미래에셋 · ETF · 수량 244/)).toBeInTheDocument();
    unmount();

    renderWithQuery(<PensionManageList vm={buildPensionVM(PENSIONS)} initialCat="RETIREMENT" />);
    expect(screen.getByText("퇴직 ETF")).toBeInTheDocument();
    expect(screen.queryByText("TIGER 미국S&P500")).toBeNull();
  });
});

describe("CoinManageList", () => {
  it("코인명·거래소 메타와 평가금을 보여준다", () => {
    const vm = buildCoinVM(COINS);
    renderWithQuery(<CoinManageList vm={vm} />);
    expect(screen.getByText("비트코인")).toBeInTheDocument();
    expect(screen.getByText(/업비트 · 수량 0.02/)).toBeInTheDocument();
  });
});
