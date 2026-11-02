import { Card } from "@/components/ui/Card";
import { PnlText } from "@/components/ui/PnlText";
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
 * 종목별 비중 가로 막대 리스트 (비중 내림차순). 제목 없이 막대만 둔다(aria-label로 이름을 준다).
 * 막대 길이 = 평가금(손실 종목은 매수금액까지). 막대 안에서 손익 구간을 증시 시맨틱으로 나눠 보인다:
 * 수익 종목은 [매수금액(primary) | 수익(up, 빨강)], 손실 종목은 [평가금(primary) | 잃은 금액(down, 파랑)].
 * 막대 아래에 종목 손익 금액·수익률(PnlText)을 둔다.
 * 빈 상태(byHolding 없음)에서는 렌더링하지 않는다.
 */
export function HoldingWeightBars({ vm }: HoldingWeightBarsProps) {
  const holdings = vm.byHolding;

  if (holdings.length === 0) {
    return null;
  }

  // 막대 길이 기준. 보통은 총평가금이지만, 손실 구간(매수금액까지)이 100%를 넘지 않도록
  // 종목별 max(평가금, 매수금액) 중 더 큰 값이 있으면 그것을 기준으로 삼는다.
  const totalValue = holdings.reduce((sum, h) => sum + h.valueKrw, 0);
  const scale = Math.max(totalValue, ...holdings.map((h) => Math.max(h.valueKrw, h.costKrw)));
  const widthPct = (krw: number) => (scale > 0 ? (krw / scale) * 100 : 0);

  return (
    <Card className="flex flex-col gap-5">
      <ul className="flex flex-col gap-4" aria-label="종목별 비중">
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
                className="flex h-full overflow-hidden rounded-full"
                style={{ width: `${Math.max(widthPct(Math.max(h.valueKrw, h.costKrw)), 1.5)}%` }}
                aria-hidden="true"
              >
                <div
                  className="h-full bg-primary"
                  style={{ flexGrow: Math.min(h.valueKrw, h.costKrw), flexBasis: 0 }}
                />
                {h.pnlKrw !== 0 && (
                  <div
                    className={`h-full ${h.pnlKrw > 0 ? "bg-up" : "bg-down"}`}
                    style={{ flexGrow: Math.abs(h.pnlKrw), flexBasis: 0 }}
                  />
                )}
              </div>
            </div>
            {h.pnlKrw !== 0 && h.costKrw > 0 && (
              <PnlText
                amountKrw={h.pnlKrw}
                returnPct={(h.pnlKrw / h.costKrw) * 100}
                className="self-end text-[13px] font-semibold leading-[1.4]"
              />
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
