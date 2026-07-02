import Link from "next/link";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import { formatKrw, formatDateTime } from "@/lib/format";
import type { AssetSnapshot } from "@/lib/types";

/** 스냅샷 목록 행: 시점 + 순자산. 클릭 시 상세로 이동. */
export function SnapshotListItem({ snapshot }: { snapshot: AssetSnapshot }) {
  return (
    <Link
      href={`/assets/snapshots/${snapshot.id}`}
      className="flex items-center gap-4 rounded-[20px] bg-surface-card p-5 shadow-card transition-colors hover:bg-surface-soft active:bg-surface-strong"
    >
      <span className="flex-1 text-[13px] font-normal leading-[1.4] text-muted tabular-nums">
        {formatDateTime(snapshot.createdAt)}
      </span>
      <PrivacyAmount revealLabel="스냅샷 순자산 보기">
        <span className="text-[15px] font-bold leading-[1.3] tabular-nums text-ink">
          {formatKrw(snapshot.netWorthKrw)}
        </span>
      </PrivacyAmount>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-muted-soft">
        <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
