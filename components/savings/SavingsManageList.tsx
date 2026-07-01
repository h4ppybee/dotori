"use client";

import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import { SavingsAccountDialog } from "@/components/savings/SavingsAccountDialog";
import { formatKrw } from "@/lib/format";
import { formatAccountAmount, accountMetaLine } from "@/lib/savings/savings-format";
import { SAVINGS_CATEGORIES } from "@/lib/savings/savings-service";
import { useSavingsMutations } from "@/lib/query/use-savings";
import type { SavingsVM, SavingsGroup } from "@/lib/savings/savings-service";
import type { SavingsAccount, SavingsCategory } from "@/lib/types";

interface SavingsManageListProps {
  vm: SavingsVM;
  initialCat?: SavingsCategory | "ALL";
}

type Filter = SavingsCategory | "ALL";

function parseNum(s: string): number | undefined {
  const cleaned = s.replace(/,/g, "").trim();
  if (cleaned === "") {
    return undefined;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * 저축 관리 리스트. 카테고리 필터 + 접이식 섹션 + 행.
 * 보기 모드: 행 탭 → 단건 편집 다이얼로그.
 * 편집 모드: 금액 인라인 일괄 수정 + X 삭제 + 항목 추가. 저장 시 일괄 반영.
 */
export function SavingsManageList({ vm, initialCat = "ALL" }: SavingsManageListProps) {
  const { upsert, remove, bulkUpdate } = useSavingsMutations();

  const [filter, setFilter] = useState<Filter>(initialCat);
  const [collapsed, setCollapsed] = useState<Set<SavingsCategory>>(new Set());
  const [editing, setEditing] = useState(false);

  // 편집 모드 임시 상태.
  const [draftAmounts, setDraftAmounts] = useState<Record<string, string>>({});
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  // 다이얼로그 상태.
  const [dialog, setDialog] = useState<{
    open: boolean;
    initial: SavingsAccount | null;
    presetCategory?: SavingsCategory;
  }>({ open: false, initial: null });

  const groups = filter === "ALL" ? vm.groups : vm.groups.filter((g) => g.category === filter);

  function startEdit() {
    const draft: Record<string, string> = {};
    for (const g of vm.groups) {
      for (const a of g.accounts) {
        if (a.source === "AUTO") {
          continue;
        }
        draft[a.id] = String(a.amount);
      }
    }
    setDraftAmounts(draft);
    setDeletedIds(new Set());
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDraftAmounts({});
    setDeletedIds(new Set());
  }

  async function saveEdit() {
    // 변경된 금액만 모아 일괄 저장.
    const changed: SavingsAccount[] = [];
    for (const g of vm.groups) {
      for (const a of g.accounts) {
        if (a.source === "AUTO") {
          continue;
        }
        if (deletedIds.has(a.id)) {
          continue;
        }
        const next = parseNum(draftAmounts[a.id] ?? "");
        if (next != null && next !== a.amount) {
          // amountKrw 등 파생값을 제거하고 원본 계좌 형태로 복원.
          const { amountKrw: _drop, ...base } = a;
          void _drop;
          changed.push({ ...base, amount: next });
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

  function toggleCollapse(cat: SavingsCategory) {
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

  function markDelete(id: string) {
    setDeletedIds((prev) => new Set(prev).add(id));
  }

  async function handleDialogSave(input: Partial<SavingsAccount> & { id?: string }) {
    await upsert.mutateAsync(input);
    setDialog({ open: false, initial: null });
  }

  async function handleDialogDelete(id: string) {
    await remove.mutateAsync(id);
    setDialog({ open: false, initial: null });
  }

  const filters: { key: Filter; label: string }[] = [
    { key: "ALL", label: "전체" },
    ...SAVINGS_CATEGORIES.map((c) => ({ key: c.key as Filter, label: c.label })),
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* 툴바: 필터 칩 + 편집 토글 */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1.5 overflow-x-auto">
          {filters.map((f) => (
            <Chip key={f.key} selected={filter === f.key} onClick={() => setFilter(f.key)} className="shrink-0">
              {f.label}
            </Chip>
          ))}
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={startEdit}
            className="shrink-0 text-[15px] font-semibold text-primary hover:underline"
          >
            편집
          </button>
        ) : (
          <div className="flex shrink-0 items-center gap-3">
            <button type="button" onClick={cancelEdit} className="text-[15px] font-semibold text-muted">
              취소
            </button>
            <button type="button" onClick={() => void saveEdit()} className="text-[15px] font-semibold text-primary">
              저장
            </button>
          </div>
        )}
      </div>

      {/* 섹션 */}
      {groups.length === 0 ? (
        <p className="py-12 text-center text-[15px] text-muted">표시할 계좌가 없어요.</p>
      ) : (
        groups.map((g) => (
          <SavingsSection
            key={g.category}
            group={g}
            editing={editing}
            collapsed={collapsed.has(g.category)}
            deletedIds={deletedIds}
            draftAmounts={draftAmounts}
            onToggleCollapse={() => toggleCollapse(g.category)}
            onAmountChange={(id, v) => setDraftAmounts((p) => ({ ...p, [id]: v }))}
            onDelete={markDelete}
            onAdd={() => setDialog({ open: true, initial: null, presetCategory: g.category })}
            onRowTap={(a) => setDialog({ open: true, initial: a, presetCategory: a.category })}
          />
        ))
      )}

      {/* 편집 모드가 아닐 때만 전역 추가 버튼은 페이지 쪽 CTA가 담당. 여기선 섹션별 추가. */}

      <SavingsAccountDialog
        key={`${dialog.open ? "o" : "c"}-${dialog.initial?.id ?? dialog.presetCategory ?? "new"}`}
        open={dialog.open}
        initial={dialog.initial}
        presetCategory={dialog.presetCategory}
        usdKrwRate={vm.usdKrwRate}
        onClose={() => setDialog({ open: false, initial: null })}
        onSave={handleDialogSave}
        onDelete={handleDialogDelete}
      />
    </div>
  );
}

/** 업비트 등 외부 연동에서 자동으로 가져온 행. 편집·삭제 잠금 + 출처 배지. */
function SourceBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-surface-strong px-2 py-0.5 text-[12px] font-semibold leading-[1.4] text-body-soft">
      {label}
    </span>
  );
}

interface SavingsSectionProps {
  group: SavingsGroup;
  editing: boolean;
  collapsed: boolean;
  deletedIds: Set<string>;
  draftAmounts: Record<string, string>;
  onToggleCollapse: () => void;
  onAmountChange: (id: string, value: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onRowTap: (account: SavingsAccount) => void;
}

function SavingsSection({
  group,
  editing,
  collapsed,
  deletedIds,
  draftAmounts,
  onToggleCollapse,
  onAmountChange,
  onDelete,
  onAdd,
  onRowTap,
}: SavingsSectionProps) {
  const visible = group.accounts.filter((a) => !deletedIds.has(a.id));

  return (
    <section className="overflow-hidden rounded-[20px] bg-surface-card shadow-card">
      {/* 섹션 헤더 */}
      <button
        type="button"
        onClick={onToggleCollapse}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="text-[15px] font-bold leading-[1.4] text-ink">
          {group.label}
          <span className="ml-1.5 text-[13px] font-normal text-muted">{visible.length}</span>
        </span>
        <span className="flex items-center gap-2">
          <PrivacyAmount revealLabel={`${group.label} 합계 보기`}>
            <span className="text-[15px] font-semibold tabular-nums text-ink">
              {formatKrw(group.amountKrw)}
            </span>
          </PrivacyAmount>
          <svg
            width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"
            className={`text-muted-soft transition-transform ${collapsed ? "" : "rotate-180"}`}
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {!collapsed && (
        <ul className="flex flex-col">
          {visible.map((a) => {
            const isAuto = a.source === "AUTO";
            return (
            <li key={a.id} className="border-t border-hairline">
              {editing ? (
                isAuto ? (
                  <div className="flex items-center gap-3 px-5 py-3">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[15px] font-semibold text-ink">{a.name}</span>
                        <SourceBadge label={a.bank ?? "업비트"} />
                      </span>
                      <span className="truncate text-[12px] text-muted">{a.bank ?? "업비트"}에서 자동으로 가져와요</span>
                    </span>
                    <span className="shrink-0 text-[15px] font-semibold tabular-nums text-muted">{formatAccountAmount(a)}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-5 py-3">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px] font-semibold text-ink">{a.name}</span>
                      {a.bank && <span className="truncate text-[12px] text-muted">{a.bank}</span>}
                    </span>
                    <span className="flex items-center gap-1">
                      {a.currency === "USD" && <span className="text-[13px] text-muted">$</span>}
                      <input
                        inputMode="decimal"
                        value={draftAmounts[a.id] ?? String(a.amount)}
                        onChange={(e) => onAmountChange(a.id, e.target.value)}
                        className="w-[120px] rounded-[10px] border border-hairline bg-surface-soft px-3 py-2 text-right text-[15px] font-semibold tabular-nums text-ink outline-none focus:border-[1.5px] focus:border-primary"
                        aria-label={`${a.name} 금액`}
                      />
                    </span>
                    <button
                      type="button"
                      onClick={() => onDelete(a.id)}
                      aria-label={`${a.name} 삭제`}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-soft"
                    >
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
                      <span className="truncate text-[15px] font-semibold text-ink">{a.name}</span>
                      <SourceBadge label={a.bank ?? "업비트"} />
                    </span>
                    <span className="truncate text-[12px] text-muted">{a.bank ?? "업비트"}에서 자동으로 가져와요</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <PrivacyAmount revealLabel={`${a.name} 금액 보기`}>
                      <span className="text-[15px] font-semibold tabular-nums text-ink">
                        {formatAccountAmount(a)}
                      </span>
                    </PrivacyAmount>
                    {a.currency === "USD" && a.amountKrw > 0 && (
                      <span className="text-[12px] text-muted tabular-nums">≈ {formatKrw(a.amountKrw)}</span>
                    )}
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onRowTap(a)}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-soft"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-semibold text-ink">{a.name}</span>
                    {accountMetaLine(a) && (
                      <span className="truncate text-[12px] text-muted">{accountMetaLine(a)}</span>
                    )}
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <PrivacyAmount revealLabel={`${a.name} 금액 보기`}>
                      <span className="text-[15px] font-semibold tabular-nums text-ink">
                        {formatAccountAmount(a)}
                      </span>
                    </PrivacyAmount>
                    {a.currency === "USD" && a.amountKrw > 0 && (
                      <span className="text-[12px] text-muted tabular-nums">≈ {formatKrw(a.amountKrw)}</span>
                    )}
                  </span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-muted-soft">
                    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </li>
            );
          })}

          {/* 항목 추가 */}
          <li className="border-t border-hairline">
            <button
              type="button"
              onClick={onAdd}
              className="flex w-full items-center gap-2 px-5 py-3 text-[15px] font-semibold text-primary transition-colors hover:bg-surface-soft"
            >
              <span className="text-[18px] leading-none">+</span> 항목 추가
            </button>
          </li>
        </ul>
      )}
    </section>
  );
}
