"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { TextInput } from "@/components/ui/TextInput";
import { Chip } from "@/components/ui/Chip";
import { formatKoreanUnit } from "@/lib/format";
import { DEBT_CATEGORIES } from "@/lib/debt/debt-service";
import type { LoanAccount, LoanCategory } from "@/lib/types";

interface DebtAccountDialogProps {
  open: boolean;
  /** 편집 대상(있으면 수정, 없으면 추가). */
  initial?: LoanAccount | null;
  onClose: () => void;
  onSave: (input: Partial<LoanAccount> & { id?: string }) => void | Promise<void>;
  onDelete?: (id: string) => void | Promise<void>;
}

/** 숫자 문자열 → number(빈/NaN은 undefined). 콤마 제거. */
function parseNum(s: string): number | undefined {
  const cleaned = s.replace(/,/g, "").trim();
  if (cleaned === "") {
    return undefined;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * 대출(부채) 단건 추가/편집 다이얼로그.
 * 잔액은 KRW 고정. 저장은 부모가 주입한 onSave가 담당한다.
 */
export function DebtAccountDialog({
  open,
  initial,
  onClose,
  onSave,
  onDelete,
}: DebtAccountDialogProps) {
  // 초기값은 마운트 시 props에서 한 번 읽는다. 부모가 key로 리마운트해 재초기화한다
  // (열 때마다 key 변경 → 새 인스턴스). effect 동기화를 피해 cascading render를 막는다.
  const [category, setCategory] = useState<LoanCategory>(initial?.category ?? "ETC");
  const [name, setName] = useState(initial?.name ?? "");
  const [lender, setLender] = useState(initial?.lender ?? "");
  const [balance, setBalance] = useState(initial?.balance != null ? String(initial.balance) : "");
  const [rate, setRate] = useState(
    initial?.interestRate != null ? String(initial.interestRate) : "",
  );
  const [monthly, setMonthly] = useState(
    initial?.monthlyPayment != null ? String(initial.monthlyPayment) : "",
  );
  const [maturity, setMaturity] = useState(initial?.maturityDate ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    if (name.trim() === "") {
      setError("대출 이름을 입력해 주세요.");
      return;
    }
    const balanceNum = parseNum(balance);
    if (balanceNum == null) {
      setError("잔액을 숫자로 입력해 주세요.");
      return;
    }
    void onSave({
      id: initial?.id,
      category,
      name: name.trim(),
      lender: lender.trim() || undefined,
      balance: balanceNum,
      interestRate: parseNum(rate),
      monthlyPayment: parseNum(monthly),
      maturityDate: maturity.trim() || undefined,
      note: note.trim() || undefined,
    });
  }

  const balanceNum = parseNum(balance);
  // 잔액은 "3,000만원" 같이 읽기 쉬운 단위를 보조 표기한다.
  const krwHint = balanceNum != null && balanceNum > 0 ? formatKoreanUnit(balanceNum) : null;

  return (
    <Dialog
      open={open}
      title={initial ? "대출 수정" : "대출 추가"}
      onClose={onClose}
      actionLabel="저장하기"
      onAction={handleSave}
    >
      <div className="flex flex-col gap-4 text-left">
        {/* 종류 */}
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold leading-[1.45] text-body-soft">종류</span>
          <div className="flex flex-wrap gap-1.5">
            {DEBT_CATEGORIES.map((c) => (
              <Chip key={c.key} selected={category === c.key} onClick={() => setCategory(c.key)}>
                {c.label}
              </Chip>
            ))}
          </div>
        </div>

        <TextInput label="대출명" value={name} onChange={setName} placeholder="예: 주택담보대출" />
        <TextInput label="금융기관" value={lender} onChange={setLender} placeholder="예: 국민은행" />

        <div className="flex flex-col gap-1">
          <TextInput
            label="잔액 (원)"
            value={balance}
            onChange={setBalance}
            inputMode="numeric"
            placeholder="0"
          />
          {krwHint && (
            <span className="text-[12px] font-semibold text-primary pl-1">{krwHint}</span>
          )}
        </div>

        <TextInput label="연 금리 (%)" value={rate} onChange={setRate} inputMode="decimal" placeholder="예: 3.5" />
        <TextInput label="월 상환액 (원)" value={monthly} onChange={setMonthly} inputMode="numeric" placeholder="0" />
        <TextInput label="만기일" value={maturity} onChange={setMaturity} type="date" placeholder="YYYY-MM-DD" />
        <TextInput label="비고" value={note} onChange={setNote} placeholder="메모 (선택)" />

        {error && <p className="text-[13px] text-up">{error}</p>}

        {initial && onDelete && (
          <button
            type="button"
            onClick={() => void onDelete(initial.id)}
            className="self-start text-[15px] font-semibold text-up hover:underline"
          >
            이 대출 삭제하기
          </button>
        )}
      </div>
    </Dialog>
  );
}
