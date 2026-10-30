"use client";

import { queryOptions, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { listLedgerMonths, saveLedgerAmounts, saveLedgerMemo } from "@/lib/db/local-store";

export const LEDGER_KEY = ["ledgerMonths"] as const;

/** 가계부 전체 달(월 오름차순) 쿼리 설정 — 훅과 잠금 해제 직후 미리 읽기(prefetchAppData)가 함께 쓴다. */
export const ledgerMonthsQueryOptions = queryOptions({
  queryKey: LEDGER_KEY,
  staleTime: 30_000,
  queryFn: listLedgerMonths,
});

/** 가계부 전체 달. 잠금 상태에서는 비활성. */
export function useLedgerMonths() {
  const locked = useAppStore((s) => s.locked);
  return useQuery({ ...ledgerMonthsQueryOptions, enabled: !locked });
}

/**
 * 금액·회고 저장 뮤테이션. 성공 시 가계부 쿼리 무효화.
 * saveAmounts의 amounts는 모든 잎의 최종 값(편집 draft 전체)이다 — 저장 규칙은 saveLedgerAmounts 참고.
 */
export function useLedgerMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: LEDGER_KEY });

  const saveAmounts = useMutation({
    mutationFn: (v: { month: string; amounts: Record<string, number> }) => saveLedgerAmounts(v.month, v.amounts),
    onSuccess: invalidate,
  });

  const saveMemo = useMutation({
    mutationFn: (v: { month: string; memo: string }) => saveLedgerMemo(v.month, v.memo),
    onSuccess: invalidate,
  });

  return { saveAmounts, saveMemo };
}
