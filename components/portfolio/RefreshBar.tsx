"use client";

import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";

interface RefreshBarProps {
  onRefresh: () => void;
  pending: boolean;
  lastRefreshAt: number | null;
  /** 마지막 갱신에서 동기화에 실패한 항목들 (있으면 경고 배너 표시). */
  failures?: unknown[];
}

/** epoch(ms)를 HH:MM 으로 포맷. */
function formatTime(t: number): string {
  const d = new Date(t);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * 갱신 바. 새로고침 버튼 + 마지막 갱신 시각 + (실패 시) 경고 배너.
 * 프레젠테이셔널 컴포넌트 — 훅 연결은 페이지가 담당.
 */
export function RefreshBar({ onRefresh, pending, lastRefreshAt, failures }: RefreshBarProps) {
  const hasFailures = failures != null && failures.length > 0;
  const lastLabel = lastRefreshAt != null ? formatTime(lastRefreshAt) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-normal leading-[1.45] text-muted">
          {lastLabel != null
            ? `마지막 갱신 ${lastLabel}`
            : "아직 갱신하지 않았어요"}
        </span>
        <Button
          variant="secondary"
          onClick={onRefresh}
          disabled={pending}
          className="h-[40px] px-4 text-[15px]"
        >
          {pending ? "새로고침 중…" : "새로고침"}
        </Button>
      </div>

      {hasFailures && (
        <Banner
          message={`토스 동기화에 실패한 항목이 ${failures!.length}개 있어요.${
            lastLabel != null ? ` 마지막 갱신 ${lastLabel}` : ""
          } · 다시 시도하면 불러올 수 있어요.`}
          action={
            <button
              type="button"
              onClick={onRefresh}
              disabled={pending}
              className="text-[15px] font-semibold underline underline-offset-2 disabled:opacity-60"
              style={{ color: "#9A6700" }}
            >
              다시 시도하기
            </button>
          }
        />
      )}
    </div>
  );
}
