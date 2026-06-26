import { Card } from "@/components/ui/Card";
import { formatKrw } from "@/lib/format";
import type { PortfolioVM } from "@/lib/portfolio/portfolio-service";

interface HoldingWeightBarsProps {
  vm: PortfolioVM;
}

/** 비중(0~100)을 부호 없이 소수점 1자리로. */
function formatShare(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

/**
 * 종목별 비중 가로 막대 리스트 (비중 내림차순).
 * 섹터 도넛과 대비되도록 단색(primary) 막대로 통일한다.
 * 빈 상태(byHolding 없음)에서는 렌더링하지 않는다.
 */
export function HoldingWeightBars({ vm }: HoldingWeightBarsProps) {
  const holdings = vm.byHolding;

  if (holdings.length === 0) {
    return null;
  }

  return (
    <Card className="flex flex-col gap-5">
      <h2 className="text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink">
        종목별 비중
      </h2>

      <ul className="flex flex-col gap-4">
        {holdings.map((h) => (
          <li key={h.symbol} className="flex flex-col gap-[6px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[15px] font-medium leading-[1.4] text-body">
                {h.name}
              </span>
              <div className="flex items-baseline gap-2 shrink-0">
                <span className="text-[15px] font-semibold leading-[1.4] tabular-nums text-ink">
                  {formatShare(h.pct)}
                </span>
                <span className="text-[13px] font-normal leading-[1.45] tabular-nums text-muted">
                  {formatKrw(h.valueKrw)}
                </span>
              </div>
            </div>
            <div className="h-2 w-full rounded-full bg-surface-soft overflow-hidden">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(h.pct, 1.5)}%` }}
                aria-hidden="true"
              />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
