"use client";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface GoalEmptyStateProps {
  onSet: () => void;
}

/**
 * 순자산 목표 미설정 상태. 목표를 정하도록 유도하는 CTA 카드.
 * 목표가 있으면 GoalCard로 대체된다.
 */
export function GoalEmptyState({ onSet }: GoalEmptyStateProps) {
  return (
    <Card className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="flex flex-col gap-1.5">
        <p className="text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink">
          목표 자산을 정해볼까요?
        </p>
        <p className="text-[15px] leading-[1.5] text-body-soft">
          목표 금액과 날짜를 정하면 매달 얼마씩 모아야 할지 알려드려요.
        </p>
      </div>
      <Button variant="primary" onClick={onSet} className="w-full">
        목표 설정하기
      </Button>
    </Card>
  );
}
