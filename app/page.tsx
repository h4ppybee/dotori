"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SummaryHero } from "@/components/portfolio/SummaryHero";
import { SectorDonut } from "@/components/portfolio/SectorDonut";
import { HoldingsTable } from "@/components/portfolio/HoldingsTable";
import { RefreshBar } from "@/components/portfolio/RefreshBar";
import { usePortfolio, useRefresh } from "@/lib/query/use-portfolio";
import { useAppStore } from "@/stores/app-store";
import { listConnections, getSettings, getFx } from "@/lib/db/local-store";
import { saveDailySnapshotIfNeeded } from "@/lib/snapshot/snapshot-service";
import type { PortfolioVM } from "@/lib/portfolio/portfolio-service";

/** YYYY-MM-DD (로컬). */
function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <span className="text-[15px] text-muted">포트폴리오를 불러오는 중이에요…</span>
    </div>
  );
}

function EmptyState() {
  return (
    <Card variant="hero" className="flex flex-col items-center text-center gap-5 py-10">
      <div className="flex flex-col gap-2">
        <p className="text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink">
          아직 보유 종목이 없어요
        </p>
        <p className="text-[15px] font-normal leading-[1.6] text-body-soft max-w-[280px]">
          토스를 연동하거나 직접 추가해 보세요.
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full max-w-[260px]">
        <Link
          href="/settings"
          className="inline-flex h-[52px] w-full items-center justify-center rounded-[12px] bg-primary px-5 text-[17px] font-semibold leading-[1.2] tracking-[-0.2px] text-on-primary transition-colors hover:bg-primary-active active:bg-primary-pressed"
        >
          토스 연동하기
        </Link>
        <Link
          href="/holdings"
          className="inline-flex h-[52px] w-full items-center justify-center rounded-[12px] bg-primary-surface px-5 text-[17px] font-semibold leading-[1.2] tracking-[-0.2px] text-primary transition-colors hover:bg-[#ecddc9] active:bg-[#e4d3bf]"
        >
          직접 추가하기
        </Link>
      </div>
    </Card>
  );
}

export default function PortfolioPage() {
  const { data: vm, isLoading } = usePortfolio();
  const refresh = useRefresh();
  const lastRefreshAt = useAppStore((s) => s.lastRefreshAt);

  const [connectionLabels, setConnectionLabels] = useState<Record<string, string>>({});
  const [usdKrwRate, setUsdKrwRate] = useState<number | undefined>(undefined);

  const snapshotDone = useRef(false);

  // 증권사 라벨 + 환율 로드 (1회).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [connections, fx] = await Promise.all([listConnections(), getFx()]);
      if (cancelled) {
        return;
      }
      const labels: Record<string, string> = {};
      for (const c of connections) {
        labels[c.id] = c.label;
      }
      setConnectionLabels(labels);
      setUsdKrwRate(fx?.rate);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 진입 시 일별 스냅샷 (ref 가드로 1회만, refetch 시 재발화 금지).
  useEffect(() => {
    if (snapshotDone.current) {
      return;
    }
    if (vm == null || vm.rows.length === 0) {
      return;
    }
    snapshotDone.current = true;
    const today = todayStr();
    void (async () => {
      const settings = await getSettings();
      if (settings?.lastSnapshotDate === today) {
        return;
      }
      await saveDailySnapshotIfNeeded(vm as PortfolioVM, today);
    })();
  }, [vm]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-canvas">
        <div className="mx-auto w-full max-w-[480px] px-4 pt-6">
          <LoadingState />
        </div>
      </main>
    );
  }

  const hasRows = vm != null && vm.rows.length > 0;

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto w-full max-w-[480px] px-4 pt-6 flex flex-col gap-4">
        <RefreshBar
          onRefresh={() => refresh.mutate()}
          pending={refresh.isPending}
          lastRefreshAt={lastRefreshAt}
          failures={refresh.data?.failures}
        />

        {!hasRows && <EmptyState />}

        {hasRows && (
          <>
            <SummaryHero vm={vm} />
            <SectorDonut vm={vm} />
            <HoldingsTable
              rows={vm.rows}
              connectionLabels={connectionLabels}
              usdKrwRate={usdKrwRate}
            />
          </>
        )}
      </div>
    </main>
  );
}
