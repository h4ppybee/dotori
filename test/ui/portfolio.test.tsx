import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SummaryHero } from "@/components/portfolio/SummaryHero";
import { SectorDonut } from "@/components/portfolio/SectorDonut";
import { HoldingWeightBars } from "@/components/portfolio/HoldingWeightBars";
import { HoldingsTable } from "@/components/portfolio/HoldingsTable";
import { RefreshBar } from "@/components/portfolio/RefreshBar";
import { renderWithQuery } from "@/test/utils/query";
import { useAppStore } from "@/stores/app-store";
import { db } from "@/lib/db/schema";
import { putSettings } from "@/lib/db/local-store";
import type { PortfolioVM, PortfolioRow } from "@/lib/portfolio/portfolio-service";
import type { Holding } from "@/lib/types";

// SummaryHero가 react-query 훅(usePrivacyAmounts)을 쓰므로 DB·store를 초기화한다.
afterEach(async () => {
  await db.delete();
  await db.open();
  useAppStore.setState({ locked: true, sessionKey: null, lastRefreshAt: null, amountsRevealed: false });
});

function makeHolding(over: Partial<Holding> = {}): Holding {
  return {
    id: "h1",
    connectionId: "c1",
    market: "KOSPI",
    symbol: "005930",
    name: "삼성전자",
    sector: "반도체",
    currency: "KRW",
    quantity: 10,
    avgBuyPrice: 70000,
    source: "MANUAL",
    updatedAt: 0,
    ...over,
  };
}

function makeRow(over: Partial<PortfolioRow> = {}): PortfolioRow {
  return {
    holding: makeHolding(),
    priceKrw: 80000,
    valueKrw: 800000,
    costKrw: 700000,
    pnlKrw: 100000,
    returnPct: 14.29,
    sector: "반도체",
    ...over,
  };
}

function makeVm(over: Partial<PortfolioVM> = {}): PortfolioVM {
  return {
    rows: [makeRow()],
    totalCostKrw: 700000,
    totalValueKrw: 800000,
    totalPnlKrw: 100000,
    returnPct: 14.29,
    bySector: [{ sector: "반도체", valueKrw: 800000, pct: 100 }],
    byHolding: [{ symbol: "005930", name: "삼성전자", valueKrw: 800000, pct: 100 }],
    ...over,
  };
}

describe("SummaryHero", () => {
  it("총평가금을 포맷해 보여준다", () => {
    renderWithQuery(<SummaryHero vm={makeVm()} />);
    expect(screen.getByText("₩800,000")).toBeInTheDocument();
  });

  it("수익(양수)일 때 총손익에 up(빨강) 클래스를 적용한다", () => {
    renderWithQuery(<SummaryHero vm={makeVm({ totalPnlKrw: 100000 })} />);
    const pnl = screen.getByText("+₩100,000");
    expect(pnl).toHaveClass("text-up");
  });

  it("손실(음수)일 때 총손익에 down(파랑) 클래스를 적용한다", () => {
    renderWithQuery(<SummaryHero vm={makeVm({ totalPnlKrw: -50000 })} />);
    const pnl = screen.getByText("-₩50,000");
    expect(pnl).toHaveClass("text-down");
  });

  it("일간손익 값이 있어도 오늘 손익은 노출하지 않는다", () => {
    renderWithQuery(<SummaryHero vm={makeVm({ totalDailyPnlKrw: 12000 })} />);
    expect(screen.queryByText("오늘")).not.toBeInTheDocument();
    expect(screen.queryByText("+₩12,000")).not.toBeInTheDocument();
  });

  it("프라이버시 미설정이면 총평가금이 그대로 보인다", async () => {
    useAppStore.setState({ locked: false });
    renderWithQuery(<SummaryHero vm={makeVm({ totalValueKrw: 1234000 })} />);
    expect(await screen.findByText("₩1,234,000")).toBeInTheDocument();
  });

  it("프라이버시 ON이면 총평가금이 초기엔 가려지고 탭하면 보인다", async () => {
    await putSettings({ id: "app", kdfSalt: "s", verifier: "v", schemaVersion: 1, privacyAmounts: true });
    useAppStore.setState({ locked: false });
    renderWithQuery(<SummaryHero vm={makeVm({ totalValueKrw: 1234000 })} />);

    // 초기엔 노출용 버튼(가려진 상태)으로 렌더된다
    const revealBtn = await screen.findByRole("button", { name: "총평가금 보기" });
    fireEvent.click(revealBtn);

    // 탭하면 선명해지고 버튼이 사라진다
    expect(screen.queryByRole("button", { name: "총평가금 보기" })).toBeNull();
    expect(screen.getByText("₩1,234,000")).toBeInTheDocument();
  });
});

describe("SectorDonut", () => {
  it("범례에 섹터명과 비율(부호 없이)을 보여준다", () => {
    const vm = makeVm({
      bySector: [
        { sector: "반도체", valueKrw: 625000, pct: 62.5 },
        { sector: "자동차", valueKrw: 375000, pct: 37.5 },
      ],
    });
    render(<SectorDonut vm={vm} />);
    expect(screen.getByText("반도체")).toBeInTheDocument();
    expect(screen.getByText("자동차")).toBeInTheDocument();
    expect(screen.getByText("62.5%")).toBeInTheDocument();
    expect(screen.getByText("37.5%")).toBeInTheDocument();
  });

  it("섹터가 없으면 아무것도 렌더링하지 않는다", () => {
    const { container } = render(<SectorDonut vm={makeVm({ bySector: [] })} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("HoldingWeightBars", () => {
  it("종목명과 비중(부호 없이), 평가금을 보여준다", () => {
    const vm = makeVm({
      byHolding: [
        { symbol: "005930", name: "삼성전자", valueKrw: 625000, pct: 62.5 },
        { symbol: "000660", name: "SK하이닉스", valueKrw: 375000, pct: 37.5 },
      ],
    });
    render(<HoldingWeightBars vm={vm} />);
    expect(screen.getByText("삼성전자")).toBeInTheDocument();
    expect(screen.getByText("SK하이닉스")).toBeInTheDocument();
    expect(screen.getByText("62.5%")).toBeInTheDocument();
    expect(screen.getByText("37.5%")).toBeInTheDocument();
  });

  it("종목이 없으면 아무것도 렌더링하지 않는다", () => {
    const { container } = render(
      <HoldingWeightBars vm={makeVm({ byHolding: [] })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("HoldingsTable", () => {
  it("종목명·평가금·증권사 라벨을 보여준다", () => {
    render(
      <HoldingsTable
        rows={[makeRow()]}
        connectionLabels={{ c1: "토스증권" }}
      />,
    );
    expect(screen.getByText("삼성전자")).toBeInTheDocument();
    expect(screen.getByText("₩800,000")).toBeInTheDocument();
    expect(screen.getByText(/토스증권/)).toBeInTheDocument();
  });

  it("USD 종목은 원화 평가금과 원통화 보조 금액을 함께 보여준다", () => {
    const usdRow = makeRow({
      holding: makeHolding({
        id: "h2",
        symbol: "AAPL",
        name: "애플",
        currency: "USD",
        quantity: 2,
        avgBuyPrice: 150,
      }),
      priceKrw: 432000, // 1주 = $320 @ 1350
      valueKrw: 864000,
      returnPct: 6.67,
    });
    render(
      <HoldingsTable
        rows={[usdRow]}
        connectionLabels={{ c1: "토스증권" }}
        usdKrwRate={1350}
      />,
    );
    expect(screen.getByText("₩864,000")).toBeInTheDocument();
    // 보조 평가금: 2주 × $320 = $640.00
    expect(screen.getByText("$640.00")).toBeInTheDocument();
    // 현재가 per-share: $320.00
    expect(screen.getByText(/현재 \$320\.00/)).toBeInTheDocument();
  });

  it("행이 없으면 아무것도 렌더링하지 않는다", () => {
    const { container } = render(
      <HoldingsTable rows={[]} connectionLabels={{}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("RefreshBar", () => {
  it("진행 중이면 새로고침 중 문구를 보여준다", () => {
    render(
      <RefreshBar onRefresh={() => {}} pending={true} lastRefreshAt={null} />,
    );
    expect(screen.getByText("새로고침 중…")).toBeInTheDocument();
  });

  it("마지막 갱신 시각을 HH:MM 으로 보여준다", () => {
    const at = new Date(2026, 5, 25, 10, 32).getTime();
    render(<RefreshBar onRefresh={() => {}} pending={false} lastRefreshAt={at} />);
    expect(screen.getByText(/10:32/)).toBeInTheDocument();
  });

  it("실패 항목이 있으면 경고 배너와 항목별 사유를 보여준다", () => {
    render(
      <RefreshBar
        onRefresh={() => {}}
        pending={false}
        lastRefreshAt={Date.now()}
        failures={[
          { connectionId: "prices", label: "시세", message: "요청 시간이 초과됐어요." },
          { connectionId: "pension", label: "연금 시세", message: "토스 연동이 없어요." },
        ]}
      />,
    );
    expect(screen.getByText(/동기화에 실패한 항목이 2개/)).toBeInTheDocument();
    expect(screen.getByText("다시 시도하기")).toBeInTheDocument();
    // 항목별 label·message가 노출돼 원인을 알 수 있어야 한다
    expect(screen.getByText("시세")).toBeInTheDocument();
    expect(screen.getByText(/요청 시간이 초과됐어요/)).toBeInTheDocument();
    expect(screen.getByText(/토스 연동이 없어요/)).toBeInTheDocument();
  });
});
