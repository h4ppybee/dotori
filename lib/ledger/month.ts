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

/** start~end(양 끝 포함) 연속 월. start가 end보다 뒤면 빈 배열. */
export function monthRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let m = start; m <= end; m = addMonths(m, 1)) {
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
