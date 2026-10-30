"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { saveLedgerMemo } from "@/lib/db/local-store";
import { LEDGER_KEY } from "@/lib/query/use-ledger";

const DEBOUNCE_MS = 1000;
const SAVED_VISIBLE_MS = 2000;

interface LedgerMemoCardProps {
  /** "YYYY-MM". 호출부가 key={month}로 달마다 리마운트한다. */
  month: string;
  /** 그 달 저장된 회고 — 데이터 로드 뒤에만 렌더해 시드한다(빈 문자열로 덮어쓰지 않게). */
  initialMemo: string;
}

/**
 * 월간 회고 — 편집 모드와 무관하게 항상 입력할 수 있는 여러 줄 입력칸.
 * 저장 시점: 입력 멈춤 1초 뒤·blur·visibilitychange hidden·언마운트. 마지막 저장값과 같으면 건너뛴다.
 * 언마운트·hidden 저장도 끝까지 가도록 뮤테이션 대신 saveLedgerMemo를 직접 부르고 쿼리를 무효화한다.
 */
export function LedgerMemoCard({ month, initialMemo }: LedgerMemoCardProps) {
  const qc = useQueryClient();
  const [value, setValue] = useState(initialMemo);
  const [savedVisible, setSavedVisible] = useState(false);

  // 최신 입력값·마지막 저장값은 핸들러에서만 읽고 쓴다(렌더 중 ref 접근 없음).
  const latestRef = useRef(initialMemo);
  const lastSavedRef = useRef(initialMemo);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // showSaved=false는 화면이 사라지는 경로(언마운트·hidden) — 안내를 띄우지 않는다.
  const flush = useCallback(
    (showSaved: boolean) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const memo = latestRef.current;
      const previous = lastSavedRef.current;
      if (memo === previous) {
        return;
      }
      lastSavedRef.current = memo;
      saveLedgerMemo(month, memo)
        .then(() => {
          void qc.invalidateQueries({ queryKey: LEDGER_KEY });
          if (!showSaved) {
            return;
          }
          setSavedVisible(true);
          if (hideRef.current) {
            clearTimeout(hideRef.current);
          }
          hideRef.current = setTimeout(() => setSavedVisible(false), SAVED_VISIBLE_MS);
        })
        .catch(() => {
          // 실패하면 다음 저장 시점에 다시 시도하도록 마지막 저장값을 되돌린다.
          if (lastSavedRef.current === memo) {
            lastSavedRef.current = previous;
          }
        });
    },
    [month, qc],
  );

  // effect는 visibilitychange 등록과 언마운트 정리(저장)만 맡는다.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flush(false);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (hideRef.current) {
        clearTimeout(hideRef.current);
      }
      flush(false);
    };
  }, [flush]);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[17px] font-bold leading-[1.45] tracking-[-0.2px] text-ink">
          <label htmlFor={`ledger-memo-${month}`}>월간 회고</label>
        </h3>
        <span role="status" className="text-[13px] font-normal leading-[1.45] text-muted">
          {savedVisible ? "저장했어요" : ""}
        </span>
      </div>
      <textarea
        id={`ledger-memo-${month}`}
        rows={4}
        value={value}
        placeholder="이번 달은 어땠나요?"
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          latestRef.current = next;
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
          }
          debounceRef.current = setTimeout(() => flush(true), DEBOUNCE_MS);
        }}
        onBlur={() => flush(true)}
        className="min-h-[112px] w-full resize-none rounded-[12px] border border-hairline bg-surface-soft px-4 py-3 text-[15px] font-normal leading-[1.6] text-ink outline-none transition-colors duration-150 placeholder:text-muted focus:border-[1.5px] focus:border-primary focus:bg-surface-card"
      />
    </Card>
  );
}
