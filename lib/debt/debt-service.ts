import type { LoanAccount, LoanCategory } from "@/lib/types";

/** 대출/부채 순수 계산. DB·비동기·Date 없이 입력만으로 결과를 낸다. KRW 고정. */

export const DEBT_CATEGORIES: { key: LoanCategory; label: string }[] = [
  { key: "MORTGAGE", label: "주택담보" },
  { key: "CREDIT", label: "신용" },
  { key: "JEONSE", label: "전세자금" },
  { key: "CAR", label: "자동차" },
  { key: "STUDENT", label: "학자금" },
  { key: "ETC", label: "기타" },
];

const LABEL_BY_KEY: Record<LoanCategory, string> = Object.fromEntries(
  DEBT_CATEGORIES.map((c) => [c.key, c.label]),
) as Record<LoanCategory, string>;

export interface DebtVM {
  totalKrw: number;
  monthlyPaymentTotal: number;
  items: LoanAccount[]; // sortOrder 오름차순
  count: number;
}

export function buildDebtVM(debts: LoanAccount[]): DebtVM {
  const items = [...debts].sort((a, b) => a.sortOrder - b.sortOrder);
  const totalKrw = items.reduce((sum, d) => sum + d.balance, 0);
  const monthlyPaymentTotal = items.reduce(
    (sum, d) => sum + (d.monthlyPayment ?? 0),
    0,
  );
  return { totalKrw, monthlyPaymentTotal, items, count: items.length };
}

export function debtCategoryLabel(category: LoanCategory): string {
  return LABEL_BY_KEY[category];
}
