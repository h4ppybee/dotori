import Link from "next/link";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import { SavingsCategoryIcon } from "@/components/savings/SavingsCategoryIcon";
import { formatKrw } from "@/lib/format";
import type { SavingsVM } from "@/lib/savings/savings-service";

interface SavingsCategoryCardsProps {
  vm: SavingsVM;
}

/**
 * 카테고리 요약 카드 목록. 아이콘 + 이름 + 합계.
 * 탭하면 관리 화면을 해당 카테고리 필터로 연다.
 */
export function SavingsCategoryCards({ vm }: SavingsCategoryCardsProps) {
  if (vm.groups.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-col gap-2">
      {vm.groups.map((g) => (
        <li key={g.category}>
          <Link
            href={`/assets/savings/manage?cat=${g.category}`}
            className="flex items-center gap-4 rounded-[20px] bg-surface-card p-5 shadow-card transition-colors hover:bg-surface-soft active:bg-surface-strong"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-primary-surface text-primary">
              <SavingsCategoryIcon category={g.category} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-semibold leading-[1.4] text-ink">
                {g.label}
                <span className="ml-1.5 text-[13px] font-normal text-muted">
                  {g.accounts.length}
                </span>
              </span>
              <PrivacyAmount revealLabel={`${g.label} 금액 보기`}>
                <span className="text-[17px] font-bold leading-[1.3] tracking-[-0.2px] tabular-nums text-ink">
                  {formatKrw(g.amountKrw)}
                </span>
              </PrivacyAmount>
            </span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-muted-soft">
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </li>
      ))}
    </ul>
  );
}
