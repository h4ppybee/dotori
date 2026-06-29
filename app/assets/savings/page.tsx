"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SavingsSummaryHero } from "@/components/savings/SavingsSummaryHero";
import { SavingsDonut } from "@/components/savings/SavingsDonut";
import { SavingsCategoryCards } from "@/components/savings/SavingsCategoryCards";
import { SavingsAccountDialog } from "@/components/savings/SavingsAccountDialog";
import { useSavings, useSavingsMutations } from "@/lib/query/use-savings";
import type { SavingsAccount } from "@/lib/types";

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <span className="text-[15px] text-muted">저축 자산을 불러오는 중이에요…</span>
    </div>
  );
}

export default function AssetsSavingsPage() {
  const { data: vm, isLoading } = useSavings();
  const { upsert } = useSavingsMutations();
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);

  async function handleAdd(input: Partial<SavingsAccount> & { id?: string }) {
    await upsert.mutateAsync(input);
    setAddOpen(false);
  }

  if (isLoading || vm == null) {
    return (
      <main className="min-h-screen bg-canvas">
        <div className="mx-auto w-full max-w-[480px] px-4 pt-6">
          <LoadingState />
        </div>
      </main>
    );
  }

  const hasRows = vm.count > 0;

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto w-full max-w-[480px] px-4 pt-6 pb-28 flex flex-col gap-4">
        {!hasRows ? (
          <Card variant="hero" className="flex flex-col items-center text-center gap-5 py-10">
            <div className="flex flex-col gap-2">
              <p className="text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink">
                아직 저축 계좌가 없어요
              </p>
              <p className="text-[15px] font-normal leading-[1.6] text-body-soft max-w-[280px]">
                예적금·파킹통장·채권을 직접 추가해 한눈에 모아 보세요.
              </p>
            </div>
            <Button variant="primary" onClick={() => setAddOpen(true)} className="w-full max-w-[260px]">
              계좌 추가하기
            </Button>
          </Card>
        ) : (
          <>
            <SavingsSummaryHero vm={vm} />
            <SavingsDonut vm={vm} />
            <SavingsCategoryCards vm={vm} />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setAddOpen(true)} className="flex-1">
                + 추가
              </Button>
              <Button variant="primary" onClick={() => router.push("/assets/savings/manage")} className="flex-1">
                관리
              </Button>
            </div>
          </>
        )}
      </div>

      <SavingsAccountDialog
        key={addOpen ? "add-open" : "add-closed"}
        open={addOpen}
        usdKrwRate={vm.usdKrwRate}
        onClose={() => setAddOpen(false)}
        onSave={handleAdd}
      />
    </main>
  );
}
