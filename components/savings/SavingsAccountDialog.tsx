"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { TextInput } from "@/components/ui/TextInput";
import { Chip } from "@/components/ui/Chip";
import { formatKrw } from "@/lib/format";
import { SAVINGS_CATEGORIES } from "@/lib/savings/savings-service";
import type { SavingsAccount, SavingsCategory, Currency } from "@/lib/types";

interface SavingsAccountDialogProps {
  open: boolean;
  /** 편집 대상(있으면 수정, 없으면 추가). */
  initial?: SavingsAccount | null;
  /** 추가 시 기본 카테고리. */
  presetCategory?: SavingsCategory;
  /** USD 원화 환산 미리보기용 환율. */
  usdKrwRate?: number;
  onClose: () => void;
  onSave: (input: Partial<SavingsAccount> & { id?: string }) => void | Promise<void>;
  onDelete?: (id: string) => void | Promise<void>;
}

// 카테고리별 노출 필드.
function showsRate(c: SavingsCategory): boolean {
  return c === "DEPOSIT" || c === "CHECKING" || c === "BOND";
}
function showsMaturity(c: SavingsCategory): boolean {
  return c === "DEPOSIT" || c === "BOND";
}
function showsMonthly(c: SavingsCategory): boolean {
  return c === "DEPOSIT";
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
 * 저축 계좌 단건 추가/편집 다이얼로그.
 * 카테고리·통화에 따라 노출 필드가 달라진다. 저장은 부모가 주입한 onSave가 담당한다.
 */
export function SavingsAccountDialog({
  open,
  initial,
  presetCategory,
  usdKrwRate,
  onClose,
  onSave,
  onDelete,
}: SavingsAccountDialogProps) {
  // 초기값은 마운트 시 props에서 한 번 읽는다. 부모가 key로 리마운트해 재초기화한다
  // (열 때마다 key 변경 → 새 인스턴스). effect 동기화를 피해 cascading render를 막는다.
  const [category, setCategory] = useState<SavingsCategory>(
    initial?.category ?? presetCategory ?? "DEPOSIT",
  );
  const [name, setName] = useState(initial?.name ?? "");
  const [bank, setBank] = useState(initial?.bank ?? "");
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? "KRW");
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : "");
  const [rate, setRate] = useState(initial?.interestRate != null ? String(initial.interestRate) : "");
  const [maturity, setMaturity] = useState(initial?.maturityDate ?? "");
  const [monthly, setMonthly] = useState(
    initial?.monthlyDeposit != null ? String(initial.monthlyDeposit) : "",
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    if (name.trim() === "") {
      setError("계좌 이름을 입력해 주세요.");
      return;
    }
    const amountNum = parseNum(amount);
    if (amountNum == null) {
      setError("금액을 숫자로 입력해 주세요.");
      return;
    }
    void onSave({
      id: initial?.id,
      category,
      name: name.trim(),
      bank: bank.trim() || undefined,
      currency,
      amount: amountNum,
      interestRate: showsRate(category) ? parseNum(rate) : undefined,
      maturityDate: showsMaturity(category) && maturity.trim() ? maturity.trim() : undefined,
      monthlyDeposit: showsMonthly(category) ? parseNum(monthly) : undefined,
      note: note.trim() || undefined,
    });
  }

  const usdPreview =
    currency === "USD" && usdKrwRate != null && parseNum(amount) != null
      ? `≈ ${formatKrw((parseNum(amount) as number) * usdKrwRate)}`
      : null;

  return (
    <Dialog
      open={open}
      title={initial ? "계좌 수정" : "계좌 추가"}
      onClose={onClose}
      actionLabel="저장하기"
      onAction={handleSave}
    >
      <div className="flex flex-col gap-4 text-left">
        {/* 카테고리 */}
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold leading-[1.45] text-body-soft">구분</span>
          <div className="flex flex-wrap gap-1.5">
            {SAVINGS_CATEGORIES.map((c) => (
              <Chip key={c.key} selected={category === c.key} onClick={() => setCategory(c.key)}>
                {c.label}
              </Chip>
            ))}
          </div>
        </div>

        <TextInput label="이름" value={name} onChange={setName} placeholder="예: 뚜니 청년도약" />
        <TextInput label="은행" value={bank} onChange={setBank} placeholder="예: 우리" />

        {/* 통화 */}
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold leading-[1.45] text-body-soft">통화</span>
          <div className="flex gap-1.5">
            <Chip selected={currency === "KRW"} onClick={() => setCurrency("KRW")}>원화 KRW</Chip>
            <Chip selected={currency === "USD"} onClick={() => setCurrency("USD")}>달러 USD</Chip>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <TextInput
            label={currency === "USD" ? "금액 ($)" : "금액 (원)"}
            value={amount}
            onChange={setAmount}
            inputMode="decimal"
            placeholder="0"
          />
          {usdPreview && (
            <span className="text-[12px] font-normal text-muted tabular-nums pl-1">{usdPreview}</span>
          )}
        </div>

        {showsRate(category) && (
          <TextInput label="이율 (%)" value={rate} onChange={setRate} inputMode="decimal" placeholder="예: 1.7" />
        )}
        {showsMaturity(category) && (
          <TextInput label="만기일" value={maturity} onChange={setMaturity} type="date" placeholder="YYYY-MM-DD" />
        )}
        {showsMonthly(category) && (
          <TextInput label="월 불입액 (원)" value={monthly} onChange={setMonthly} inputMode="numeric" placeholder="0" />
        )}

        <TextInput label="비고" value={note} onChange={setNote} placeholder="메모 (선택)" />

        {error && <p className="text-[13px] text-up">{error}</p>}

        {initial && onDelete && (
          <button
            type="button"
            onClick={() => void onDelete(initial.id)}
            className="self-start text-[15px] font-semibold text-up hover:underline"
          >
            이 계좌 삭제하기
          </button>
        )}
      </div>
    </Dialog>
  );
}
