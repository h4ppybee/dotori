"use client";

import { queryOptions, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import {
  listEnvelopeItems,
  upsertEnvelopeItem,
  deleteEnvelopeItem,
  bulkUpdateEnvelope,
  getEnvelopeConfig,
  putEnvelopeConfig,
  replaceEnvelopeItems,
} from "@/lib/db/local-store";
import { importEnvelopeFromSheet } from "@/lib/envelope/import-from-sheet";
import type { ImportedEnvelopeItem } from "@/lib/envelope/sheet-import";
import type { EnvelopeItem, EnvelopeConfig } from "@/lib/types";

const ITEMS_KEY = ["envelopeItems"] as const;
const CONFIG_KEY = ["envelopeConfig"] as const;

/** 통장 쪼개기 쿼리 설정 — 훅과 잠금 해제 직후 미리 읽기(prefetchAppData)가 함께 쓴다. */
export const envelopeItemsQueryOptions = queryOptions({
  queryKey: ITEMS_KEY,
  staleTime: 30_000,
  queryFn: listEnvelopeItems,
});
export const envelopeConfigQueryOptions = queryOptions({
  queryKey: CONFIG_KEY,
  staleTime: 30_000,
  queryFn: getEnvelopeConfig,
});

/** 통장 쪼개기 항목 전체. 잠금 상태에서는 비활성. */
export function useEnvelopeItems() {
  const locked = useAppStore((s) => s.locked);
  return useQuery({ ...envelopeItemsQueryOptions, enabled: !locked });
}

/** 커스텀 태그·은행 config. 잠금 상태에서는 비활성. */
export function useEnvelopeConfig() {
  const locked = useAppStore((s) => s.locked);
  return useQuery({ ...envelopeConfigQueryOptions, enabled: !locked });
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

/**
 * 시트에서 가져오기 — 두 단계.
 * preview: 시트를 읽어 파싱만 한다(DB 변경 없음, 실패는 { status: "error" }로 반환).
 * apply: 확인받은 항목으로 통째로 교체하고 항목·config 쿼리를 무효화한다.
 */
export function useEnvelopeSheetImport() {
  const sessionKey = useAppStore((s) => s.sessionKey);
  const qc = useQueryClient();

  const preview = useMutation({
    mutationFn: async () => {
      if (sessionKey === null) {
        return { status: "error" as const, message: "잠금 해제 후 가져올 수 있어요." };
      }
      return importEnvelopeFromSheet({ key: sessionKey });
    },
  });

  const apply = useMutation({
    mutationFn: (items: ImportedEnvelopeItem[]) => replaceEnvelopeItems(items),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ITEMS_KEY });
      void qc.invalidateQueries({ queryKey: CONFIG_KEY });
    },
  });

  return { preview, apply };
}
