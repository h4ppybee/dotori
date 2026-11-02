"use client";

import { queryOptions, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { listDebts, upsertDebt, deleteDebt } from "@/lib/db/local-store";
import { buildDebtVM } from "@/lib/debt/debt-service";
import type { LoanAccount } from "@/lib/types";

const DEBT_KEY = ["debts"] as const;

/** 부채 쿼리 설정 — 훅과 잠금 해제 직후 미리 읽기(prefetchAppData)가 함께 쓴다. */
export const debtQueryOptions = queryOptions({
  queryKey: DEBT_KEY,
  staleTime: 30_000,
  queryFn: async () => buildDebtVM(await listDebts()),
});

/** 대출/부채 뷰모델을 로컬 DB에서 읽어 계산해 반환한다. 잠금 상태에서는 비활성. */
export function useDebt() {
  const locked = useAppStore((s) => s.locked);
  return useQuery({ ...debtQueryOptions, enabled: !locked });
}

/** 대출 추가/수정·삭제 뮤테이션. 성공 시 debts 쿼리 무효화. */
export function useDebtMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: DEBT_KEY });

  const upsert = useMutation({
    mutationFn: (d: Partial<LoanAccount> & { id?: string }) => upsertDebt(d),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteDebt(id),
    onSuccess: invalidate,
  });

  return { upsert, remove };
}
