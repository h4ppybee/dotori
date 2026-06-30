"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { listPension, upsertPension, deletePension, bulkUpdatePension } from "@/lib/db/local-store";
import { buildPensionVM } from "@/lib/pension/pension-service";
import type { PensionAccount } from "@/lib/types";

const PENSION_KEY = ["pension"] as const;

/** 연금 뷰모델을 로컬 DB에서 읽어 계산해 반환한다. 잠금 상태에서는 비활성. */
export function usePension() {
  const locked = useAppStore((s) => s.locked);
  return useQuery({
    queryKey: PENSION_KEY,
    enabled: !locked,
    staleTime: 30_000,
    queryFn: async () => buildPensionVM(await listPension()),
  });
}

/** 연금 계좌 추가/수정·삭제·일괄저장 뮤테이션. 성공 시 pension 쿼리 무효화. */
export function usePensionMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: PENSION_KEY });

  const upsert = useMutation({
    mutationFn: (p: Partial<PensionAccount> & { id?: string }) => upsertPension(p),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deletePension(id),
    onSuccess: invalidate,
  });
  const bulkUpdate = useMutation({
    mutationFn: (rows: PensionAccount[]) => bulkUpdatePension(rows),
    onSuccess: invalidate,
  });

  return { upsert, remove, bulkUpdate };
}
