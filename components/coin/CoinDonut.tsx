import { Card } from "@/components/ui/Card";
import { DonutChart, type DonutSegment } from "@/components/ui/DonutChart";
import { formatKrw } from "@/lib/format";
import type { CoinVM } from "@/lib/coin/coin-service";

interface CoinDonutProps {
  vm: CoinVM;
}

/** 코인 종목별 비중 도넛. 빈 상태(평가금 0)에서는 그리지 않는다. */
export function CoinDonut({ vm }: CoinDonutProps) {
  const segments: DonutSegment[] = vm.holdings
    .filter((h) => h.valueKrw > 0)
    .map((h) => ({ label: h.name, value: h.valueKrw, pct: h.pct }));

  if (segments.length === 0) {
    return null;
  }

  return (
    <Card className="flex flex-col gap-5">
      <h2 className="text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink">종목 비중</h2>
      <DonutChart
        segments={segments}
        centerLabel="총 평가금"
        centerValue={formatKrw(vm.totalValueKrw)}
        ariaLabel="코인 종목 비중 도넛 차트"
      />
    </Card>
  );
}
