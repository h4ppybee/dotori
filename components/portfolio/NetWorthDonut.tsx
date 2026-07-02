import { Card } from "@/components/ui/Card";
import { DonutChart, type DonutSegment } from "@/components/ui/DonutChart";
import { computeNetWorth } from "@/lib/portfolio/net-worth";
import { formatKrw } from "@/lib/format";

interface NetWorthDonutProps {
  /** 자산 합계(주식+저축+연금+코인). */
  totalAssets: number;
  /** 부채 합계. */
  debt: number;
}

// 순자산/부채 의미색. DESIGN.md donut-chart 팔레트에서 순자산=브랜드(primary), 부채=뉴트럴(muted).
// 손익 색(up=빨강/down=파랑)은 여기 쓰지 않는다 — 순자산·부채는 손익이 아니다.
const NET_WORTH_COLOR = "#A87342"; // colors.primary
const DEBT_COLOR = "#6B7684"; // 뉴트럴

/**
 * 순자산 vs 부채 비중 도넛. 자산 합계를 100%로 두 조각으로 나눈다.
 * 자산이 없으면(그릴 게 없음) 카드를 그리지 않는다.
 * 부채가 없으면 순자산 100% 한 조각만 그린다(0% 부채 sliver를 피함).
 * 공용 DonutChart를 감싸 카드/헤딩을 입힌다(SavingsDonut과 동일 패턴).
 */
export function NetWorthDonut({ totalAssets, debt }: NetWorthDonutProps) {
  if (totalAssets <= 0) {
    return null;
  }

  const parts = computeNetWorth(totalAssets, debt);
  const segments: DonutSegment[] = [
    { label: "순자산", value: parts.netWorth, pct: parts.netWorthPct, color: NET_WORTH_COLOR },
  ];
  if (debt > 0) {
    segments.push({ label: "부채", value: parts.debt, pct: parts.debtPct, color: DEBT_COLOR });
  }

  return (
    <Card className="flex flex-col gap-5">
      <h2 className="text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink">
        순자산 비중
      </h2>
      <DonutChart
        segments={segments}
        centerLabel="순자산"
        centerValue={formatKrw(parts.netWorth)}
        ariaLabel="순자산 대비 부채 비중 도넛 차트"
      />
    </Card>
  );
}
