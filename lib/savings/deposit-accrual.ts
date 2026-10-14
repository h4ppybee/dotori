import type { SavingsAccount } from "@/lib/types";

// 예적금 월 불입액 자동 증가 (순수 계산). 날짜는 "YYYY-MM-DD" 문자열로만 다룬다.
// 납입일 = 만기일 다음 날의 일자(만기 07-24 → 매월 25일, 만기가 말일이면 매월 1일).
// 금액 기준일(balanceAsOf) 다음 날부터 min(오늘, 만기일)까지 지난 납입일 수만큼 더한다.

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number) => String(n).padStart(2, "0");

function parseYmd(s: string): { y: number; m: number; d: number } | null {
  const match = YMD.exec(s);
  if (!match) {
    return null;
  }
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function daysInMonth(y: number, m: number): number {
  if (m === 2) {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

/** 만기일로부터 월 납입일(1~31)을 구한다. 형식이 잘못되면 null. */
export function depositPayDay(maturityDate: string): number | null {
  const p = parseYmd(maturityDate);
  if (!p) {
    return null;
  }
  return p.d >= daysInMonth(p.y, p.m) ? 1 : p.d + 1;
}

/** from < 납입일 ≤ to 인 월별 납입일 개수. 그 달에 없는 일자는 말일로 보정한다. */
function countPayDays(from: string, to: string, payDay: number): number {
  const start = parseYmd(from);
  const end = parseYmd(to);
  if (!start || !end) {
    return 0;
  }
  let count = 0;
  let y = start.y;
  let m = start.m;
  while (y < end.y || (y === end.y && m <= end.m)) {
    const day = Math.min(payDay, daysInMonth(y, m));
    const date = `${y}-${pad(m)}-${pad(day)}`;
    if (date > from && date <= to) {
      count += 1;
    }
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return count;
}

/**
 * 예적금 금액을 오늘 기준으로 갱신한다. 바꿀 게 없으면 null.
 * 기준일이 없는 행은 소급하지 않고 기준일만 오늘로 초기화한다.
 */
export function accrueDeposit(
  account: SavingsAccount,
  today: string,
): { amount: number; balanceAsOf: string } | null {
  if (account.category !== "DEPOSIT" || account.source !== "MANUAL") {
    return null;
  }
  if ((account.currency ?? "KRW") !== "KRW") {
    return null;
  }
  const monthly = account.monthlyDeposit ?? 0;
  if (monthly <= 0 || !account.maturityDate) {
    return null;
  }
  const payDay = depositPayDay(account.maturityDate);
  if (payDay === null) {
    return null;
  }
  if (!account.balanceAsOf) {
    return { amount: account.amount, balanceAsOf: today };
  }
  if (account.balanceAsOf >= today) {
    return null;
  }
  const until = today < account.maturityDate ? today : account.maturityDate;
  const times = countPayDays(account.balanceAsOf, until, payDay);
  return { amount: account.amount + monthly * times, balanceAsOf: today };
}
