import type { PensionAccount, PensionCategory } from "@/lib/types";

/**
 * 연금 순수 계산. DB·비동기·Date 없이 입력만으로 결과를 낸다(KRW 고정).
 * 평가금/손익은 수량×단가로 파생한다.
 */

export const PENSION_CATEGORIES: { key: PensionCategory; label: string }[] = [
  { key: "PERSONAL", label: "개인연금" },
  { key: "RETIREMENT", label: "퇴직연금" },
];

const LABEL_BY_KEY: Record<PensionCategory, string> = Object.fromEntries(
  PENSION_CATEGORIES.map((c) => [c.key, c.label]),
) as Record<PensionCategory, string>;

export interface PensionAccountView extends PensionAccount {
  costKrw: number;   // quantity * buyPrice
  valueKrw: number;  // quantity * currentPrice
  pnlKrw: number;    // valueKrw - costKrw
  returnPct: number; // pnl / cost * 100 (cost 0이면 0)
}

export interface PensionCategorySummary {
  category: PensionCategory;
  label: string;
  valueKrw: number;
  pct: number;
  count: number;
}

export interface PensionGroup {
  category: PensionCategory;
  label: string;
  valueKrw: number;
  costKrw: number;
  pnlKrw: number;
  returnPct: number;
  accounts: PensionAccountView[];
}

export interface PensionVM {
  totalValueKrw: number;
  totalCostKrw: number;
  totalPnlKrw: number;
  returnPct: number;
  byCategory: PensionCategorySummary[]; // 평가금 0 카테고리 제외, PENSION_CATEGORIES 순
  groups: PensionGroup[];               // 빈 카테고리 제외, PENSION_CATEGORIES 순
  count: number;
}

function returnPct(pnl: number, cost: number): number {
  return cost > 0 ? (pnl / cost) * 100 : 0;
}

function toView(a: PensionAccount): PensionAccountView {
  const costKrw = a.quantity * a.buyPrice;
  const valueKrw = a.quantity * a.currentPrice;
  const pnlKrw = valueKrw - costKrw;
  return { ...a, costKrw, valueKrw, pnlKrw, returnPct: returnPct(pnlKrw, costKrw) };
}

export function buildPensionVM(accounts: PensionAccount[]): PensionVM {
  const views = accounts.map(toView);
  const totalValueKrw = views.reduce((s, v) => s + v.valueKrw, 0);
  const totalCostKrw = views.reduce((s, v) => s + v.costKrw, 0);
  const totalPnlKrw = totalValueKrw - totalCostKrw;

  const byCategory: PensionCategorySummary[] = [];
  const groups: PensionGroup[] = [];

  for (const { key, label } of PENSION_CATEGORIES) {
    const inCat = views
      .filter((v) => v.category === key)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (inCat.length === 0) {
      continue;
    }
    const valueKrw = inCat.reduce((s, v) => s + v.valueKrw, 0);
    const costKrw = inCat.reduce((s, v) => s + v.costKrw, 0);
    const pnlKrw = valueKrw - costKrw;
    groups.push({ category: key, label, valueKrw, costKrw, pnlKrw, returnPct: returnPct(pnlKrw, costKrw), accounts: inCat });
    if (valueKrw > 0) {
      byCategory.push({
        category: key,
        label,
        valueKrw,
        pct: totalValueKrw > 0 ? (valueKrw / totalValueKrw) * 100 : 0,
        count: inCat.length,
      });
    }
  }

  return {
    totalValueKrw,
    totalCostKrw,
    totalPnlKrw,
    returnPct: returnPct(totalPnlKrw, totalCostKrw),
    byCategory,
    groups,
    count: accounts.length,
  };
}

export function pensionCategoryLabel(category: PensionCategory): string {
  return LABEL_BY_KEY[category];
}
