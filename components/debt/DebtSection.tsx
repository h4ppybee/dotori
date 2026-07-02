"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import { DebtAccountDialog } from "@/components/debt/DebtAccountDialog";
import { useDebt, useDebtMutations } from "@/lib/query/use-debt";
import { debtCategoryLabel } from "@/lib/debt/debt-service";
import { formatKrw } from "@/lib/format";
import type { LoanAccount } from "@/lib/types";

export function DebtSection() {
  const { data: vm, isLoading } = useDebt();
  const { upsert, remove } = useDebtMutations();
  const [editing, setEditing] = useState<LoanAccount | null>(null);
  const [open, setOpen] = useState(false);

  // 로딩 중에는 빈 상태가 잠깐 깜빡이지 않도록 섹션 자체를 렌더하지 않는다.
  if (isLoading) {
    return null;
  }

  const items = vm?.items ?? [];

  async function handleSubmit(input: Partial<LoanAccount> & { id?: string }) {
    await upsert.mutateAsync(input);
    setOpen(false);
    setEditing(null);
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[15px] font-semibold text-ink">부채</h2>
        <button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          className="text-[13px] font-medium text-muted active:text-ink"
        >
          + 대출 추가
        </button>
      </div>

      {items.length === 0 ? (
        <Card className="py-6 text-center text-[13px] text-muted">등록된 대출이 없어요</Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((d) => (
            <li key={d.id}>
              <button
                onClick={() => {
                  setEditing(d);
                  setOpen(true);
                }}
                className="flex w-full items-center gap-4 rounded-[20px] bg-surface-card p-5 text-left shadow-card active:bg-surface-strong"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[15px] font-semibold text-ink">{d.name}</span>
                  <span className="text-[12px] text-muted">
                    {debtCategoryLabel(d.category)}
                    {d.lender ? ` · ${d.lender}` : ""}
                  </span>
                </span>
                <PrivacyAmount revealLabel={`${d.name} 잔액 보기`}>
                  <span className="text-[17px] font-bold tabular-nums text-ink">
                    {formatKrw(d.balance)}
                  </span>
                </PrivacyAmount>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* key로 리마운트해 열 때마다 폼 상태를 초기화한다(저축 페이지와 동일 패턴). */}
      <DebtAccountDialog
        key={editing ? `edit-${editing.id}` : open ? "add-open" : "add-closed"}
        open={open}
        initial={editing}
        onSave={handleSubmit}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        onDelete={
          editing
            ? async (id) => {
                await remove.mutateAsync(id);
                setOpen(false);
                setEditing(null);
              }
            : undefined
        }
      />
    </section>
  );
}
