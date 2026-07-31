"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { TextInput } from "@/components/ui/TextInput";

interface GoalFormProps {
  open: boolean;
  /** 있으면 수정 모드 — 기존 값으로 폼을 채운다. */
  initial?: { targetNetWorthKrw: number; targetDate: string };
  onClose: () => void;
  onSubmit: (v: { targetNetWorthKrw: number; targetDate: string }) => void;
  /** 있으면(수정 모드) 삭제 버튼을 노출한다. */
  onDelete?: () => void;
  submitting?: boolean;
}

/** 숫자 이외 문자를 제거하고 정수로 파싱한다. */
function parseAmount(raw: string): number {
  return Number(raw.replace(/[^0-9]/g, ""));
}

/**
 * 순자산 목표 생성·수정 다이얼로그 폼.
 * 목표 금액(숫자)·목표 날짜(YYYY-MM-DD)를 입력받는다.
 * 수정 모드에서는 삭제 버튼(text-up)을 함께 노출한다.
 */
export function GoalForm({
  open,
  initial,
  onClose,
  onSubmit,
  onDelete,
  submitting = false,
}: GoalFormProps) {
  // 초기값은 마운트 시 props에서 한 번 읽는다. 부모가 open 시 key로 리마운트해
  // 재초기화한다(effect 동기화를 피해 cascading render를 막는다 — SavingsAccountDialog와 동일).
  const [amount, setAmount] = useState(
    initial != null ? String(initial.targetNetWorthKrw) : "",
  );
  const [date, setDate] = useState(initial?.targetDate ?? "");

  const parsedAmount = parseAmount(amount);
  const canSubmit = parsedAmount > 0 && date.length > 0 && !submitting;
  const isEdit = initial != null;

  function handleAction() {
    if (!canSubmit) {
      return;
    }
    onSubmit({ targetNetWorthKrw: parsedAmount, targetDate: date });
  }

  return (
    <Dialog
      open={open}
      title={isEdit ? "목표 수정하기" : "목표 설정하기"}
      onClose={onClose}
      actionLabel={submitting ? "저장 중..." : "저장하기"}
      onAction={canSubmit ? handleAction : undefined}
      actionVariant="primary"
    >
      <div className="flex flex-col gap-4 pb-1">
        <TextInput
          label="목표 금액"
          inputId="goal-amount"
          value={amount}
          onChange={(v) => setAmount(v.replace(/[^0-9]/g, ""))}
          inputMode="numeric"
          placeholder="예: 100000000"
        />
        <TextInput
          label="목표 날짜"
          inputId="goal-date"
          type="date"
          value={date}
          onChange={setDate}
        />

        {onDelete != null && (
          <button
            type="button"
            onClick={onDelete}
            className="self-center mt-1 px-4 py-2 text-[15px] font-semibold text-up hover:underline underline-offset-2"
          >
            목표 삭제하기
          </button>
        )}
      </div>
    </Dialog>
  );
}
