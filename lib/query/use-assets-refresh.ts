"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { refreshAll, refreshPensionPrices } from "@/lib/sync/refresh";
import { refreshUpbit } from "@/lib/sync/refresh-upbit";
import { ensureFxFallback } from "@/lib/sync/fx-fallback";

interface RefreshFailure {
  connectionId: string;
  label: string;
  message: string;
}

/**
 * 자산 통합 새로고침. 토스 시세로 주식(보유종목)과 연금(symbol 보유분) 현재가를,
 * 업비트 API로 코인·예수금(AUTO)을 함께 갱신한다. 저축(수동 입력분)은 갱신 대상이 아니다.
 * 시작 시 오늘자 USDKRW가 없으면 공개 환율 API로 폴백한다(lib/sync/fx-fallback).
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
      // 오늘자 USDKRW가 없으면 먼저 공개 API로 보충한다. refreshAll이 마지막에
      // buildPortfolio를 실행하므로, USD 종목 + 환율 부재 상태로 들어가면 거기서
      // 실패한다(백업 불러오기 직후 등). 토스가 그날 성공하면 뒤에서 덮어쓴다(토스 우선).
      await ensureFxFallback();
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
