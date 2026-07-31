"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { getGoal, putGoal, deleteGoal } from "@/lib/db/local-store";
import type { Goal } from "@/lib/types";

const GOAL_KEY = ["goal"] as const;

/** 순자산 목표 단건. 잠금 상태에서는 비활성. */
export function useGoal() {
  const locked = useAppStore((s) => s.locked);
  return useQuery({
    queryKey: GOAL_KEY,
    enabled: !locked,
    staleTime: 30_000,
    queryFn: async () => (await getGoal()) ?? null,
  });
}

/** 목표 저장·삭제 뮤테이션. 성공 시 goal 쿼리 무효화. */
export function useGoalMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: GOAL_KEY });

  const save = useMutation({
    mutationFn: (input: { targetNetWorthKrw: number; targetDate: string }) => {
      const goal: Goal = { id: "goal", createdAt: Date.now(), ...input };
      return putGoal(goal);
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: () => deleteGoal(),
    onSuccess: invalidate,
  });

  return { save, remove };
}
