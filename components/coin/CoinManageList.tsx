"use client";

import { useState } from "react";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import { ReturnBadge } from "@/components/ui/ReturnBadge";
import { CoinAccountDialog } from "@/components/coin/CoinAccountDialog";
import { formatKrw } from "@/lib/format";
import { useCoinMutations } from "@/lib/query/use-coin";
import type { CoinVM, CoinHoldingView } from "@/lib/coin/coin-service";
import type { CoinHolding } from "@/lib/types";

interface CoinManageListProps {
  vm: CoinVM;
}

function parseNum(s: string): number | undefined {
  const cleaned = s.replace(/,/g, "").trim();
  if (cleaned === "") {
    return undefined;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function metaLine(h: CoinHoldingView): string {
  const parts: string[] = [];
  if (h.exchange) {
    parts.push(h.exchange);
  }
  parts.push(`수량 ${h.quantity.toLocaleString("ko-KR")}`);
  return parts.join(" · ");
}

/** 업비트 등 외부 연동에서 자동으로 가져온 행. 편집·삭제 잠금 + 출처 배지. */
function SourceBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-surface-strong px-2 py-0.5 text-[12px] font-semibold leading-[1.4] text-body-soft">
      {label}
    </span>
  );
}

/**
 * 코인 관리 리스트(평탄, 카테고리 없음). 보기 모드: 행 탭 → 단건 편집.
 * 편집 모드: 현재가 인라인 일괄 수정 + X 삭제 + 항목 추가. 저장 시 일괄 반영.
 */
export function CoinManageList({ vm }: CoinManageListProps) {
  const { upsert, remove, bulkUpdate } = useCoinMutations();

  const [editing, setEditing] = useState(false);
  const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{ open: boolean; initial: CoinHolding | null }>({ open: false, initial: null });

  const visible = vm.holdings.filter((h) => !deletedIds.has(h.id));

  function startEdit() {
    const draft: Record<string, string> = {};
    for (const h of vm.holdings) {
      if (h.source === "AUTO") {
        continue;
      }
      draft[h.id] = String(h.currentPrice);
    }
    setDraftPrices(draft);
    setDeletedIds(new Set());
    setEditing(true);
  }
  function cancelEdit() {
    setEditing(false);
    setDraftPrices({});
    setDeletedIds(new Set());
  }
  async function saveEdit() {
    const changed: CoinHolding[] = [];
    for (const h of vm.holdings) {
      if (h.source === "AUTO") {
        continue;
      }
      if (deletedIds.has(h.id)) {
        continue;
      }
      const next = parseNum(draftPrices[h.id] ?? "");
      if (next != null && next !== h.currentPrice) {
        const { costKrw: _c, valueKrw: _v, pnlKrw: _p, returnPct: _r, pct: _pct, ...base } = h;
        void _c; void _v; void _p; void _r; void _pct;
        changed.push({ ...base, currentPrice: next });
      }
    }
    if (changed.length > 0) {
      await bulkUpdate.mutateAsync(changed);
    }
    for (const id of deletedIds) {
      await remove.mutateAsync(id);
    }
    cancelEdit();
  }

  async function handleDialogSave(input: Partial<CoinHolding> & { id?: string }) {
    await upsert.mutateAsync(input);
    setDialog({ open: false, initial: null });
  }
  async function handleDialogDelete(id: string) {
    await remove.mutateAsync(id);
    setDialog({ open: false, initial: null });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        {!editing ? (
          <button type="button" onClick={startEdit} className="text-[15px] font-semibold text-primary hover:underline">편집</button>
        ) : (
          <div className="flex items-center gap-3">
            <button type="button" onClick={cancelEdit} className="text-[15px] font-semibold text-muted">취소</button>
            <button type="button" onClick={() => void saveEdit()} className="text-[15px] font-semibold text-primary">저장</button>
          </div>
        )}
      </div>

      <section className="overflow-hidden rounded-[20px] bg-surface-card shadow-card">
        {visible.length === 0 ? (
          <p className="py-12 text-center text-[15px] text-muted">표시할 코인이 없어요.</p>
        ) : (
          <ul className="flex flex-col">
            {visible.map((h, i) => {
              const isAuto = h.source === "AUTO";
              return (
              <li key={h.id} className={i === 0 ? "" : "border-t border-hairline"}>
                {editing ? (
                  isAuto ? (
                    <div className="flex items-center gap-3 px-5 py-3">
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[15px] font-semibold text-ink">{h.name}</span>
                          <SourceBadge label={h.exchange ?? "업비트"} />
                        </span>
                        <span className="truncate text-[12px] text-muted">{h.exchange ?? "업비트"}에서 자동으로 가져와요</span>
                      </span>
                      <span className="shrink-0 text-[15px] font-semibold tabular-nums text-muted">{formatKrw(h.currentPrice)}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 px-5 py-3">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[15px] font-semibold text-ink">{h.name}</span>
                        <span className="truncate text-[12px] text-muted">현재가</span>
                      </span>
                      <input
                        inputMode="decimal"
                        value={draftPrices[h.id] ?? String(h.currentPrice)}
                        onChange={(e) => setDraftPrices((p) => ({ ...p, [h.id]: e.target.value }))}
                        className="w-[130px] rounded-[10px] border border-hairline bg-surface-soft px-3 py-2 text-right text-[15px] font-semibold tabular-nums text-ink outline-none focus:border-[1.5px] focus:border-primary"
                        aria-label={`${h.name} 현재가`}
                      />
                      <button type="button" onClick={() => setDeletedIds((prev) => new Set(prev).add(h.id))} aria-label={`${h.name} 삭제`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-soft">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  )
                ) : isAuto ? (
                  <div className="flex w-full items-center gap-3 px-5 py-3 text-left">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[15px] font-semibold text-ink">{h.name}</span>
                        <SourceBadge label={h.exchange ?? "업비트"} />
                      </span>
                      <span className="truncate text-[12px] text-muted">수량 {h.quantity.toLocaleString("ko-KR")} · {h.exchange ?? "업비트"}에서 자동으로 가져와요</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5">
                      <PrivacyAmount revealLabel={`${h.name} 금액 보기`}>
                        <span className="text-[15px] font-semibold tabular-nums text-ink">{formatKrw(h.valueKrw)}</span>
                      </PrivacyAmount>
                      <ReturnBadge value={h.returnPct} />
                    </span>
                  </div>
                ) : (
                  <button type="button" onClick={() => setDialog({ open: true, initial: h })} className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-soft">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px] font-semibold text-ink">{h.name}</span>
                      <span className="truncate text-[12px] text-muted">{metaLine(h)}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5">
                      <PrivacyAmount revealLabel={`${h.name} 금액 보기`}>
                        <span className="text-[15px] font-semibold tabular-nums text-ink">{formatKrw(h.valueKrw)}</span>
                      </PrivacyAmount>
                      <ReturnBadge value={h.returnPct} />
                    </span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-muted-soft">
                      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
              </li>
              );
            })}
          </ul>
        )}

        <div className="border-t border-hairline">
          <button type="button" onClick={() => setDialog({ open: true, initial: null })} className="flex w-full items-center gap-2 px-5 py-3 text-[15px] font-semibold text-primary transition-colors hover:bg-surface-soft">
            <span className="text-[18px] leading-none">+</span> 코인 추가
          </button>
        </div>
      </section>

      <CoinAccountDialog
        key={`${dialog.open ? "o" : "c"}-${dialog.initial?.id ?? "new"}`}
        open={dialog.open}
        initial={dialog.initial}
        onClose={() => setDialog({ open: false, initial: null })}
        onSave={handleDialogSave}
        onDelete={handleDialogDelete}
      />
    </div>
  );
}
