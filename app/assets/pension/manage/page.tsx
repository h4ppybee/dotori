"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import { ReturnBadge } from "@/components/ui/ReturnBadge";
import { PensionManageList } from "@/components/pension/PensionManageList";
import { usePension } from "@/lib/query/use-pension";
import { formatKrw } from "@/lib/format";
import type { PensionCategory } from "@/lib/types";

const VALID_CATS: PensionCategory[] = ["PERSONAL", "RETIREMENT"];

function ManageContent() {
  const { data: vm, isLoading } = usePension();
  const router = useRouter();
  const searchParams = useSearchParams();
  const catParam = searchParams.get("cat");
  const initialCat =
    catParam && VALID_CATS.includes(catParam as PensionCategory)
      ? (catParam as PensionCategory)
      : "ALL";

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto w-full max-w-[480px] px-4 pb-28">
        <div className="flex items-center h-14 -ml-2">
          <button
            type="button"
            onClick={() => router.push("/assets/pension")}
            aria-label="뒤로"
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-surface-soft transition-colors text-[22px] leading-none"
          >
            ‹
          </button>
          <h1 className="text-[17px] font-bold leading-[1.4] tracking-[-0.2px] text-ink">연금 관리</h1>
        </div>

        {isLoading || vm == null ? (
          <p className="py-24 text-center text-[15px] text-muted">불러오는 중이에요…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="px-1">
              <span className="text-[13px] text-muted">연금 평가금 · {vm.count}개</span>
              <PrivacyAmount revealLabel="연금 평가금 보기">
                <p className="text-[28px] font-bold leading-[1.25] tracking-[-0.4px] tabular-nums text-ink">
                  {formatKrw(vm.totalValueKrw)}
                </p>
              </PrivacyAmount>
              <div className="mt-1">
                <ReturnBadge value={vm.returnPct} />
              </div>
            </div>

            <PensionManageList vm={vm} initialCat={initialCat} />
          </div>
        )}
      </div>
    </main>
  );
}

export default function AssetsPensionManagePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-canvas" />}>
      <ManageContent />
    </Suspense>
  );
}
