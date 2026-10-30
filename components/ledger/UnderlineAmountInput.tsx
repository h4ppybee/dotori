"use client";

import { useState } from "react";
import { parseAmount } from "@/lib/format";

interface UnderlineAmountInputProps {
  /** 접근성 라벨(카테고리 이름). */
  label: string;
  /** 원 단위 0 이상 정수. */
  value: number;
  onChange: (value: number) => void;
}

/** 0은 빈칸, 나머지는 천 단위 쉼표. */
function formatDisplay(value: number): string {
  return value > 0 ? value.toLocaleString("ko-KR") : "";
}

/**
 * 밑줄형 금액 입력칸 — 테두리 상자 없이 아랫줄만 둔다(가계부 편집 모드).
 * 포커스 중에는 쉼표 없이 숫자만 보여 iOS에서 caret이 튀지 않게 하고, blur 때 천 단위 쉼표로 포맷한다.
 */
export function UnderlineAmountInput({ label, value, onChange }: UnderlineAmountInputProps) {
  // 포커스 중 입력 문자열(숫자만). null이면 포커스 밖 — value를 포맷해 보여 준다.
  const [editingText, setEditingText] = useState<string | null>(null);

  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      placeholder="0"
      value={editingText ?? formatDisplay(value)}
      onFocus={() => setEditingText(value > 0 ? String(value) : "")}
      onBlur={() => setEditingText(null)}
      onChange={(e) => {
        const n = parseAmount(e.target.value);
        setEditingText(n > 0 ? String(n) : "");
        onChange(n);
      }}
      className="w-[128px] rounded-none border-0 border-b-[1.5px] border-surface-strong bg-transparent px-0 py-1 text-right text-[15px] font-semibold leading-[1.4] tabular-nums text-ink outline-none transition-colors duration-150 placeholder:text-muted-soft focus:border-primary"
    />
  );
}
