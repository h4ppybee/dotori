import type { Holding } from "@/lib/types";

/**
 * 보유 종목을 화면 표시용 행(row)으로 정리한다.
 *
 * 합산하지 않는다: 같은 종목이라도 서로 다른 커넥션/소스에 있으면 별도 행으로 유지한다.
 * UI 순서를 예측 가능하게 하기 위해 안정적(stable)·결정적(deterministic) 정렬을 제공한다.
 * 정렬 기준: market → symbol → connectionId.
 */
export function mergeHoldings(holdings: Holding[]): Holding[] {
  return [...holdings].sort((a, b) => {
    if (a.market !== b.market) {
      return a.market < b.market ? -1 : 1;
    }
    if (a.symbol !== b.symbol) {
      return a.symbol < b.symbol ? -1 : 1;
    }
    if (a.connectionId !== b.connectionId) {
      return a.connectionId < b.connectionId ? -1 : 1;
    }
    return 0;
  });
}
