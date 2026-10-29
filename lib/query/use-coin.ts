"use client";

import { queryOptions, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { listCoin, upsertCoin, deleteCoin, bulkUpdateCoin } from "@/lib/db/local-store";
import { buildCoinVM } from "@/lib/coin/coin-service";
import type { CoinHolding } from "@/lib/types";

const COIN_KEY = ["coin"] as const;

/** 코인 쿼리 설정 — 훅과 잠금 해제 직후 미리 읽기(prefetchAppData)가 함께 쓴다. */
export const coinQueryOptions = queryOptions({
  queryKey: COIN_KEY,
  staleTime: 30_000,
  queryFn: async () => buildCoinVM(await listCoin()),
});

/** 코인 뷰모델을 로컬 DB에서 읽어 계산해 반환한다. 잠금 상태에서는 비활성. */
export function useCoin() {
  const locked = useAppStore((s) => s.locked);
  return useQuery({ ...coinQueryOptions, enabled: !locked });
}

/** 코인 보유 추가/수정·삭제·일괄저장 뮤테이션. 성공 시 coin 쿼리 무효화. */
export function useCoinMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: COIN_KEY });

  const upsert = useMutation({
    mutationFn: (c: Partial<CoinHolding> & { id?: string }) => upsertCoin(c),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteCoin(id),
    onSuccess: invalidate,
  });
  const bulkUpdate = useMutation({
    mutationFn: (rows: CoinHolding[]) => bulkUpdateCoin(rows),
    onSuccess: invalidate,
  });

  return { upsert, remove, bulkUpdate };
}
