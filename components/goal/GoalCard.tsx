"use client";

import { Card } from "@/components/ui/Card";
import { GoalProgressRing } from "@/components/goal/GoalProgressRing";
import { formatKrw } from "@/lib/format";
import type { GoalProgress } from "@/lib/goal/goal-service";

interface GoalCardProps {
  progress: GoalProgress;
  targetDate: string;
  onEdit: () => void;
}

/**
 * 순자산 목표 카드. 진행률 링 + 상태별 안내(월 적립액·남은 금액)를 보여준다.
 * 금액은 손익이 아니므로 증시 색을 쓰지 않고 뉴트럴 text-ink로만 표기한다.
 */
export function GoalCard({ progress, targetDate, onEdit }: GoalCardProps) {
  return (
    <Card className="flex flex-col items-center gap-5">
      {/* 상단 우측 수정 */}
      <div className="flex w-full items-center justify-between">
        <span className="text-[15px] font-semibold leading-[1.4] text-ink">순자산 목표</span>
        <button
          type="button"
          onClick={onEdit}
          className="px-2 py-1 text-[13px] font-semibold text-primary hover:underline underline-offset-2"
        >
          수정
        </button>
      </div>

      <GoalProgressRing
        pct={progress.progressPct}
        centerLabel="목표 달성률"
        centerValue={`${Math.round(progress.progressPct)}%`}
        ariaLabel="목표 달성률"
      />

      {/* 상태별 안내 */}
      <div className="flex flex-col items-center gap-1 text-center">
        {progress.status === "active" && (
          <>
            <p className="text-[17px] font-bold leading-[1.4] tracking-[-0.2px] tabular-nums text-ink">
              매월 {formatKrw(progress.monthlyRequiredKrw)}씩 모으면 돼요
            </p>
            <p className="text-[15px] leading-[1.5] tabular-nums text-body">
              목표까지 {formatKrw(progress.remainingKrw)} 남았어요
            </p>
            <p className="text-[13px] leading-[1.45] tabular-nums text-muted">
              {targetDate}까지 {formatKrw(progress.targetKrw)}
            </p>
          </>
        )}

        {progress.status === "achieved" && (
          <>
            <p className="text-[17px] font-bold leading-[1.4] tracking-[-0.2px] text-ink">
              목표를 달성했어요
            </p>
            <p className="text-[13px] leading-[1.45] tabular-nums text-muted">
              목표 {formatKrw(progress.targetKrw)}
            </p>
          </>
        )}

        {progress.status === "overdue" && (
          <>
            <p className="text-[17px] font-bold leading-[1.4] tracking-[-0.2px] text-ink">
              목표일이 지났어요. 날짜를 다시 설정해 보세요
            </p>
            <p className="text-[15px] leading-[1.5] tabular-nums text-body">
              목표까지 {formatKrw(progress.remainingKrw)} 남았어요
            </p>
          </>
        )}
      </div>
    </Card>
  );
}
