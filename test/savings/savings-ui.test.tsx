import { describe, it, expect, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithQuery } from "@/test/utils/query";
import { useAppStore } from "@/stores/app-store";
import { db } from "@/lib/db/schema";
import { SavingsSummaryHero } from "@/components/savings/SavingsSummaryHero";
import { SavingsDonut } from "@/components/savings/SavingsDonut";
import { SavingsManageList } from "@/components/savings/SavingsManageList";
import { buildSavingsVM } from "@/lib/savings/savings-service";
import type { SavingsAccount } from "@/lib/types";

// PrivacyAmount/뮤테이션이 react-query를 쓰므로 DB·store를 초기화한다.
afterEach(async () => {
  await db.delete();
  await db.open();
  useAppStore.setState({ locked: false, sessionKey: null, lastRefreshAt: null });
});

function a(over: Partial<SavingsAccount>): SavingsAccount {
  return {
    id: over.id ?? "s1",
    category: "DEPOSIT",
    name: "계좌",
    amount: 1000,
    sortOrder: 0,
    updatedAt: 0,
    ...over,
  };
}

const ACCOUNTS: SavingsAccount[] = [
  a({ id: "1", category: "DEPOSIT", name: "뚜니 청년도약", bank: "우리", amount: 15400000, interestRate: 4.5, maturityDate: "2029-07-24" }),
  a({ id: "2", category: "CHECKING", name: "수연 파킹", bank: "케이뱅크", amount: 8900000, interestRate: 1.7 }),
  a({ id: "3", category: "BOND", name: "미국 국채", amount: 1000, currency: "USD" }),
];

describe("SavingsSummaryHero", () => {
  it("총액과 계좌 수를 보여준다", () => {
    const vm = buildSavingsVM(ACCOUNTS, 1500);
    renderWithQuery(<SavingsSummaryHero vm={vm} />);
    expect(screen.getByText("저축/현금성 자산")).toBeInTheDocument();
    // 15,400,000 + 8,900,000 + 1000*1500 = 25,800,000
    expect(screen.getByText("₩25,800,000")).toBeInTheDocument();
    expect(screen.getByText(/총 3개 계좌/)).toBeInTheDocument();
  });
});

describe("SavingsDonut", () => {
  it("카테고리 범례를 보여주고, 비어 있으면 렌더링하지 않는다", () => {
    const vm = buildSavingsVM(ACCOUNTS, 1500);
    const { unmount } = renderWithQuery(<SavingsDonut vm={vm} />);
    expect(screen.getByText("예적금")).toBeInTheDocument();
    expect(screen.getByText("입출금")).toBeInTheDocument();
    expect(screen.getByText("채권")).toBeInTheDocument();
    unmount();

    const empty = buildSavingsVM([]);
    const { container } = renderWithQuery(<SavingsDonut vm={empty} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SavingsManageList", () => {
  it("계좌명·이율·만기 메타와 금액을 보여준다", () => {
    const vm = buildSavingsVM(ACCOUNTS, 1500);
    renderWithQuery(<SavingsManageList vm={vm} />);
    expect(screen.getByText("뚜니 청년도약")).toBeInTheDocument();
    expect(screen.getByText("우리 · 연 4.5% · 만기 2029-07-24")).toBeInTheDocument();
    expect(screen.getByText("케이뱅크 · 연 1.7%")).toBeInTheDocument();
  });

  it("USD 계좌는 달러 금액과 원화 환산 보조를 함께 보여준다", () => {
    const vm = buildSavingsVM(ACCOUNTS, 1500);
    renderWithQuery(<SavingsManageList vm={vm} />);
    expect(screen.getByText("$1,000.00")).toBeInTheDocument();
    expect(screen.getByText("≈ ₩1,500,000")).toBeInTheDocument();
  });

  it("카테고리 필터로 한 섹션만 남길 수 있다", () => {
    const vm = buildSavingsVM(ACCOUNTS, 1500);
    renderWithQuery(<SavingsManageList vm={vm} initialCat="BOND" />);
    expect(screen.getByText("미국 국채")).toBeInTheDocument();
    expect(screen.queryByText("뚜니 청년도약")).toBeNull();
  });
});
