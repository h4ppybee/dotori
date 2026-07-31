"use client";

import { usePortfolio } from "./use-portfolio";
import { useSavings } from "./use-savings";
import { usePension } from "./use-pension";
import { useCoin } from "./use-coin";
import { useDebt } from "./use-debt";

/** 순자산(주식+저축+연금+코인 − 부채) 공유 훅. 잠금 시 각 쿼리 비활성 → 0/false. */
export function useNetWorth(): { netWorthKrw: number; isLoading: boolean } {
  const portfolio = usePortfolio();
  const savings = useSavings();
  const pension = usePension();
  const coin = useCoin();
  const debt = useDebt();

  const total =
    (portfolio.data?.totalValueKrw ?? 0) +
    (savings.data?.totalKrw ?? 0) +
    (pension.data?.totalValueKrw ?? 0) +
    (coin.data?.totalValueKrw ?? 0);
  const netWorthKrw = total - (debt.data?.totalKrw ?? 0);

  const isLoading =
    portfolio.isLoading ||
    savings.isLoading ||
    pension.isLoading ||
    coin.isLoading ||
    debt.isLoading;

  return { netWorthKrw, isLoading };
}
