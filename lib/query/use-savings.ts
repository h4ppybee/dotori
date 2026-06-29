"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import {
  listSavings,
  getFx,
  upsertSavings,
  deleteSavings,
  bulkUpdateSavings,
} from "@/lib/db/local-store";
import { buildSavingsVM } from "@/lib/savings/savings-service";
import type { SavingsAccount } from "@/lib/types";

const SAVINGS_KEY = ["savings"] as const;

/** 저축/현금성 뷰모델을 로컬 DB에서 읽어 계산해 반환한다. 잠금 상태에서는 비활성. */
export function useSavings() {
  const locked = useAppStore((s) => s.locked);

  return useQuery({
    queryKey: SAVINGS_KEY,
    enabled: !locked,
    staleTime: 30_000,
    queryFn: async () => {
      const [accounts, fx] = await Promise.all([listSavings(), getFx()]);
      return buildSavingsVM(accounts, fx?.rate);
    },
  });
}

/** 저축 계좌 추가/수정·삭제·일괄저장 뮤테이션. 성공 시 savings 쿼리 무효화. */
export function useSavingsMutations() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: SAVINGS_KEY });

  const upsert = useMutation({
    mutationFn: (s: Partial<SavingsAccount> & { id?: string }) => upsertSavings(s),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteSavings(id),
    onSuccess: invalidate,
  });

  const bulkUpdate = useMutation({
    mutationFn: (rows: SavingsAccount[]) => bulkUpdateSavings(rows),
    onSuccess: invalidate,
  });

  return { upsert, remove, bulkUpdate };
}
