"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { TextInput } from "@/components/ui/TextInput";
import { formatKrw, formatPct } from "@/lib/format";
import type { CoinHolding } from "@/lib/types";

interface CoinAccountDialogProps {
  open: boolean;
  initial?: CoinHolding | null;
  onClose: () => void;
  onSave: (input: Partial<CoinHolding> & { id?: string }) => void | Promise<void>;
  onDelete?: (id: string) => void | Promise<void>;
}

function parseNum(s: string): number | undefined {
  const cleaned = s.replace(/,/g, "").trim();
  if (cleaned === "") {
    return undefined;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * 코인 보유 단건 추가/편집 다이얼로그. 수량×단가로 평가금·수익률을 미리보기로 보여준다.
 * 부모가 key로 리마운트해 초기화한다.
 */
export function CoinAccountDialog({ open, initial, onClose, onSave, onDelete }: CoinAccountDialogProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [exchange, setExchange] = useState(initial?.exchange ?? "");
  const [quantity, setQuantity] = useState(initial?.quantity != null ? String(initial.quantity) : "");
  const [buyPrice, setBuyPrice] = useState(initial?.buyPrice != null ? String(initial.buyPrice) : "");
  const [currentPrice, setCurrentPrice] = useState(initial?.currentPrice != null ? String(initial.currentPrice) : "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [error, setError] = useState<string | null>(null);

  const qty = parseNum(quantity) ?? 0;
  const buy = parseNum(buyPrice) ?? 0;
  const cur = parseNum(currentPrice) ?? 0;
  const cost = qty * buy;
  const value = qty * cur;
  const pnl = value - cost;
  const ret = cost > 0 ? (pnl / cost) * 100 : 0;
  const hasPreview = qty > 0 && cur > 0;

  function handleSave() {
    if (name.trim() === "") {
      setError("종목 이름을 입력해 주세요.");
      return;
    }
    const q = parseNum(quantity);
    const b = parseNum(buyPrice);
    const c = parseNum(currentPrice);
    if (q == null || b == null || c == null) {
      setError("수량·매수가·현재가를 숫자로 입력해 주세요.");
      return;
    }
    void onSave({
      id: initial?.id,
      name: name.trim(),
      exchange: exchange.trim() || undefined,
      quantity: q,
      buyPrice: b,
      currentPrice: c,
      note: note.trim() || undefined,
    });
  }

  return (
    <Dialog
      open={open}
      title={initial ? "코인 수정" : "코인 추가"}
      onClose={onClose}
      actionLabel="저장하기"
      onAction={handleSave}
    >
      <div className="flex flex-col gap-4 text-left">
        <TextInput label="종목" value={name} onChange={setName} placeholder="예: 비트코인" />
        <TextInput label="거래소" value={exchange} onChange={setExchange} placeholder="예: 업비트" />
        <TextInput label="수량" value={quantity} onChange={setQuantity} inputMode="decimal" placeholder="0" />
        <TextInput label="매수가 (원)" value={buyPrice} onChange={setBuyPrice} inputMode="decimal" placeholder="0" />
        <TextInput label="현재가 (원)" value={currentPrice} onChange={setCurrentPrice} inputMode="decimal" placeholder="0" />

        {hasPreview && (
          <div className="rounded-[12px] bg-surface-soft px-4 py-3 text-[13px] text-body">
            평가금 <span className="font-semibold tabular-nums text-ink">{formatKrw(value)}</span>
            <span className="mx-1.5 text-muted-soft">·</span>
            수익률 <span className={`font-semibold tabular-nums ${pnl > 0 ? "text-up" : pnl < 0 ? "text-down" : "text-muted"}`}>{formatPct(ret)}</span>
          </div>
        )}

        <TextInput label="비고" value={note} onChange={setNote} placeholder="메모 (선택)" />

        {error && <p className="text-[13px] text-up">{error}</p>}

        {initial && onDelete && (
          <button
            type="button"
            onClick={() => void onDelete(initial.id)}
            className="self-start text-[15px] font-semibold text-up hover:underline"
          >
            이 코인 삭제하기
          </button>
        )}
      </div>
    </Dialog>
  );
}
