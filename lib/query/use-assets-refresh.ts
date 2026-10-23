"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { refreshAll, refreshPensionPrices } from "@/lib/sync/refresh";
import { refreshUpbit } from "@/lib/sync/refresh-upbit";
import { refreshSavingsAccrual } from "@/lib/sync/refresh-savings";
import { ensureFxFallback } from "@/lib/sync/fx-fallback";
import { toLocalYmd } from "@/lib/format";
import { runSheetExport } from "@/lib/query/use-sheet-export";
import { awaitPendingPull, pushIfChanged } from "@/lib/device-sync/engine";

interface RefreshFailure {
  connectionId: string;
  label: string;
  message: string;
}

/**
 * 자산 통합 새로고침. 토스 시세로 주식(보유종목)과 연금(symbol 보유분) 현재가를,
 * 업비트 API로 코인·예수금(AUTO)을 함께 갱신한다. 수동 저축 중 예적금은 금액 기준일 이후
 * 지난 납입일만큼 월 불입액을 더한다(lib/sync/refresh-savings, 외부 호출 없음).
 * 시작 시 오늘자 USDKRW가 없으면 공개 환율 API로 폴백한다(lib/sync/fx-fallback).
 * 성공 시 portfolio·pension·coin·savings 쿼리를 무효화한다.
 * 성공 후 시트 내보내기 설정이 있으면 기다리지 않고 내보낸다(결과는 app-store.lastSheetExport).
 * 잠금 해제 직후 시작된 기기 동기화 받기가 있으면 먼저 기다리고(최대 10초), 성공 후 바뀐 내용을 기다리지 않고 올린다.
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
      // 진행 중인 기기 동기화 받기를 먼저 기다린다(최대 10초, 실패해도 갱신은 진행).
      // 받은 데이터 위에서 시세·자동 증가를 다시 계산하고, 갱신의 bulkPut이 받은 값을 덮지 않게 하기 위함.
      // 타임아웃이 나면 엔진이 그 받기를 보류해 갱신 도중에 적용하지 않는다.
      await awaitPendingPull();
      // 오늘자 USDKRW가 없으면 먼저 공개 API로 보충한다. refreshAll이 마지막에
      // buildPortfolio를 실행하므로, USD 종목 + 환율 부재 상태로 들어가면 거기서
      // 실패한다(백업 불러오기 직후 등). 토스가 그날 성공하면 뒤에서 덮어쓴다(토스 우선).
      await ensureFxFallback();
      const stocks = await refreshAll({ key: sessionKey });
      const pension = await refreshPensionPrices({ key: sessionKey });
      const upbit = await refreshUpbit({ key: sessionKey });
      await refreshSavingsAccrual({ today: toLocalYmd(Date.now()) });
      return { failures: [...stocks.failures, ...pension.failures, ...upbit.failures] };
    },
    onSuccess: () => {
      setLastRefresh(Date.now());
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["pension"] });
      queryClient.invalidateQueries({ queryKey: ["coin"] });
      queryClient.invalidateQueries({ queryKey: ["savings"] });
      // 시트 내보내기는 기다리지 않는다(갱신 스피너·쿼리 무효화를 늦추지 않음).
      // 일부 연결이 실패해도 DB의 마지막 값으로 내보낸다. 설정이 없으면 skipped.
      // 렌더 시점 클로저의 sessionKey가 아니라, 이 순간 스토어 값을 다시 읽는다 — 갱신 도중
      // 화면을 벗어나 훅이 사라진 뒤 잠겨도(언마운트 후엔 리렌더로 값이 갱신되지 않는다)
      // stale 키로 내보내지 않기 위함.
      const currentSessionKey = useAppStore.getState().sessionKey;
      if (currentSessionKey !== null) {
        void runSheetExport(currentSessionKey);
        // 납입일 자동 증가 등으로 바뀐 내용을 바로 올려 다른 기기와의 충돌을 줄인다(해시가 같으면 요청 없음).
        void pushIfChanged();
      }
    },
  });
}
