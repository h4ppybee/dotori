"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SnapshotTrendChart } from "@/components/snapshot/SnapshotTrendChart";
import { SnapshotListItem } from "@/components/snapshot/SnapshotListItem";
import { useAssetSnapshots, useSnapshotMutations } from "@/lib/query/use-asset-snapshots";

const CHART_COUNT = 20;
const LIST_COUNT = 10;

/**
 * 자산 탭 하단 스냅샷 섹션: 기록 버튼 + 추이 콤보 차트(최신 20) + 최근 10개 목록 + 더보기.
 * 차트 20개 + 변화량 계산용 직전 1개 = 21개를 한 번에 조회하고 목록은 앞 10개만 쓴다.
 */
/** 에러 원인을 사용자 문구로. Error가 아니면 일반 문구로 폴백한다. */
function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "알 수 없는 오류가 발생했어요";
}

export function SnapshotSection({ takeDisabled }: { takeDisabled: boolean }) {
  const { data: snapshots, isLoading, isError } = useAssetSnapshots(CHART_COUNT + 1);
  const { take } = useSnapshotMutations();

  // 로딩 중 빈 상태 깜빡임 방지 (DebtSection과 동일 패턴)
  if (isLoading) {
    return null;
  }

  const items = snapshots ?? [];
  const listItems = items.slice(0, LIST_COUNT);
  const hasMore = items.length > LIST_COUNT;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[15px] font-semibold text-ink">스냅샷</h2>
        <button
          onClick={() => take.mutate()}
          disabled={takeDisabled || take.isPending}
          className="text-[13px] font-medium text-muted active:text-ink disabled:opacity-40"
        >
          {take.isPending ? "기록 중…" : "+ 지금 기록"}
        </button>
      </div>

      {take.isError && (
        <p className="px-1 text-[12px] leading-[1.5] text-up" role="alert">
          스냅샷을 기록하지 못했어요 — {errorMessage(take.error)}
        </p>
      )}

      {items.length >= 2 && (
        <Card className="px-4 py-4">
          <SnapshotTrendChart snapshotsDesc={items} display={CHART_COUNT} />
        </Card>
      )}

      {isError ? (
        <Card className="py-6 text-center text-[13px] text-up">
          스냅샷 목록을 불러오지 못했어요
        </Card>
      ) : items.length === 0 ? (
        <Card className="py-6 text-center text-[13px] text-muted">
          아직 기록한 스냅샷이 없어요
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {listItems.map((s) => (
            <li key={s.id}>
              <SnapshotListItem snapshot={s} />
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <Link
          href="/assets/snapshots"
          className="py-2 text-center text-[13px] font-medium text-muted active:text-ink"
        >
          더보기
        </Link>
      )}
    </section>
  );
}
