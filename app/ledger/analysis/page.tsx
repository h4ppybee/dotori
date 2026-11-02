"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { RangeChips } from "@/components/ledger/RangeChips";
import { CategoryChips } from "@/components/ledger/CategoryChips";
import { LedgerFlowChart } from "@/components/ledger/LedgerFlowChart";
import { LedgerCategoryChart } from "@/components/ledger/LedgerCategoryChart";
import { SLOT_COLORS } from "@/components/ledger/ledger-constants";
import { useLedgerMonths } from "@/lib/query/use-ledger";
import { chipLabel } from "@/lib/ledger/categories";
import { buildSeries } from "@/lib/ledger/ledger-service";
import { currentMonth } from "@/lib/ledger/month";
import { useLedgerStore } from "@/stores/ledger-store";

const CARD_TITLE = "text-[17px] font-bold leading-[1.45] tracking-[-0.2px] text-ink";

/**
 * 가계부 분석 화면 — 기간 칩 + 수입·지출·저축 차트 + 카테고리별 선 차트.
 * 기간·칩 선택은 메모리(ledger-store)에 있어 서브탭을 오가도 유지된다.
 */
export default function LedgerAnalysisPage() {
  // 끝 달은 이번 달 — 렌더 시점에 한 번 계산한다.
  const [thisMonth] = useState(() => currentMonth(new Date()));
  const { data: rows, isError } = useLedgerMonths();
  const range = useLedgerStore((s) => s.range);
  const selected = useLedgerStore((s) => s.selected);
  const setRange = useLedgerStore((s) => s.setRange);
  const toggleNode = useLedgerStore((s) => s.toggleNode);

  if (rows === undefined && isError) {
    return (
      <main className="min-h-screen bg-canvas">
        <div className="mx-auto flex w-full max-w-[480px] flex-col gap-4 px-4 pt-6 pb-28">
          <h1 className="text-[22px] font-bold leading-[1.3] tracking-[-0.3px] text-ink">분석</h1>
          <Card className="py-10 text-center">
            <p role="alert" className="text-[15px] font-normal leading-[1.5] text-muted">
              가계부를 불러오지 못했어요. 다시 열어 주세요.
            </p>
          </Card>
        </div>
      </main>
    );
  }

  // 데이터를 불러오기 전에는 그리지 않는다 — 안내 문구가 잠깐 보였다가 차트로 바뀌며 깜박이지 않게.
  if (rows === undefined) {
    return <main className="min-h-screen bg-canvas" />;
  }

  const series = buildSeries(rows, { endMonth: thisMonth, range, nodeIds: selected.map((s) => s.id) });
  const enough = series.monthsWithData >= 2;

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto flex w-full max-w-[480px] flex-col gap-4 px-4 pt-6 pb-28">
        <h1 className="text-[22px] font-bold leading-[1.3] tracking-[-0.3px] text-ink">분석</h1>

        <RangeChips value={range} onChange={setRange} />

        {!enough ? (
          <Card className="py-10 text-center">
            <p className="text-[15px] font-normal leading-[1.5] text-muted">두 달 이상 기록하면 흐름을 볼 수 있어요</p>
          </Card>
        ) : (
          <>
            <section aria-labelledby="ledger-flow-title">
              <Card className="flex flex-col gap-4">
                <h2 id="ledger-flow-title" className={CARD_TITLE}>수입·지출·저축</h2>
                <LedgerFlowChart
                  months={series.months}
                  income={series.income}
                  expense={series.expense}
                  saving={series.saving}
                />
              </Card>
            </section>

            <section aria-labelledby="ledger-category-title">
              <Card className="flex flex-col gap-4">
                <h2 id="ledger-category-title" className={CARD_TITLE}>카테고리별 흐름</h2>
                <CategoryChips selected={selected} onToggle={toggleNode} />
                <LedgerCategoryChart
                  months={series.months}
                  lines={selected.map((s) => ({
                    id: s.id,
                    label: chipLabel(s.id),
                    color: SLOT_COLORS[s.slot],
                    values: series.byNode[s.id] ?? [],
                  }))}
                />
              </Card>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
