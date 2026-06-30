"use client";

import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import { ReturnBadge } from "@/components/ui/ReturnBadge";
import { PensionAccountDialog } from "@/components/pension/PensionAccountDialog";
import { formatKrw } from "@/lib/format";
import { PENSION_CATEGORIES } from "@/lib/pension/pension-service";
import { usePensionMutations } from "@/lib/query/use-pension";
import type { PensionVM, PensionGroup, PensionAccountView } from "@/lib/pension/pension-service";
import type { PensionAccount, PensionCategory } from "@/lib/types";

interface PensionManageListProps {
  vm: PensionVM;
  initialCat?: PensionCategory | "ALL";
}

type Filter = PensionCategory | "ALL";

function parseNum(s: string): number | undefined {
  const cleaned = s.replace(/,/g, "").trim();
  if (cleaned === "") {
    return undefined;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

/** 행 보조 라인: 회사 · 유형 · 수량 N. */
function metaLine(a: PensionAccountView): string {
  const parts: string[] = [];
  if (a.company) {
    parts.push(a.company);
  }
  if (a.fundType) {
    parts.push(a.fundType);
  }
  parts.push(`수량 ${a.quantity.toLocaleString("ko-KR")}`);
  return parts.join(" · ");
}

/**
 * 연금 관리 리스트. 카테고리 필터 + 접이식 섹션 + 행.
 * 보기 모드: 행 탭 → 단건 편집 다이얼로그.
 * 편집 모드: 현재가 인라인 일괄 수정 + X 삭제 + 항목 추가. 저장 시 일괄 반영.
 */
export function PensionManageList({ vm, initialCat = "ALL" }: PensionManageListProps) {
  const { upsert, remove, bulkUpdate } = usePensionMutations();

  const [filter, setFilter] = useState<Filter>(initialCat);
  const [collapsed, setCollapsed] = useState<Set<PensionCategory>>(new Set());
  const [editing, setEditing] = useState(false);
  const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{
    open: boolean;
    initial: PensionAccount | null;
    presetCategory?: PensionCategory;
  }>({ open: false, initial: null });

  const groups = filter === "ALL" ? vm.groups : vm.groups.filter((g) => g.category === filter);

  function startEdit() {
    const draft: Record<string, string> = {};
    for (const g of vm.groups) {
      for (const a of g.accounts) {
        draft[a.id] = String(a.currentPrice);
      }
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
    const changed: PensionAccount[] = [];
    for (const g of vm.groups) {
      for (const a of g.accounts) {
        if (deletedIds.has(a.id)) {
          continue;
        }
        const next = parseNum(draftPrices[a.id] ?? "");
        if (next != null && next !== a.currentPrice) {
          const { costKrw: _c, valueKrw: _v, pnlKrw: _p, returnPct: _r, ...base } = a;
          void _c; void _v; void _p; void _r;
          changed.push({ ...base, currentPrice: next });
        }
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

  function toggleCollapse(cat: PensionCategory) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }

  async function handleDialogSave(input: Partial<PensionAccount> & { id?: string }) {
    await upsert.mutateAsync(input);
    setDialog({ open: false, initial: null });
  }
  async function handleDialogDelete(id: string) {
    await remove.mutateAsync(id);
    setDialog({ open: false, initial: null });
  }

  const filters: { key: Filter; label: string }[] = [
    { key: "ALL", label: "전체" },
    ...PENSION_CATEGORIES.map((c) => ({ key: c.key as Filter, label: c.label })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1.5 overflow-x-auto">
          {filters.map((f) => (
            <Chip key={f.key} selected={filter === f.key} onClick={() => setFilter(f.key)} className="shrink-0">
              {f.label}
            </Chip>
          ))}
        </div>
        {!editing ? (
          <button type="button" onClick={startEdit} className="shrink-0 text-[15px] font-semibold text-primary hover:underline">
            편집
          </button>
        ) : (
          <div className="flex shrink-0 items-center gap-3">
            <button type="button" onClick={cancelEdit} className="text-[15px] font-semibold text-muted">취소</button>
            <button type="button" onClick={() => void saveEdit()} className="text-[15px] font-semibold text-primary">저장</button>
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="py-12 text-center text-[15px] text-muted">표시할 연금이 없어요.</p>
      ) : (
        groups.map((g) => (
          <PensionSection
            key={g.category}
            group={g}
            editing={editing}
            collapsed={collapsed.has(g.category)}
            deletedIds={deletedIds}
            draftPrices={draftPrices}
            onToggleCollapse={() => toggleCollapse(g.category)}
            onPriceChange={(id, v) => setDraftPrices((p) => ({ ...p, [id]: v }))}
            onDelete={(id) => setDeletedIds((prev) => new Set(prev).add(id))}
            onAdd={() => setDialog({ open: true, initial: null, presetCategory: g.category })}
            onRowTap={(a) => setDialog({ open: true, initial: a, presetCategory: a.category })}
          />
        ))
      )}

      <PensionAccountDialog
        key={`${dialog.open ? "o" : "c"}-${dialog.initial?.id ?? dialog.presetCategory ?? "new"}`}
        open={dialog.open}
        initial={dialog.initial}
        presetCategory={dialog.presetCategory}
        onClose={() => setDialog({ open: false, initial: null })}
        onSave={handleDialogSave}
        onDelete={handleDialogDelete}
      />
    </div>
  );
}

interface PensionSectionProps {
  group: PensionGroup;
  editing: boolean;
  collapsed: boolean;
  deletedIds: Set<string>;
  draftPrices: Record<string, string>;
  onToggleCollapse: () => void;
  onPriceChange: (id: string, value: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onRowTap: (account: PensionAccount) => void;
}

function PensionSection({
  group, editing, collapsed, deletedIds, draftPrices,
  onToggleCollapse, onPriceChange, onDelete, onAdd, onRowTap,
}: PensionSectionProps) {
  const visible = group.accounts.filter((a) => !deletedIds.has(a.id));

  return (
    <section className="overflow-hidden rounded-[20px] bg-surface-card shadow-card">
      <button type="button" onClick={onToggleCollapse} className="flex w-full items-center justify-between px-5 py-4 text-left">
        <span className="text-[15px] font-bold leading-[1.4] text-ink">
          {group.label}
          <span className="ml-1.5 text-[13px] font-normal text-muted">{visible.length}</span>
        </span>
        <span className="flex items-center gap-2">
          <PrivacyAmount revealLabel={`${group.label} 합계 보기`}>
            <span className="text-[15px] font-semibold tabular-nums text-ink">{formatKrw(group.valueKrw)}</span>
          </PrivacyAmount>
          <ReturnBadge value={group.returnPct} />
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`text-muted-soft transition-transform ${collapsed ? "" : "rotate-180"}`}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {!collapsed && (
        <ul className="flex flex-col">
          {visible.map((a) => (
            <li key={a.id} className="border-t border-hairline">
              {editing ? (
                <div className="flex items-center gap-3 px-5 py-3">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-semibold text-ink">{a.name}</span>
                    <span className="truncate text-[12px] text-muted">현재가</span>
                  </span>
                  <input
                    inputMode="decimal"
                    value={draftPrices[a.id] ?? String(a.currentPrice)}
                    onChange={(e) => onPriceChange(a.id, e.target.value)}
                    className="w-[120px] rounded-[10px] border border-hairline bg-surface-soft px-3 py-2 text-right text-[15px] font-semibold tabular-nums text-ink outline-none focus:border-[1.5px] focus:border-primary"
                    aria-label={`${a.name} 현재가`}
                  />
                  <button type="button" onClick={() => onDelete(a.id)} aria-label={`${a.name} 삭제`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-soft">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => onRowTap(a)} className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-soft">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-semibold text-ink">{a.name}</span>
                    <span className="truncate text-[12px] text-muted">{metaLine(a)}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    <PrivacyAmount revealLabel={`${a.name} 금액 보기`}>
                      <span className="text-[15px] font-semibold tabular-nums text-ink">{formatKrw(a.valueKrw)}</span>
                    </PrivacyAmount>
                    <ReturnBadge value={a.returnPct} />
                  </span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-muted-soft">
                    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </li>
          ))}

          <li className="border-t border-hairline">
            <button type="button" onClick={onAdd} className="flex w-full items-center gap-2 px-5 py-3 text-[15px] font-semibold text-primary transition-colors hover:bg-surface-soft">
              <span className="text-[18px] leading-none">+</span> 항목 추가
            </button>
          </li>
        </ul>
      )}
    </section>
  );
}
