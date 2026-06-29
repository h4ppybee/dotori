import { Card } from "@/components/ui/Card";
import { DonutChart, type DonutSegment } from "@/components/ui/DonutChart";
import { formatKrw } from "@/lib/format";
import type { SavingsVM } from "@/lib/savings/savings-service";

interface SavingsDonutProps {
  vm: SavingsVM;
}

/**
 * 저축 카테고리 비중 도넛. 공용 DonutChart를 감싸 카드/헤딩을 입힌다.
 * 빈 상태(byCategory 없음)에서는 카드를 그리지 않는다.
 */
export function SavingsDonut({ vm }: SavingsDonutProps) {
  if (vm.byCategory.length === 0) {
    return null;
  }

  const segments: DonutSegment[] = vm.byCategory.map((c) => ({
    label: c.label,
    value: c.amountKrw,
    pct: c.pct,
  }));

  return (
    <Card className="flex flex-col gap-5">
      <h2 className="text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink">
        총 자산 비중
      </h2>
      <DonutChart
        segments={segments}
        centerLabel="총 자산"
        centerValue={formatKrw(vm.totalKrw)}
        ariaLabel="저축 카테고리 비중 도넛 차트"
      />
    </Card>
  );
}
