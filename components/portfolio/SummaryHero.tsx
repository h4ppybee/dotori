import { Card } from "@/components/ui/Card";
import { ReturnBadge } from "@/components/ui/ReturnBadge";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import { formatKrw, signClass } from "@/lib/format";
import type { PortfolioVM } from "@/lib/portfolio/portfolio-service";

interface SummaryHeroProps {
  vm: PortfolioVM;
}

/** 부호 클래스 → 텍스트 색 (상승=빨강 / 하락=파랑 / 보합=muted). */
function signTextClass(n: number): string {
  const sign = signClass(n);
  if (sign === "up") {
    return "text-up";
  }
  if (sign === "down") {
    return "text-down";
  }
  return "text-muted";
}

/** 부호 접두사. 양수면 +, 음수면 - 는 formatKrw가 붙이므로 양수만 +를 더한다. */
function signedKrw(n: number): string {
  if (n > 0) {
    return `+${formatKrw(n)}`;
  }
  return formatKrw(n);
}

/**
 * 요약 히어로 카드. 화면 최상단 시선 집중점.
 * 총평가금(number-hero) + 총수익률 배지 + 총손익.
 * 한국 증시 색: 상승/수익=빨강, 하락/손실=파랑.
 */
export function SummaryHero({ vm }: SummaryHeroProps) {
  return (
    <Card variant="hero" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-normal leading-[1.45] text-muted">
          총평가금
        </span>
        <PrivacyAmount revealLabel="총평가금 보기">
          <span className="text-[36px] font-bold leading-[1.2] tracking-[-0.5px] tabular-nums text-ink">
            {formatKrw(vm.totalValueKrw)}
          </span>
        </PrivacyAmount>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <PrivacyAmount revealLabel="총수익 보기">
          <span className="flex items-center gap-2">
            <ReturnBadge value={vm.returnPct} />
            <span
              className={`text-[15px] font-semibold leading-[1.4] tabular-nums ${signTextClass(vm.totalPnlKrw)}`}
            >
              {signedKrw(vm.totalPnlKrw)}
            </span>
          </span>
        </PrivacyAmount>
        <span className="text-[13px] font-normal leading-[1.45] text-muted">
          총수익
        </span>
      </div>
    </Card>
  );
}
