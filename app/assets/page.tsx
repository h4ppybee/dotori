"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import { ReturnBadge } from "@/components/ui/ReturnBadge";
import { RefreshBar } from "@/components/portfolio/RefreshBar";
import { usePortfolio } from "@/lib/query/use-portfolio";
import { useSavings } from "@/lib/query/use-savings";
import { usePension } from "@/lib/query/use-pension";
import { useCoin } from "@/lib/query/use-coin";
import { useAssetsRefresh } from "@/lib/query/use-assets-refresh";
import { useAppStore } from "@/stores/app-store";
import { formatKrw } from "@/lib/format";

interface AssetRow {
  key: string;
  label: string;
  href: string;
  valueKrw: number;
  returnPct?: number; // 손익 개념 있는 자산만
}

export default function AssetsOverviewPage() {
  const portfolio = usePortfolio();
  const savings = useSavings();
  const pension = usePension();
  const coin = useCoin();
  const refresh = useAssetsRefresh();
  const lastRefreshAt = useAppStore((s) => s.lastRefreshAt);

  const stocksValue = portfolio.data?.totalValueKrw ?? 0;
  const savingsValue = savings.data?.totalKrw ?? 0;
  const pensionValue = pension.data?.totalValueKrw ?? 0;
  const coinValue = coin.data?.totalValueKrw ?? 0;
  const total = stocksValue + savingsValue + pensionValue + coinValue;

  const rows: AssetRow[] = [
    { key: "stocks", label: "주식", href: "/assets/stocks", valueKrw: stocksValue, returnPct: portfolio.data?.returnPct },
    { key: "savings", label: "저축/현금성", href: "/assets/savings", valueKrw: savingsValue },
    { key: "pension", label: "연금", href: "/assets/pension", valueKrw: pensionValue, returnPct: pension.data?.returnPct },
    { key: "crypto", label: "코인", href: "/assets/crypto", valueKrw: coinValue, returnPct: coin.data?.returnPct },
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
          <span className="text-[13px] font-normal leading-[1.45] text-muted">총자산</span>
          <PrivacyAmount revealLabel="총자산 보기">
            <span className="text-[36px] font-bold leading-[1.2] tracking-[-0.5px] tabular-nums text-ink">
              {formatKrw(total)}
            </span>
          </PrivacyAmount>
          <span className="text-[13px] font-normal leading-[1.45] text-muted">
            주식·저축·연금·코인 합계
          </span>
        </Card>

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
                  {r.returnPct != null && <ReturnBadge value={r.returnPct} />}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-muted-soft">
                    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
