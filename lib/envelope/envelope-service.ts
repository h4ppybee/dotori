import type { EnvelopeItem, EnvelopeProfile } from "@/lib/types";

export interface EnvelopeRollupEntry {
  key: string;
  amountKrw: number;
  ratioPct: number;
}

export interface EnvelopeItemRow {
  item: EnvelopeItem;
  ratioPct: number;
}

export interface EnvelopeView {
  scope: "combined" | EnvelopeProfile;
  totalKrw: number;
  rows: EnvelopeItemRow[];
  byTag: EnvelopeRollupEntry[];
  byAccount: EnvelopeRollupEntry[];
  byProfile: EnvelopeRollupEntry[];
}

/** 비율 계산. total이 0이면 0 반환. */
function ratio(amount: number, total: number): number {
  return total > 0 ? (amount / total) * 100 : 0;
}

/** key별 합계 → 금액 내림차순, 동점이면 key 오름차순(결정적). */
function rollup(
  items: EnvelopeItem[],
  keyOf: (i: EnvelopeItem) => string,
  total: number,
): EnvelopeRollupEntry[] {
  const sums = new Map<string, number>();
  for (const it of items) {
    const key = keyOf(it);
    sums.set(key, (sums.get(key) ?? 0) + it.amountKrw);
  }
  return [...sums.entries()]
    .map(([key, amountKrw]) => ({ key, amountKrw, ratioPct: ratio(amountKrw, total) }))
    .sort((a, b) => b.amountKrw - a.amountKrw || a.key.localeCompare(b.key));
}

/**
 * 통장 쪼개기 집계. DB·Date·비동기 없이 입력만으로 결과를 낸다.
 *
 * `rows`:
 * - 프로필 뷰(wife/husband): 해당 프로필 항목만, sortOrder 오름차순.
 * - 통합 뷰(combined): 전체 항목, 아내 항목 먼저 → 남편 항목 순, 각 프로필 내 sortOrder 오름차순.
 *   ratioPct는 combined 총액 기준.
 */
export function buildEnvelopeView(input: {
  items: EnvelopeItem[];
  scope: "combined" | EnvelopeProfile;
}): EnvelopeView {
  const { items, scope } = input;

  // scope에 따라 대상 항목 필터링
  const target =
    scope === "combined" ? items : items.filter((i) => i.profile === scope);

  const totalKrw = target.reduce((s, i) => s + i.amountKrw, 0);

  // combined 뷰: 아내 항목 먼저, 그 다음 남편 항목. 각 프로필 내 sortOrder 오름차순.
  // 프로필 뷰: 해당 프로필 항목을 sortOrder 오름차순으로.
  const rows: EnvelopeItemRow[] =
    scope === "combined"
      ? [...target]
          .sort((a, b) =>
            a.profile === b.profile
              ? a.sortOrder - b.sortOrder
              : a.profile === "wife"
                ? -1
                : 1,
          )
          .map((item) => ({ item, ratioPct: ratio(item.amountKrw, totalKrw) }))
      : [...target]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((item) => ({ item, ratioPct: ratio(item.amountKrw, totalKrw) }));

  // byProfile은 combined 뷰에서만 의미 있음
  const byProfile =
    scope === "combined" ? rollup(target, (i) => i.profile, totalKrw) : [];

  return {
    scope,
    totalKrw,
    rows,
    byTag: rollup(target, (i) => i.tag, totalKrw),
    byAccount: rollup(target, (i) => i.account, totalKrw),
    byProfile,
  };
}
