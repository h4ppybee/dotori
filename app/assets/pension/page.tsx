"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { InvestmentHero } from "@/components/ui/InvestmentHero";
import { PensionDonut } from "@/components/pension/PensionDonut";
import { PensionCategoryCards } from "@/components/pension/PensionCategoryCards";
import { PensionAccountDialog } from "@/components/pension/PensionAccountDialog";
import { usePension, usePensionMutations } from "@/lib/query/use-pension";
import type { PensionAccount } from "@/lib/types";

export default function AssetsPensionPage() {
  const { data: vm, isLoading } = usePension();
  const { upsert } = usePensionMutations();
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);

  async function handleAdd(input: Partial<PensionAccount> & { id?: string }) {
    await upsert.mutateAsync(input);
    setAddOpen(false);
  }

  if (isLoading || vm == null) {
    return (
      <main className="min-h-screen bg-canvas">
        <div className="mx-auto w-full max-w-[480px] px-4 pt-6">
          <div className="flex flex-col items-center justify-center py-24">
            <span className="text-[15px] text-muted">연금을 불러오는 중이에요…</span>
          </div>
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
              <p className="text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink">아직 연금이 없어요</p>
              <p className="text-[15px] font-normal leading-[1.6] text-body-soft max-w-[280px]">
                개인연금·퇴직연금을 직접 추가해 한눈에 모아 보세요.
              </p>
            </div>
            <Button variant="primary" onClick={() => setAddOpen(true)} className="w-full max-w-[260px]">
              연금 추가하기
            </Button>
          </Card>
        ) : (
          <>
            <InvestmentHero
              label="연금 평가금"
              totalValueKrw={vm.totalValueKrw}
              totalPnlKrw={vm.totalPnlKrw}
              returnPct={vm.returnPct}
              sub={`총 ${vm.count}개`}
            />
            <PensionDonut vm={vm} />
            <PensionCategoryCards vm={vm} />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setAddOpen(true)} className="flex-1">+ 추가</Button>
              <Button variant="primary" onClick={() => router.push("/assets/pension/manage")} className="flex-1">관리</Button>
            </div>
          </>
        )}
      </div>

      <PensionAccountDialog
        key={addOpen ? "add-open" : "add-closed"}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={handleAdd}
      />
    </main>
  );
}
