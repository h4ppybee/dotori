"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import {
  listEnvelopeItems,
  upsertEnvelopeItem,
  deleteEnvelopeItem,
  bulkUpdateEnvelope,
  getEnvelopeConfig,
  putEnvelopeConfig,
} from "@/lib/db/local-store";
import type { EnvelopeItem, EnvelopeConfig } from "@/lib/types";

const ITEMS_KEY = ["envelopeItems"] as const;
const CONFIG_KEY = ["envelopeConfig"] as const;

/** 통장 쪼개기 항목 전체. 잠금 상태에서는 비활성. */
export function useEnvelopeItems() {
  const locked = useAppStore((s) => s.locked);
  return useQuery({
    queryKey: ITEMS_KEY,
    enabled: !locked,
    staleTime: 30_000,
    queryFn: listEnvelopeItems,
  });
}

/** 커스텀 태그·은행 config. 잠금 상태에서는 비활성. */
export function useEnvelopeConfig() {
  const locked = useAppStore((s) => s.locked);
  return useQuery({
    queryKey: CONFIG_KEY,
    enabled: !locked,
    staleTime: 30_000,
    queryFn: getEnvelopeConfig,
  });
}

/** 항목 저장·삭제 + 커스텀 태그/은행 추가 뮤테이션. 성공 시 해당 쿼리 무효화. */
export function useEnvelopeMutations() {
  const qc = useQueryClient();
  const invalidateItems = () => qc.invalidateQueries({ queryKey: ITEMS_KEY });
  const invalidateConfig = () => qc.invalidateQueries({ queryKey: CONFIG_KEY });

  const save = useMutation({
    mutationFn: (
      input: Partial<EnvelopeItem> & { id?: string; profile: EnvelopeItem["profile"] },
    ) => upsertEnvelopeItem(input),
    onSuccess: invalidateItems,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteEnvelopeItem(id),
    onSuccess: invalidateItems,
  });

  const bulkUpdate = useMutation({
    mutationFn: (rows: EnvelopeItem[]) => bulkUpdateEnvelope(rows),
    onSuccess: invalidateItems,
  });

  // 커스텀 태그/은행 추가(중복 무시). config만 갱신.
  const addCustom = useMutation({
    mutationFn: async (v: { kind: "tag" | "account"; value: string }) => {
      const cfg = await getEnvelopeConfig();
      const list = v.kind === "tag" ? cfg.customTags : cfg.customAccounts;
      if (list.includes(v.value)) {
        return cfg;
      }
      const next: EnvelopeConfig =
        v.kind === "tag"
          ? { ...cfg, customTags: [...cfg.customTags, v.value] }
          : { ...cfg, customAccounts: [...cfg.customAccounts, v.value] };
      await putEnvelopeConfig(next);
      return next;
    },
    onSuccess: invalidateConfig,
  });

  return { save, remove, addCustom, bulkUpdate };
}
