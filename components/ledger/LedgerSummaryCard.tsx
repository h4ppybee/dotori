"use client";

import { Card } from "@/components/ui/Card";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import { LEDGER_REVEAL_LABEL } from "@/components/ledger/ledger-constants";
import { formatKrw } from "@/lib/format";
import { formatMonthTitle } from "@/lib/ledger/month";
import type { LedgerMonthView } from "@/lib/ledger/ledger-service";

// 분석 차트와 같은 계열 색(수입 primary · 지출 warning · 저축 success). 손익이 아니므로 up/down은 쓰지 않는다.
const ROWS = [
  { key: "income", label: "수입", dot: "bg-primary" },
  { key: "expense", label: "지출", dot: "bg-warning" },
  { key: "saving", label: "저축", dot: "bg-success" },
] as const;

/** 월 요약 — 남은 돈(수입 − 지출 − 저축)을 크게, 아래에 수입·지출·저축 합계. */
export function LedgerSummaryCard({ month, view }: { month: string; view: LedgerMonthView }) {
  return (
    <section aria-label={`${formatMonthTitle(month)} 요약`}>
      <Card variant="hero" className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-normal leading-[1.45] text-muted">남은 돈</span>
          <PrivacyAmount revealLabel={LEDGER_REVEAL_LABEL}>
            {/* 남은 돈은 손익이 아니라 음수여도 뉴트럴 ink로 둔다. */}
            <span className="text-[36px] font-bold leading-[1.2] tracking-[-0.5px] tabular-nums text-ink">
              {formatKrw(view.remaining)}
            </span>
          </PrivacyAmount>
        </div>
        <dl className="flex flex-col gap-2 border-t border-hairline pt-4">
          {ROWS.map((row) => (
            <div key={row.key} className="flex items-center justify-between">
              <dt className="flex items-center gap-2 text-[15px] font-normal leading-[1.5] text-body">
                <span className={`h-2 w-2 rounded-full ${row.dot}`} aria-hidden="true" />
                {row.label}
              </dt>
              <dd>
                <PrivacyAmount revealLabel={LEDGER_REVEAL_LABEL}>
                  <span className="text-[15px] font-semibold leading-[1.4] tabular-nums text-ink">
                    {formatKrw(view[row.key])}
                  </span>
                </PrivacyAmount>
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </section>
  );
}
