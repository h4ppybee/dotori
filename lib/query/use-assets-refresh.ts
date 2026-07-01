"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { refreshAll, refreshPensionPrices } from "@/lib/sync/refresh";
import { refreshUpbit } from "@/lib/sync/refresh-upbit";

interface RefreshFailure {
  connectionId: string;
  label: string;
  message: string;
}

/**
 * 자산 통합 새로고침. 토스 시세로 주식(보유종목)과 연금(symbol 보유분) 현재가를,
 * 업비트 API로 코인·예수금(AUTO)을 함께 갱신한다. 저축(수동 입력분)은 갱신 대상이 아니다.
 * 성공 시 portfolio·pension·coin·savings 쿼리를 무효화한다.
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
      const upbit = await refreshUpbit({ key: sessionKey });
      return { failures: [...stocks.failures, ...pension.failures, ...upbit.failures] };
    },
    onSuccess: () => {
      setLastRefresh(Date.now());
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["pension"] });
      queryClient.invalidateQueries({ queryKey: ["coin"] });
      queryClient.invalidateQueries({ queryKey: ["savings"] });
    },
  });
}
