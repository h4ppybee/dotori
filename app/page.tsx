"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import { GoalCard } from "@/components/goal/GoalCard";
import { GoalForm } from "@/components/goal/GoalForm";
import { GoalEmptyState } from "@/components/goal/GoalEmptyState";
import { useNetWorth } from "@/lib/query/use-net-worth";
import { useGoal, useGoalMutations } from "@/lib/query/use-goal";
import { buildGoalProgress } from "@/lib/goal/goal-service";
import { formatKrw } from "@/lib/format";

export default function HomePage() {
  const { netWorthKrw, isLoading: netWorthLoading } = useNetWorth();
  const goalQuery = useGoal();
  const goal = goalQuery.data;
  const { save, remove } = useGoalMutations();
  const [formOpen, setFormOpen] = useState(false);

  // 진척 계산에 쓸 오늘 날짜(로컬 기준 YYYY-MM-DD). 순수 함수에 주입한다.
  const todayIso = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto w-full max-w-[480px] px-4 pt-6 pb-28 flex flex-col gap-4">
        {/* 순자산 히어로 */}
        <Card variant="hero" className="flex flex-col gap-2">
          <span className="text-[13px] font-normal leading-[1.45] text-muted">순자산</span>
          <PrivacyAmount revealLabel="순자산 보기">
            <span className="text-[28px] font-bold leading-[1.2] tracking-[-0.5px] tabular-nums text-ink">
              {/* 불러오는 동안 0원이 잠깐 보였다가 바뀌지 않게, 높이만 지키고 비워 둔다. */}
              {netWorthLoading ? "\u00A0" : formatKrw(netWorthKrw)}
            </span>
          </PrivacyAmount>
        </Card>

        {/* 목표 섹션 — 미설정이면 빈 상태, 있으면 진척 카드. 불러오는 중에는 빈 상태가 잠깐 보이지 않게 그리지 않는다. */}
        {goalQuery.isPending ? null : goal == null ? (
          <GoalEmptyState onSet={() => setFormOpen(true)} />
        ) : (
          <GoalCard
            progress={buildGoalProgress({
              currentNetWorthKrw: netWorthKrw,
              targetNetWorthKrw: goal.targetNetWorthKrw,
              targetDate: goal.targetDate,
              todayIso,
            })}
            targetDate={goal.targetDate}
            onEdit={() => setFormOpen(true)}
          />
        )}

        {/* 목표 폼 — open일 때만 렌더링하고 goal 기준 key로 리마운트해
            내부 상태가 열릴 때마다(생성/수정) 새로 초기화되게 한다. */}
        {formOpen && (
          <GoalForm
            key={`goal-form-${goal?.createdAt ?? "new"}`}
            open={formOpen}
            initial={
              goal != null
                ? { targetNetWorthKrw: goal.targetNetWorthKrw, targetDate: goal.targetDate }
                : undefined
            }
            onClose={() => setFormOpen(false)}
            onSubmit={(v) => {
              save.mutate(v, { onSuccess: () => setFormOpen(false) });
            }}
            onDelete={
              goal != null
                ? () => {
                    remove.mutate(undefined, { onSuccess: () => setFormOpen(false) });
                  }
                : undefined
            }
            submitting={save.isPending}
          />
        )}
      </div>
    </main>
  );
}
