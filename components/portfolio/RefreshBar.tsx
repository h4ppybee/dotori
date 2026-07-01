"use client";

import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import type { RefreshFailure } from "@/lib/sync/refresh";

interface RefreshBarProps {
  onRefresh: () => void;
  pending: boolean;
  lastRefreshAt: number | null;
  /** USD→KRW 환율 (있으면 달러 시세 표시). */
  usdKrwRate?: number;
  /** 마지막 갱신에서 동기화에 실패한 항목들 (있으면 경고 배너 + 상세 표시). */
  failures?: RefreshFailure[];
}

/** epoch(ms)를 HH:MM 으로 포맷. */
function formatTime(t: number): string {
  const d = new Date(t);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** 환율을 소수점 둘째 자리까지 포맷. */
function formatRate(rate: number): string {
  return rate.toLocaleString("ko-KR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * 갱신 바. 새로고침 버튼 + 마지막 갱신 시각 + (실패 시) 경고 배너.
 * 프레젠테이셔널 컴포넌트 — 훅 연결은 페이지가 담당.
 */
export function RefreshBar({
  onRefresh,
  pending,
  lastRefreshAt,
  usdKrwRate,
  failures,
}: RefreshBarProps) {
  const hasFailures = failures != null && failures.length > 0;
  const lastLabel = lastRefreshAt != null ? formatTime(lastRefreshAt) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-[2px] min-w-0">
          <span className="text-[13px] font-normal leading-[1.45] text-muted">
            {lastLabel != null
              ? `마지막 갱신 ${lastLabel}`
              : "아직 갱신하지 않았어요"}
          </span>
          {usdKrwRate != null && (
            <span className="text-[13px] font-medium leading-[1.45] text-body-soft tabular-nums">
              $1 = ₩{formatRate(usdKrwRate)}
            </span>
          )}
        </div>
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
        <div className="flex flex-col gap-2">
          <Banner
            message={`동기화에 실패한 항목이 ${failures!.length}개 있어요.${
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
          <ul className="flex flex-col gap-1 px-1">
            {failures!.map((f, i) => (
              <li
                key={`${f.connectionId}-${i}`}
                className="text-[13px] leading-[1.45] tracking-[-0.1px]"
                style={{ color: "#9A6700" }}
              >
                <span className="font-semibold">{f.label}</span>
                <span className="opacity-80"> · {f.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
