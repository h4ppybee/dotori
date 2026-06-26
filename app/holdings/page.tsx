"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { HoldingForm } from "@/components/holdings/HoldingForm";
import {
  listHoldings,
  listConnections,
  deleteHolding,
} from "@/lib/db/local-store";
import { useRefresh } from "@/lib/query/use-portfolio";
import type { Holding, Connection } from "@/lib/types";

// ─── 유틸 ────────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  return n.toLocaleString("ko-KR");
}

function formatPrice(price: number, currency: "KRW" | "USD"): string {
  if (currency === "KRW") {
    return `₩${formatNumber(price)}`;
  }
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── 종목 행 ─────────────────────────────────────────────────────────────────

interface HoldingRowProps {
  holding: Holding;
  onEdit: (h: Holding) => void;
  onDelete: (h: Holding) => void;
}

function HoldingRow({ holding, onEdit, onDelete }: HoldingRowProps) {
  return (
    <Card className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-[2px] min-w-0">
        <span className="text-[17px] font-semibold leading-[1.4] tracking-[-0.2px] text-ink truncate">
          {holding.name}
        </span>
        <span className="text-[13px] font-normal leading-[1.45] text-muted">
          {holding.symbol} · {holding.market}
        </span>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[13px] font-medium text-body-soft">
            {formatNumber(holding.quantity)}주
          </span>
          <span className="text-[13px] text-muted">|</span>
          <span className="text-[13px] font-medium text-body-soft">
            평균 {formatPrice(holding.avgBuyPrice, holding.currency)}
          </span>
          {holding.manualPrice != null && (
            <>
              <span className="text-[13px] text-muted">|</span>
              <span className="text-[13px] font-medium text-body-soft">
                현재 {formatPrice(holding.manualPrice, holding.currency)}
              </span>
            </>
          )}
          <span
            className="
              inline-flex items-center px-2 py-[2px]
              rounded-full text-[11px] font-semibold
              bg-surface-soft text-muted
            "
          >
            {holding.currency}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="text"
          onClick={() => onEdit(holding)}
          className="h-[36px] px-3 text-[14px]"
        >
          수정
        </Button>
        <Button
          variant="text"
          onClick={() => onDelete(holding)}
          className="h-[36px] px-3 text-[14px] text-up hover:bg-up-surface"
        >
          삭제
        </Button>
      </div>
    </Card>
  );
}

// ─── 빈 상태 ─────────────────────────────────────────────────────────────────

interface EmptyStateProps {
  onAdd: () => void;
}

function EmptyState({ onAdd }: EmptyStateProps) {
  return (
    <Card className="flex flex-col items-center text-center py-10 gap-4">
      <p className="text-[15px] font-normal leading-[1.6] text-body-soft max-w-[260px]">
        아직 직접 추가한 종목이 없어요. 종목을 추가해 보세요.
      </p>
      <Button variant="primary" onClick={onAdd} className="w-full max-w-[200px]">
        종목 추가하기
      </Button>
    </Card>
  );
}

// ─── 페이지 ──────────────────────────────────────────────────────────────────

export default function HoldingsPage() {
  const refresh = useRefresh();

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Holding | undefined>(undefined);

  const [deleteTarget, setDeleteTarget] = useState<Holding | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── 데이터 로드 ──────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const [allHoldings, allConnections] = await Promise.all([
      listHoldings(),
      listConnections(),
    ]);
    setHoldings(allHoldings.filter((h) => h.source === "MANUAL"));
    setConnections(allConnections);
    setLoading(false);
  }, []);

  useEffect(() => {
    // 마운트 시 초기 데이터 로드 — setState는 loadData() 내 비동기 resolve 후 호출됨
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData().catch(() => undefined);
  }, [loadData]);

  // ── 저장 후 처리 ──────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function handleSaved(_holding: Holding) {
    setFormOpen(false);
    setEditTarget(undefined);
    void loadData();
    try {
      refresh.mutate();
    } catch {
      // 갱신 실패 무시 — 로컬 데이터는 이미 저장됨
    }
  }

  function handleFormCancel() {
    setFormOpen(false);
    setEditTarget(undefined);
  }

  // ── 편집 ─────────────────────────────────────────────────────
  function openEdit(h: Holding) {
    setEditTarget(h);
    setFormOpen(true);
  }

  // ── 삭제 ─────────────────────────────────────────────────────
  function openDelete(h: Holding) {
    setDeleteTarget(h);
  }

  async function confirmDelete() {
    if (!deleteTarget) {
      return;
    }
    setDeleting(true);
    try {
      await deleteHolding(deleteTarget.id);
      setDeleteTarget(null);
      void loadData();
    } finally {
      setDeleting(false);
    }
  }

  // ── 연결별 그룹화 ─────────────────────────────────────────────
  const connectionMap = new Map(connections.map((c) => [c.id, c]));

  const grouped = new Map<string, { label: string; items: Holding[] }>();
  for (const h of holdings) {
    const label = connectionMap.get(h.connectionId)?.label ?? h.connectionId;
    if (!grouped.has(h.connectionId)) {
      grouped.set(h.connectionId, { label, items: [] });
    }
    grouped.get(h.connectionId)!.items.push(h);
  }

  // ── 렌더 ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <span className="text-[15px] text-muted">불러오는 중...</span>
      </div>
    );
  }

  const hasHoldings = holdings.length > 0;

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto w-full max-w-[480px] px-4 pb-24">
        {/* 헤더 */}
        <div className="py-6">
          <h1 className="text-[24px] font-bold leading-[1.35] tracking-[-0.3px] text-ink">
            직접 추가한 종목
          </h1>
        </div>

        {/* 빈 상태 */}
        {!hasHoldings && !formOpen && (
          <EmptyState
            onAdd={() => {
              setEditTarget(undefined);
              setFormOpen(true);
            }}
          />
        )}

        {/* 종목 목록 (연결별 섹션) */}
        {hasHoldings && (
          <div className="flex flex-col gap-6">
            {Array.from(grouped.values()).map(({ label, items }) => (
              <section key={label}>
                <h2 className="text-[17px] font-semibold leading-[1.4] tracking-[-0.2px] text-body-soft mb-2">
                  {label}
                </h2>
                <div className="flex flex-col gap-3">
                  {items.map((h) => (
                    <HoldingRow
                      key={h.id}
                      holding={h}
                      onEdit={openEdit}
                      onDelete={openDelete}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* 종목 추가/편집 폼 */}
        {formOpen && (
          <div className="mt-6">
            <Card>
              <h2 className="text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink mb-5">
                {editTarget != null ? "종목 수정" : "종목 추가"}
              </h2>
              <HoldingForm
                initial={editTarget}
                onSave={handleSaved}
                onCancel={handleFormCancel}
              />
            </Card>
          </div>
        )}

        {/* 종목 추가 버튼 (폼이 닫혀 있을 때만 표시) */}
        {!formOpen && (
          <div className="mt-6">
            <Button
              variant="primary"
              onClick={() => {
                setEditTarget(undefined);
                setFormOpen(true);
              }}
              className="w-full"
            >
              종목 추가하기
            </Button>
          </div>
        )}
      </div>

      {/* 삭제 확인 다이얼로그 */}
      <Dialog
        open={deleteTarget != null}
        title="이 종목을 삭제할까요?"
        onClose={() => {
          if (!deleting) {
            setDeleteTarget(null);
          }
        }}
        actionLabel={deleting ? "삭제 중..." : "삭제하기"}
        onAction={confirmDelete}
        actionVariant="primary"
      >
        삭제하면 되돌릴 수 없어요.
      </Dialog>
    </div>
  );
}
