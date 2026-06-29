import { formatKrw, formatUsd } from "@/lib/format";
import type { SavingsAccount } from "@/lib/types";

/** 계좌 금액을 자기 통화 기호로 포맷한다(USD=$, 그 외=₩). */
export function formatAccountAmount(account: Pick<SavingsAccount, "amount" | "currency">): string {
  if (account.currency === "USD") {
    return formatUsd(account.amount);
  }
  return formatKrw(account.amount);
}

/** 이율(%)을 "연 X%"로. 정수면 소수점 없이, 아니면 최대 2자리. */
export function formatRate(rate: number): string {
  const fixed = Number.isInteger(rate) ? String(rate) : rate.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `연 ${fixed}%`;
}

/** 행 보조 라인: 은행 · 연 X% · 만기 YYYY-MM-DD (빈 항목은 생략). */
export function accountMetaLine(account: SavingsAccount): string {
  const parts: string[] = [];
  if (account.bank) {
    parts.push(account.bank);
  }
  if (account.interestRate != null) {
    parts.push(formatRate(account.interestRate));
  }
  if (account.maturityDate) {
    parts.push(`만기 ${account.maturityDate}`);
  }
  return parts.join(" · ");
}
