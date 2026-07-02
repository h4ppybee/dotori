"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import {
  listAssetSnapshots,
  getAssetSnapshot,
  deleteAssetSnapshot,
} from "@/lib/db/local-store";
import { captureAssetSnapshot } from "@/lib/snapshot/capture";

const SNAPSHOT_KEY = ["assetSnapshots"] as const;

/** 스냅샷 목록(최신 우선). limit 미지정 시 전체. 잠금 상태에서는 비활성. */
export function useAssetSnapshots(limit?: number) {
  const locked = useAppStore((s) => s.locked);

  return useQuery({
    queryKey: [...SNAPSHOT_KEY, limit ?? "all"],
    enabled: !locked,
    staleTime: 30_000,
    queryFn: () => listAssetSnapshots(limit),
  });
}

/** 스냅샷 단건. 잠금 상태에서는 비활성. */
export function useAssetSnapshot(id: string) {
  const locked = useAppStore((s) => s.locked);

  return useQuery({
    queryKey: [...SNAPSHOT_KEY, "detail", id],
    enabled: !locked,
    staleTime: 30_000,
    queryFn: () => getAssetSnapshot(id),
  });
}

/** 스냅샷 기록·삭제 뮤테이션. 성공 시 스냅샷 쿼리 전체 무효화. */
export function useSnapshotMutations() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY });

  const take = useMutation({
    mutationFn: () =>
      captureAssetSnapshot({ id: crypto.randomUUID(), createdAt: Date.now() }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteAssetSnapshot(id),
    onSuccess: invalidate,
  });

  return { take, remove };
}
