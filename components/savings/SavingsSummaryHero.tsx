import { Card } from "@/components/ui/Card";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import { formatKrw } from "@/lib/format";
import type { SavingsVM } from "@/lib/savings/savings-service";

interface SavingsSummaryHeroProps {
  vm: SavingsVM;
}

/**
 * 저축/현금성 요약 히어로. 화면 최상단 시선 집중점.
 * 총액(number-hero) + 계좌 수. 손익 개념이 없어 up/down 색은 쓰지 않는다.
 */
export function SavingsSummaryHero({ vm }: SavingsSummaryHeroProps) {
  return (
    <Card variant="hero" className="flex flex-col gap-2">
      <span className="text-[13px] font-normal leading-[1.45] text-muted">
        저축/현금성 자산
      </span>
      <PrivacyAmount revealLabel="총 저축액 보기">
        <span className="text-[36px] font-bold leading-[1.2] tracking-[-0.5px] tabular-nums text-ink">
          {formatKrw(vm.totalKrw)}
        </span>
      </PrivacyAmount>
      <span className="text-[13px] font-normal leading-[1.45] text-muted">
        총 {vm.count}개 계좌
        {vm.monthlyDepositTotal > 0 && (
          <> · 매달 {formatKrw(vm.monthlyDepositTotal)} 모아요</>
        )}
      </span>
    </Card>
  );
}
