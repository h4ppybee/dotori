"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import { PnlText } from "@/components/ui/PnlText";
import { RefreshBar } from "@/components/portfolio/RefreshBar";
import { usePortfolio } from "@/lib/query/use-portfolio";
import { useSavings } from "@/lib/query/use-savings";
import { usePension } from "@/lib/query/use-pension";
import { useCoin } from "@/lib/query/use-coin";
import { useDebt } from "@/lib/query/use-debt";
import { DebtSection } from "@/components/debt/DebtSection";
import { NetWorthDonut } from "@/components/portfolio/NetWorthDonut";
import { AssetAllocationDonut } from "@/components/portfolio/AssetAllocationDonut";
import { useAssetsRefresh } from "@/lib/query/use-assets-refresh";
import { useAppStore } from "@/stores/app-store";
import { formatKrw } from "@/lib/format";

interface AssetRow {
  key: string;
  label: string;
  href: string;
  valueKrw: number;
  returnPct?: number; // 손익 개념 있는 자산만
  pnlKrw?: number; // 손익 금액(수익률과 함께 표기)
}

// 마지막 갱신이 이 시간을 넘겼으면 자산 탭 진입 시 자동 전체 갱신(자동 잠금과 동일한 10분).
const AUTO_REFRESH_MS = 10 * 60 * 1000;

export default function AssetsOverviewPage() {
  const portfolio = usePortfolio();
  const savings = useSavings();
  const pension = usePension();
  const coin = useCoin();
  const debt = useDebt();
  const refresh = useAssetsRefresh();
  const lastRefreshAt = useAppStore((s) => s.lastRefreshAt);
  const sessionKey = useAppStore((s) => s.sessionKey);

  // 자산 탭 진입(또는 잠금 해제) 시, 마지막 갱신에서 10분이 지났으면 자동으로 전체 갱신한다.
  // 잠금 상태·이미 갱신 중·마지막 갱신 기록 없음(첫 방문)이면 건너뛴다.
  const refreshMutate = refresh.mutate;
  const isRefreshing = refresh.isPending;
  useEffect(() => {
    if (sessionKey == null || isRefreshing) {
      return;
    }
    if (lastRefreshAt != null && Date.now() - lastRefreshAt > AUTO_REFRESH_MS) {
      refreshMutate();
    }
    // 마운트/잠금 해제 시점에만 판단한다. lastRefreshAt는 그 시점 값으로 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  const stocksValue = portfolio.data?.totalValueKrw ?? 0;
  const savingsValue = savings.data?.totalKrw ?? 0;
  const pensionValue = pension.data?.totalValueKrw ?? 0;
  const coinValue = coin.data?.totalValueKrw ?? 0;
  const total = stocksValue + savingsValue + pensionValue + coinValue;
  const debtValue = debt.data?.totalKrw ?? 0;
  const netWorth = total - debtValue;

  const rows: AssetRow[] = [
    { key: "stocks", label: "주식", href: "/assets/stocks", valueKrw: stocksValue, returnPct: portfolio.data?.returnPct, pnlKrw: portfolio.data?.totalPnlKrw },
    { key: "savings", label: "저축/현금성", href: "/assets/savings", valueKrw: savingsValue },
    { key: "pension", label: "연금", href: "/assets/pension", valueKrw: pensionValue, returnPct: pension.data?.returnPct, pnlKrw: pension.data?.totalPnlKrw },
    { key: "crypto", label: "코인", href: "/assets/crypto", valueKrw: coinValue, returnPct: coin.data?.returnPct, pnlKrw: coin.data?.totalPnlKrw },
  ].filter((r) => r.valueKrw > 0);

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto w-full max-w-[480px] px-4 pt-6 pb-28 flex flex-col gap-4">
        <RefreshBar
          onRefresh={() => refresh.mutate()}
          pending={refresh.isPending}
          lastRefreshAt={lastRefreshAt}
          failures={refresh.data?.failures}
        />

        <Card variant="hero" className="flex flex-col gap-2">
          <span className="text-[13px] font-normal leading-[1.45] text-muted">순자산</span>
          <PrivacyAmount revealLabel="순자산 보기">
            <span className="text-[36px] font-bold leading-[1.2] tracking-[-0.5px] tabular-nums text-ink">
              {formatKrw(netWorth)}
            </span>
          </PrivacyAmount>
          <span className="text-[13px] font-normal leading-[1.45] text-muted">
            자산 {formatKrw(total)} · 부채 {formatKrw(debtValue)}
          </span>
        </Card>

        <NetWorthDonut totalAssets={total} debt={debtValue} />

        <AssetAllocationDonut
          items={[
            { key: "stocks", label: "주식", valueKrw: stocksValue },
            { key: "savings", label: "저축/현금성", valueKrw: savingsValue },
            { key: "pension", label: "연금", valueKrw: pensionValue },
            { key: "crypto", label: "코인", valueKrw: coinValue },
          ]}
        />

        {rows.length === 0 ? (
          <Card className="py-10 text-center text-[15px] text-muted">
            아직 등록된 자산이 없어요. 각 탭에서 추가해 보세요.
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((r) => (
              <li key={r.key}>
                <Link
                  href={r.href}
                  className="flex items-center gap-4 rounded-[20px] bg-surface-card p-5 shadow-card transition-colors hover:bg-surface-soft active:bg-surface-strong"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[15px] font-semibold leading-[1.4] text-ink">{r.label}</span>
                    <PrivacyAmount revealLabel={`${r.label} 금액 보기`}>
                      <span className="text-[17px] font-bold leading-[1.3] tracking-[-0.2px] tabular-nums text-ink">
                        {formatKrw(r.valueKrw)}
                      </span>
                    </PrivacyAmount>
                  </span>
                  {r.returnPct != null && r.pnlKrw != null && (
                    <PnlText
                      amountKrw={r.pnlKrw}
                      returnPct={r.returnPct}
                      className="shrink-0 text-[13px] font-semibold leading-[1.4]"
                    />
                  )}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-muted-soft">
                    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <DebtSection />
      </div>
    </main>
  );
}
