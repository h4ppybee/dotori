import { Card } from "@/components/ui/Card";
import { ReturnBadge } from "@/components/ui/ReturnBadge";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import { formatKrw, signClass } from "@/lib/format";

interface InvestmentHeroProps {
  /** 상단 라벨 — 예: "연금 평가금", "코인 평가금". */
  label: string;
  totalValueKrw: number;
  totalPnlKrw: number;
  returnPct: number;
  /** 하단 보조 문구 — 예: "총 3개". */
  sub?: string;
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

/** 양수면 +를 더한다(음수 -는 formatKrw가 붙인다). */
function signedKrw(n: number): string {
  if (n > 0) {
    return `+${formatKrw(n)}`;
  }
  return formatKrw(n);
}

/**
 * 투자성 자산(연금·코인 등) 요약 히어로. 총평가금 + 총수익률 배지 + 총손익.
 * 한국 증시 색: 상승/수익=빨강, 하락/손실=파랑. PrivacyAmount로 마스킹.
 */
export function InvestmentHero({ label, totalValueKrw, totalPnlKrw, returnPct, sub }: InvestmentHeroProps) {
  return (
    <Card variant="hero" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-normal leading-[1.45] text-muted">{label}</span>
        <PrivacyAmount revealLabel={`${label} 보기`}>
          <span className="text-[36px] font-bold leading-[1.2] tracking-[-0.5px] tabular-nums text-ink">
            {formatKrw(totalValueKrw)}
          </span>
        </PrivacyAmount>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <PrivacyAmount revealLabel="총수익 보기">
          <span className="flex items-center gap-2">
            <ReturnBadge value={returnPct} />
            <span className={`text-[15px] font-semibold leading-[1.4] tabular-nums ${signTextClass(totalPnlKrw)}`}>
              {signedKrw(totalPnlKrw)}
            </span>
          </span>
        </PrivacyAmount>
        <span className="text-[13px] font-normal leading-[1.45] text-muted">
          총수익{sub ? ` · ${sub}` : ""}
        </span>
      </div>
    </Card>
  );
}
