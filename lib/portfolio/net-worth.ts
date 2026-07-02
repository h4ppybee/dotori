// 순자산 구성 순수 계산. DB·비동기·Date 없이 입력(자산 합계·부채)만으로 결과를 낸다.
// 자산 개요 도넛(순자산 vs 부채)에서 소비한다. 도넛 전체 = 자산 합계.

export interface NetWorthComposition {
  /** 자산 합계(주식+저축+연금+코인). 도넛 전체 = 100%. */
  totalAssets: number;
  /** 부채 합계. */
  debt: number;
  /** 순자산 = 자산 합계 − 부채. 음수일 수 있다(가운데 표시용으로 값 보존). */
  netWorth: number;
  /** 순자산 조각 비율 0~100. */
  netWorthPct: number;
  /** 부채 조각 비율 0~100. */
  debtPct: number;
}

/**
 * 자산 합계와 부채를 순자산/부채 두 조각으로 나눈다.
 * - 자산이 없으면(≤0) 조각 비율은 0(소비자가 카드를 노출하지 않음).
 * - 부채가 자산을 초과해 순자산이 음수면 순자산 0% / 부채 100%로 클램프하고,
 *   순자산 값 자체는 음수 그대로 보존한다(가운데에 음수 순자산을 표시하기 위함).
 */
export function computeNetWorth(totalAssets: number, debt: number): NetWorthComposition {
  const netWorth = totalAssets - debt;
  if (totalAssets <= 0) {
    return { totalAssets, debt, netWorth, netWorthPct: 0, debtPct: 0 };
  }
  if (netWorth <= 0) {
    return { totalAssets, debt, netWorth, netWorthPct: 0, debtPct: 100 };
  }
  return {
    totalAssets,
    debt,
    netWorth,
    netWorthPct: (netWorth / totalAssets) * 100,
    debtPct: (debt / totalAssets) * 100,
  };
}
