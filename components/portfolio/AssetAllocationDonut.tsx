import { Card } from "@/components/ui/Card";
import { DonutChart, type DonutSegment } from "@/components/ui/DonutChart";
import { formatKrw } from "@/lib/format";

export interface AllocationItem {
  key: string;
  label: string;
  valueKrw: number;
}

interface AssetAllocationDonutProps {
  /** 자산 종류별 평가금액(주식·저축·연금·코인). 값 0 이하는 조각에서 제외한다. */
  items: AllocationItem[];
}

/**
 * 자산 종류별 비중 도넛(주식/저축/연금/코인). 값이 있는 자산 합계를 100%로 나눈다.
 * 색은 DonutChart 기본 팔레트 순서. 표시할 자산이 없으면 카드를 그리지 않는다.
 * 공용 DonutChart를 감싸 카드/헤딩을 입힌다(SavingsDonut과 동일 패턴).
 */
export function AssetAllocationDonut({ items }: AssetAllocationDonutProps) {
  const positive = items.filter((i) => i.valueKrw > 0);
  const total = positive.reduce((s, i) => s + i.valueKrw, 0);
  if (total <= 0) {
    return null;
  }

  const segments: DonutSegment[] = positive.map((i) => ({
    label: i.label,
    value: i.valueKrw,
    pct: (i.valueKrw / total) * 100,
  }));

  return (
    <Card className="flex flex-col gap-5">
      <h2 className="text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink">
        자산 비중
      </h2>
      <DonutChart
        segments={segments}
        centerLabel="총 자산"
        centerValue={formatKrw(total)}
        ariaLabel="자산 종류별 비중 도넛 차트"
      />
    </Card>
  );
}
