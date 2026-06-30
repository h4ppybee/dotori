"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { refreshAll, refreshPensionPrices } from "@/lib/sync/refresh";

interface RefreshFailure {
  connectionId: string;
  label: string;
  message: string;
}

/**
 * 자산 통합 새로고침. 토스 시세로 주식(보유종목)과 연금(symbol 보유분) 현재가를 함께 갱신한다.
 * 저축·코인은 수동 데이터라 갱신 대상이 아니다. 성공 시 portfolio·pension 쿼리를 무효화한다.
 */
export function useAssetsRefresh() {
  const sessionKey = useAppStore((s) => s.sessionKey);
  const setLastRefresh = useAppStore((s) => s.setLastRefresh);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<{ failures: RefreshFailure[] }> => {
      if (sessionKey === null) {
        throw new Error("잠금 해제 후 새로고침할 수 있어요.");
      }
      const stocks = await refreshAll({ key: sessionKey });
      const pension = await refreshPensionPrices({ key: sessionKey });
      return { failures: [...stocks.failures, ...pension.failures] };
    },
    onSuccess: () => {
      setLastRefresh(Date.now());
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["pension"] });
    },
  });
}
