import type {
  AssetSnapshot, AssetSnapshotPnlSection, AssetSnapshotAmountSection,
} from "@/lib/types";
import type { PortfolioVM } from "@/lib/portfolio/portfolio-service";
import type { SavingsVM } from "@/lib/savings/savings-service";
import type { PensionVM } from "@/lib/pension/pension-service";
import type { CoinVM } from "@/lib/coin/coin-service";
import type { DebtVM } from "@/lib/debt/debt-service";

/**
 * 자산 스냅샷 순수 빌더. DB·비동기·Date 없이 뷰모델 5종을 1건의 스냅샷으로 직렬화한다.
 * id·createdAt은 호출부에서 주입한다. VM이 없으면(미등록·로딩 실패) 빈 섹션으로 폴백.
 */

function emptyPnlSection(): AssetSnapshotPnlSection {
  return { totalValueKrw: 0, totalCostKrw: 0, totalPnlKrw: 0, returnPct: 0, rows: [] };
}

function emptyAmountSection(): AssetSnapshotAmountSection {
  return { totalKrw: 0, rows: [] };
}

function stocksSection(vm?: PortfolioVM): AssetSnapshotPnlSection {
  if (vm == null) {
    return emptyPnlSection();
  }
  return {
    totalValueKrw: vm.totalValueKrw,
    totalCostKrw: vm.totalCostKrw,
    totalPnlKrw: vm.totalPnlKrw,
    returnPct: vm.returnPct,
    rows: vm.rows.map((r) => ({
      name: r.holding.name, quantity: r.holding.quantity,
      costKrw: r.costKrw, valueKrw: r.valueKrw, pnlKrw: r.pnlKrw, returnPct: r.returnPct,
    })),
  };
}

function pensionSection(vm?: PensionVM): AssetSnapshotPnlSection {
  if (vm == null) {
    return emptyPnlSection();
  }
  return {
    totalValueKrw: vm.totalValueKrw,
    totalCostKrw: vm.totalCostKrw,
    totalPnlKrw: vm.totalPnlKrw,
    returnPct: vm.returnPct,
    rows: vm.groups.flatMap((g) => g.accounts).map((a) => ({
      name: a.name, quantity: a.quantity,
      costKrw: a.costKrw, valueKrw: a.valueKrw, pnlKrw: a.pnlKrw, returnPct: a.returnPct,
    })),
  };
}

function coinSection(vm?: CoinVM): AssetSnapshotPnlSection {
  if (vm == null) {
    return emptyPnlSection();
  }
  return {
    totalValueKrw: vm.totalValueKrw,
    totalCostKrw: vm.totalCostKrw,
    totalPnlKrw: vm.totalPnlKrw,
    returnPct: vm.returnPct,
    rows: vm.holdings.map((h) => ({
      name: h.name, quantity: h.quantity,
      costKrw: h.costKrw, valueKrw: h.valueKrw, pnlKrw: h.pnlKrw, returnPct: h.returnPct,
    })),
  };
}

function savingsSection(vm?: SavingsVM): AssetSnapshotAmountSection {
  if (vm == null) {
    return emptyAmountSection();
  }
  return {
    totalKrw: vm.totalKrw,
    rows: vm.groups.flatMap((g) => g.accounts).map((a) => ({
      name: a.name, amountKrw: a.amountKrw,
    })),
  };
}

function debtSection(vm?: DebtVM): AssetSnapshotAmountSection {
  if (vm == null) {
    return emptyAmountSection();
  }
  return {
    totalKrw: vm.totalKrw,
    rows: vm.items.map((d) => ({ name: d.name, amountKrw: d.balance })),
  };
}

export function buildAssetSnapshot(input: {
  id: string;
  createdAt: number;
  portfolio?: PortfolioVM;
  savings?: SavingsVM;
  pension?: PensionVM;
  coin?: CoinVM;
  debt?: DebtVM;
}): AssetSnapshot {
  const stocks = stocksSection(input.portfolio);
  const savings = savingsSection(input.savings);
  const pension = pensionSection(input.pension);
  const coin = coinSection(input.coin);
  const debt = debtSection(input.debt);
  const totalAssetsKrw =
    stocks.totalValueKrw + savings.totalKrw + pension.totalValueKrw + coin.totalValueKrw;
  const totalDebtKrw = debt.totalKrw;
  return {
    id: input.id,
    createdAt: input.createdAt,
    netWorthKrw: totalAssetsKrw - totalDebtKrw,
    totalAssetsKrw,
    totalDebtKrw,
    stocks, pension, coin, savings, debt,
  };
}
