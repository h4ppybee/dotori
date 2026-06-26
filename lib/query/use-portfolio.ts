"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { listHoldings, listPrices, getFx, getSectorOverrides } from "@/lib/db/local-store";
import { buildPortfolio } from "@/lib/portfolio/portfolio-service";
import { refreshAll } from "@/lib/sync/refresh";

const PORTFOLIO_KEY = ["portfolio"] as const;

/** 포트폴리오 뷰모델을 로컬 DB에서 읽어 계산해 반환한다. 잠금 상태에서는 비활성. */
export function usePortfolio() {
  const locked = useAppStore((s) => s.locked);

  return useQuery({
    queryKey: PORTFOLIO_KEY,
    enabled: !locked,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [holdings, prices, fx, sectorOverrides] = await Promise.all([
        listHoldings(),
        listPrices(),
        getFx(),
        getSectorOverrides(),
      ]);
      return buildPortfolio({
        holdings,
        prices,
        fx: fx ? { rate: fx.rate } : undefined,
        sectorOverrides,
      });
    },
  });
}

/** 토스 데이터 전체 갱신 뮤테이션. 성공 시 lastRefreshAt 갱신 + portfolio 쿼리 무효화. */
export function useRefresh() {
  const sessionKey = useAppStore((s) => s.sessionKey);
  const setLastRefresh = useAppStore((s) => s.setLastRefresh);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (sessionKey === null) {
        throw new Error("잠금 해제 후 새로고침할 수 있어요.");
      }
      return refreshAll({ key: sessionKey });
    },
    onSuccess: () => {
      setLastRefresh(Date.now());
      queryClient.invalidateQueries({ queryKey: PORTFOLIO_KEY });
    },
  });
}
