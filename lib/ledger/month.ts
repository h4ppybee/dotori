/**
 * 가계부 월 문자열("YYYY-MM") 헬퍼. 순수 함수 — 현재 월은 호출부가 Date를 주입한다.
 */

function parse(month: string): [number, number] {
  const [y, m] = month.split("-").map(Number);
  return [y, m];
}

function format(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** month에서 delta개월 이동. addMonths("2026-01", -1) === "2025-12". */
export function addMonths(month: string, delta: number): string {
  const [y, m] = parse(month);
  const total = y * 12 + (m - 1) + delta;
  return format(Math.floor(total / 12), (total % 12) + 1);
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "YYYY-MM"(01~12) 형식인지. */
export function isValidMonth(month: string): boolean {
  return MONTH_RE.test(month);
}

// 연속 월 축의 안전 상한(100년). 잘못된 데이터로 축이 끝없이 길어지는 것을 막는다.
const MAX_RANGE_MONTHS = 1200;

/** start~end(양 끝 포함) 연속 월. 형식이 잘못됐거나 start가 end보다 뒤면 빈 배열. 최대 100년치. */
export function monthRange(start: string, end: string): string[] {
  if (!isValidMonth(start) || !isValidMonth(end) || start > end) {
    return [];
  }
  const out: string[] = [];
  for (let m = start; m <= end && out.length < MAX_RANGE_MONTHS; m = addMonths(m, 1)) {
    out.push(m);
  }
  return out;
}

/** "2026-10" → "2026년 10월" */
export function formatMonthTitle(month: string): string {
  const [y, m] = parse(month);
  return `${y}년 ${m}월`;
}

/** 주입한 시각의 로컬 연·월. */
export function currentMonth(now: Date): string {
  return format(now.getFullYear(), now.getMonth() + 1);
}
