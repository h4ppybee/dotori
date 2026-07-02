"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import { PnlText } from "@/components/ui/PnlText";
import { Dialog } from "@/components/ui/Dialog";
import { useAssetSnapshot, useSnapshotMutations } from "@/lib/query/use-asset-snapshots";
import { formatKrw, formatDateTime } from "@/lib/format";
import type { AssetSnapshotPnlSection, AssetSnapshotAmountSection } from "@/lib/types";

/** 손익 자산군(주식·연금·코인) 표 섹션. rows가 없으면 렌더하지 않는다. */
function PnlTable({ title, section }: { title: string; section: AssetSnapshotPnlSection }) {
  if (section.rows.length === 0) {
    return null;
  }
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold leading-[1.4] text-ink">{title}</h3>
        <PnlText amountKrw={section.totalPnlKrw} returnPct={section.returnPct} className="text-[13px] font-semibold" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-[12px] tabular-nums">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1 pr-2 font-normal">종목명</th>
              <th className="py-1 pr-2 font-normal text-right">수량</th>
              <th className="py-1 pr-2 font-normal text-right">매수금액</th>
              <th className="py-1 pr-2 font-normal text-right">평가금액</th>
              <th className="py-1 font-normal text-right">손익</th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map((r, i) => (
              <tr key={`${r.name}-${i}`} className="border-t border-hairline">
                <td className="py-2 pr-2 font-medium text-ink">{r.name}</td>
                <td className="py-2 pr-2 text-right text-body">{r.quantity.toLocaleString("ko-KR")}</td>
                <td className="py-2 pr-2 text-right text-body">{formatKrw(r.costKrw)}</td>
                <td className="py-2 pr-2 text-right text-body">{formatKrw(r.valueKrw)}</td>
                <td className="py-2 text-right">
                  <PnlText amountKrw={r.pnlKrw} returnPct={r.returnPct} className="text-[12px]" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** 금액 자산군(저축·부채) 표 섹션. rows가 없으면 렌더하지 않는다. */
function AmountTable({ title, section }: { title: string; section: AssetSnapshotAmountSection }) {
  if (section.rows.length === 0) {
    return null;
  }
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold leading-[1.4] text-ink">{title}</h3>
        <span className="text-[13px] font-semibold tabular-nums text-ink">{formatKrw(section.totalKrw)}</span>
      </div>
      <ul className="flex flex-col">
        {section.rows.map((r, i) => (
          <li key={`${r.name}-${i}`} className="flex items-center justify-between border-t border-hairline py-2 text-[13px]">
            <span className="text-body">{r.name}</span>
            <span className="tabular-nums text-ink">{formatKrw(r.amountKrw)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** 스냅샷 상세 — 자산군별 표 + 삭제. 목록 화면 → 행 탭으로 진입. */
export default function SnapshotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: snapshot, isLoading } = useAssetSnapshot(id);
  const { remove } = useSnapshotMutations();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleConfirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await remove.mutateAsync(id);
      router.replace("/assets/snapshots");
    } catch {
      setDeleteError("삭제하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto w-full max-w-[480px] px-4 pb-28 flex flex-col gap-4">
        {/* 헤더 */}
        <div className="flex items-center h-14 -ml-2">
          <button
            type="button"
            onClick={() => router.push("/assets/snapshots")}
            aria-label="뒤로"
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-surface-soft transition-colors text-[22px] leading-none"
          >
            ‹
          </button>
          <h1 className="text-[17px] font-bold leading-[1.4] tracking-[-0.2px] text-ink">스냅샷 상세</h1>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <span className="text-[15px] text-muted">불러오는 중이에요…</span>
          </div>
        )}

        {!isLoading && snapshot == null && (
          <Card className="flex flex-col items-center text-center gap-4 py-12">
            <p className="text-[15px] leading-[1.6] text-body-soft">
              스냅샷을 찾을 수 없어요.
            </p>
            <Link
              href="/assets/snapshots"
              className="text-[15px] font-semibold text-primary underline underline-offset-2"
            >
              목록으로 돌아가기
            </Link>
          </Card>
        )}

        {!isLoading && snapshot != null && (
          <>
            <Card variant="hero" className="flex flex-col gap-2">
              <span className="text-[13px] text-muted tabular-nums">{formatDateTime(snapshot.createdAt)}</span>
              <PrivacyAmount revealLabel="스냅샷 순자산 보기">
                <span className="text-[28px] font-bold leading-[1.2] tracking-[-0.5px] tabular-nums text-ink">
                  {formatKrw(snapshot.netWorthKrw)}
                </span>
              </PrivacyAmount>
              <span className="text-[13px] text-muted">
                자산 {formatKrw(snapshot.totalAssetsKrw)} · 부채 {formatKrw(snapshot.totalDebtKrw)}
              </span>
            </Card>

            <PnlTable title="주식" section={snapshot.stocks} />
            <PnlTable title="연금" section={snapshot.pension} />
            <PnlTable title="코인" section={snapshot.coin} />
            <AmountTable title="저축/현금성" section={snapshot.savings} />
            <AmountTable title="부채" section={snapshot.debt} />

            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setConfirmingDelete(true);
              }}
              className="self-center mt-2 px-4 py-2 text-[15px] font-semibold text-up hover:underline underline-offset-2"
            >
              이 스냅샷 삭제하기
            </button>
          </>
        )}
      </div>

      <Dialog
        open={confirmingDelete}
        title="이 스냅샷을 삭제할까요?"
        onClose={() => {
          if (!deleting) {
            setConfirmingDelete(false);
          }
        }}
        actionLabel={deleting ? "삭제 중..." : "삭제하기"}
        onAction={() => void handleConfirmDelete()}
        actionVariant="primary"
      >
        삭제하면 되돌릴 수 없어요.
        {deleteError != null && (
          <p className="mt-2 text-[13px] leading-[1.45] text-up">{deleteError}</p>
        )}
      </Dialog>
    </main>
  );
}
