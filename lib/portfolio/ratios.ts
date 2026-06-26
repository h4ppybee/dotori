/**
 * 섹터·종목 비율 계산 순수 함수. 입력 행은 이미 KRW로 환산된 valueKrw를 들고 있다.
 */

function pctOf(value: number, total: number): number {
  if (total > 0) {
    return (value / total) * 100;
  }
  return 0;
}

export function bySector(
  rows: { sector: string; valueKrw: number }[],
): { sector: string; valueKrw: number; pct: number }[] {
  const total = rows.reduce((s, r) => s + r.valueKrw, 0);
  const grouped = new Map<string, number>();
  for (const r of rows) {
    grouped.set(r.sector, (grouped.get(r.sector) ?? 0) + r.valueKrw);
  }
  return [...grouped.entries()]
    .map(([sector, valueKrw]) => ({ sector, valueKrw, pct: pctOf(valueKrw, total) }))
    .sort((a, b) => b.valueKrw - a.valueKrw);
}

export function byHolding(
  rows: { symbol: string; name: string; valueKrw: number }[],
): { symbol: string; name: string; valueKrw: number; pct: number }[] {
  const total = rows.reduce((s, r) => s + r.valueKrw, 0);
  return rows
    .map((r) => ({
      symbol: r.symbol,
      name: r.name,
      valueKrw: r.valueKrw,
      pct: pctOf(r.valueKrw, total),
    }))
    .sort((a, b) => b.valueKrw - a.valueKrw);
}
