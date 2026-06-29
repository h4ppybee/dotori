import type { SavingsAccount, SavingsCategory } from "@/lib/types";

/**
 * 저축/현금성 순수 계산. DB·비동기·Date 없이 입력만으로 결과를 낸다.
 * USD 항목은 자기 통화로 보관하고, 합계·비율은 usdKrwRate로 원화 환산한다.
 */

export const SAVINGS_CATEGORIES: { key: SavingsCategory; label: string }[] = [
  { key: "DEPOSIT", label: "예적금" },
  { key: "CHECKING", label: "입출금" },
  { key: "BOND", label: "채권" },
  { key: "ETC", label: "기타" },
];

const LABEL_BY_KEY: Record<SavingsCategory, string> = Object.fromEntries(
  SAVINGS_CATEGORIES.map((c) => [c.key, c.label]),
) as Record<SavingsCategory, string>;

export interface SavingsCategorySummary {
  category: SavingsCategory;
  label: string;
  amountKrw: number;
  pct: number; // 0~100, 전체 대비 비율
  count: number;
}

export interface SavingsAccountView extends SavingsAccount {
  amountKrw: number; // currency==="USD"면 amount * usdKrwRate(없으면 0), 아니면 amount
}

export interface SavingsGroup {
  category: SavingsCategory;
  label: string;
  amountKrw: number;
  accounts: SavingsAccountView[]; // sortOrder 오름차순
}

export interface SavingsVM {
  totalKrw: number;
  monthlyDepositTotal: number;
  byCategory: SavingsCategorySummary[]; // 금액 0 카테고리 제외, SAVINGS_CATEGORIES 순
  groups: SavingsGroup[]; // 빈 카테고리 제외, SAVINGS_CATEGORIES 순
  count: number;
  usdKrwRate?: number;
}

/** 계좌의 원화 환산 금액. USD면 환율 곱, 환율 없으면 0(원본 amount는 별도 표시). */
export function toKrw(account: SavingsAccount, usdKrwRate?: number): number {
  if (account.currency === "USD") {
    return account.amount * (usdKrwRate ?? 0);
  }
  return account.amount;
}

export function buildSavingsVM(
  accounts: SavingsAccount[],
  usdKrwRate?: number,
): SavingsVM {
  const views: SavingsAccountView[] = accounts.map((a) => ({
    ...a,
    amountKrw: toKrw(a, usdKrwRate),
  }));

  const totalKrw = views.reduce((sum, v) => sum + v.amountKrw, 0);
  const monthlyDepositTotal = accounts.reduce(
    (sum, a) => sum + (a.monthlyDeposit ?? 0),
    0,
  );

  const byCategory: SavingsCategorySummary[] = [];
  const groups: SavingsGroup[] = [];

  for (const { key, label } of SAVINGS_CATEGORIES) {
    const inCat = views
      .filter((v) => v.category === key)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (inCat.length === 0) {
      continue;
    }
    const amountKrw = inCat.reduce((sum, v) => sum + v.amountKrw, 0);
    groups.push({ category: key, label, amountKrw, accounts: inCat });
    if (amountKrw > 0) {
      byCategory.push({
        category: key,
        label,
        amountKrw,
        pct: totalKrw > 0 ? (amountKrw / totalKrw) * 100 : 0,
        count: inCat.length,
      });
    }
  }

  return {
    totalKrw,
    monthlyDepositTotal,
    byCategory,
    groups,
    count: accounts.length,
    usdKrwRate,
  };
}

export function categoryLabel(category: SavingsCategory): string {
  return LABEL_BY_KEY[category];
}
