import Link from "next/link";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import { ReturnBadge } from "@/components/ui/ReturnBadge";
import { formatKrw } from "@/lib/format";
import type { PensionVM } from "@/lib/pension/pension-service";
import type { PensionCategory } from "@/lib/types";

interface PensionCategoryCardsProps {
  vm: PensionVM;
}

function CategoryGlyph({ category }: { category: PensionCategory }) {
  if (category === "PERSONAL") {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth={2} />
        <path d="M5.5 19a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="7.5" width="17" height="11" rx="2.5" stroke="currentColor" strokeWidth={2} />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

/** 연금 카테고리 요약 카드(개인/퇴직). 탭하면 관리 화면을 해당 카테고리로 연다. */
export function PensionCategoryCards({ vm }: PensionCategoryCardsProps) {
  if (vm.groups.length === 0) {
    return null;
  }
  return (
    <ul className="flex flex-col gap-2">
      {vm.groups.map((g) => (
        <li key={g.category}>
          <Link
            href={`/assets/pension/manage?cat=${g.category}`}
            className="flex items-center gap-4 rounded-[20px] bg-surface-card p-5 shadow-card transition-colors hover:bg-surface-soft active:bg-surface-strong"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-primary-surface text-primary">
              <CategoryGlyph category={g.category} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-semibold leading-[1.4] text-ink">
                {g.label}
                <span className="ml-1.5 text-[13px] font-normal text-muted">{g.accounts.length}</span>
              </span>
              <PrivacyAmount revealLabel={`${g.label} 금액 보기`}>
                <span className="text-[17px] font-bold leading-[1.3] tracking-[-0.2px] tabular-nums text-ink">
                  {formatKrw(g.valueKrw)}
                </span>
              </PrivacyAmount>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <ReturnBadge value={g.returnPct} />
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-muted-soft">
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
