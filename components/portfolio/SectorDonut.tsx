import { Card } from "@/components/ui/Card";
import { DonutChart, type DonutSegment } from "@/components/ui/DonutChart";
import { formatKrw } from "@/lib/format";
import type { PortfolioVM } from "@/lib/portfolio/portfolio-service";

interface SectorDonutProps {
  vm: PortfolioVM;
}

/**
 * 섹터 비중 도넛 차트. 공용 DonutChart 프리미티브를 카드로 감싼다(제목 없이 차트만 — 차트 ariaLabel로 이름을 준다).
 * 빈 상태(bySector 없음)에서는 카드를 그리지 않는다.
 */
export function SectorDonut({ vm }: SectorDonutProps) {
  const sectors = vm.bySector;

  if (sectors.length === 0) {
    return null;
  }

  const segments: DonutSegment[] = sectors.map((s) => ({
    label: s.sector,
    value: s.valueKrw,
    pct: s.pct,
  }));

  return (
    <Card className="flex flex-col gap-5">
      <DonutChart
        segments={segments}
        centerLabel="총평가금"
        centerValue={formatKrw(vm.totalValueKrw)}
        ariaLabel="섹터 비중 도넛 차트"
      />
    </Card>
  );
}
