"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { HoldingForm } from "@/components/holdings/HoldingForm";
import { useRefresh } from "@/lib/query/use-portfolio";

export default function NewHoldingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const refresh = useRefresh();

  function handleSaved() {
    void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    try {
      refresh.mutate();
    } catch {
      // 갱신 실패 무시 — 로컬 데이터는 이미 저장됨
    }
    router.push("/assets/stocks");
  }

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto w-full max-w-[480px] px-4 pb-24">
        {/* 헤더 */}
        <div className="flex items-center h-14 -ml-2">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="뒤로"
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-surface-soft transition-colors text-[22px] leading-none"
          >
            ‹
          </button>
        </div>

        <Card>
          <h2 className="text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink mb-5">
            종목 추가
          </h2>
          <HoldingForm onSave={handleSaved} onCancel={() => router.back()} />
        </Card>
      </div>
    </main>
  );
}
