import { Card } from "@/components/ui/Card";
import { DonutChart, type DonutSegment } from "@/components/ui/DonutChart";
import { formatKrw } from "@/lib/format";
import type { PensionVM } from "@/lib/pension/pension-service";

interface PensionDonutProps {
  vm: PensionVM;
}

/** 연금 카테고리(개인/퇴직) 비중 도넛. 빈 상태에서는 그리지 않는다. */
export function PensionDonut({ vm }: PensionDonutProps) {
  if (vm.byCategory.length === 0) {
    return null;
  }
  const segments: DonutSegment[] = vm.byCategory.map((c) => ({
    label: c.label,
    value: c.valueKrw,
    pct: c.pct,
  }));
  return (
    <Card className="flex flex-col gap-5">
      <h2 className="text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink">연금 비중</h2>
      <DonutChart
        segments={segments}
        centerLabel="총 평가금"
        centerValue={formatKrw(vm.totalValueKrw)}
        ariaLabel="연금 카테고리 비중 도넛 차트"
      />
    </Card>
  );
}
