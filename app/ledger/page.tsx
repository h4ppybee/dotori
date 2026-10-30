"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { MonthPicker } from "@/components/ledger/MonthPicker";
import { LedgerSummaryCard } from "@/components/ledger/LedgerSummaryCard";
import { LedgerCategoryList } from "@/components/ledger/LedgerCategoryList";
import { LedgerMemoCard } from "@/components/ledger/LedgerMemoCard";
import { useLedgerMonths, useLedgerMutations } from "@/lib/query/use-ledger";
import { LEAF_IDS } from "@/lib/ledger/categories";
import { addMonths, currentMonth } from "@/lib/ledger/month";
import { buildMonthView, canCarryOver, carryOverFromPrevious } from "@/lib/ledger/ledger-service";
import { useAppStore } from "@/stores/app-store";

type Amounts = Record<string, number>;

/** 저장된 amounts에서 현재 트리의 잎 값만 뽑는다(편집 draft 시드). */
function leafDraft(amounts: Amounts): Amounts {
  const out: Amounts = {};
  LEAF_IDS.forEach((id) => {
    const v = amounts[id] ?? 0;
    if (v > 0) {
      out[id] = v;
    }
  });
  return out;
}

/**
 * 가계부 월별 화면 — 월 선택·요약·카테고리 목록(편집)·지난달에서 가져오기·월간 회고.
 * 편집값은 이 화면 상태에만 있다. 서브탭·← 이동·자동 잠금으로 화면이 사라지면 확인 없이 버린다.
 */
export default function LedgerPage() {
  // 이번 달은 렌더 시점에 한 번 계산한다(앱을 연 채로 월이 바뀌는 경우는 다루지 않음).
  const [thisMonth] = useState(() => currentMonth(new Date()));
  const [month, setMonth] = useState(thisMonth);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Amounts>({});

  const rows = useLedgerMonths().data;
  const { saveAmounts } = useLedgerMutations();
  const revealAmounts = useAppStore((s) => s.revealAmounts);

  // 데이터를 불러오기 전에는 그리지 않는다 — 0원 목록이 잠깐 보였다가 바뀌며 깜박이지 않게.
  if (rows === undefined) {
    return <main className="min-h-screen bg-canvas" />;
  }

  const saved = rows.find((r) => r.id === month)?.amounts ?? {};
  const prevRow = rows.find((r) => r.id === addMonths(month, -1));
  const memo = rows.find((r) => r.id === month)?.memo ?? "";
  const view = buildMonthView(editing ? draft : saved);
  const showCarryOver = canCarryOver(saved, prevRow?.amounts);

  // 편집에 들어가면 금액 숨기기를 풀어 입력값이 보이게 한다.
  function beginEdit(seed: Amounts) {
    revealAmounts();
    setDraft(seed);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft({});
  }

  // 모든 잎의 최종 값을 넘긴다 — 0·빈 잎은 저장 함수가 키를 지운다.
  async function saveEdit() {
    const amounts: Amounts = {};
    LEAF_IDS.forEach((id) => {
      amounts[id] = draft[id] ?? 0;
    });
    await saveAmounts.mutateAsync({ month, amounts });
    cancelEdit();
  }

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto flex w-full max-w-[480px] flex-col gap-4 px-4 pt-6 pb-28">
        <h1 className="text-[22px] font-bold leading-[1.3] tracking-[-0.3px] text-ink">가계부</h1>

        <MonthPicker
          month={month}
          onPrev={() => setMonth(addMonths(month, -1))}
          onNext={() => setMonth(addMonths(month, 1))}
          prevDisabled={editing}
          nextDisabled={editing || month >= thisMonth}
        />

        <LedgerSummaryCard view={view} />

        {showCarryOver && (
          <Button
            variant="secondary"
            className="w-full"
            disabled={editing}
            onClick={() => beginEdit(carryOverFromPrevious(prevRow?.amounts ?? {}))}
          >
            지난달에서 가져오기
          </Button>
        )}

        {/* 편집 툴바 — 통장 쪼개기와 같은 상단 텍스트 버튼(하단 고정 버튼은 플로팅 pill과 겹친다). */}
        <div className="flex items-center justify-end">
          {!editing ? (
            <button
              type="button"
              onClick={() => beginEdit(leafDraft(saved))}
              className="text-[15px] font-semibold text-primary hover:underline"
            >
              편집
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button type="button" onClick={cancelEdit} className="text-[15px] font-semibold text-muted">
                취소
              </button>
              <button
                type="button"
                onClick={() => void saveEdit()}
                disabled={saveAmounts.isPending}
                className="text-[15px] font-semibold text-primary disabled:text-primary-disabled"
              >
                저장하기
              </button>
            </div>
          )}
        </div>

        <LedgerCategoryList
          view={view}
          editing={editing}
          draft={draft}
          onDraftChange={(id, v) => setDraft((p) => ({ ...p, [id]: v }))}
        />

        {/* 달마다 리마운트해 그 달 회고로 시드한다. */}
        <LedgerMemoCard key={month} month={month} initialMemo={memo} />
      </div>
    </main>
  );
}
