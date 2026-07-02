"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { SnapshotListItem } from "@/components/snapshot/SnapshotListItem";
import { useAssetSnapshots } from "@/lib/query/use-asset-snapshots";

/** 스냅샷 전체 목록 — 자산 탭 스냅샷 섹션 "더보기"에서 진입. */
export default function SnapshotListPage() {
  const { data: snapshots, isLoading } = useAssetSnapshots();
  const router = useRouter();
  const items = snapshots ?? [];

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto w-full max-w-[480px] px-4 pb-28">
        {/* 헤더 */}
        <div className="flex items-center h-14 -ml-2">
          <button
            type="button"
            onClick={() => router.push("/assets")}
            aria-label="뒤로"
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-surface-soft transition-colors text-[22px] leading-none"
          >
            ‹
          </button>
          <h1 className="text-[17px] font-bold leading-[1.4] tracking-[-0.2px] text-ink">스냅샷</h1>
        </div>

        {isLoading ? (
          <p className="py-24 text-center text-[15px] text-muted">불러오는 중이에요…</p>
        ) : items.length === 0 ? (
          <Card className="py-10 text-center text-[15px] text-muted">
            아직 기록한 스냅샷이 없어요
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((s) => (
              <li key={s.id}>
                <SnapshotListItem snapshot={s} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
