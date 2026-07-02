import { formatKrw, signClass } from "@/lib/format";

interface PnlTextProps {
  /** 손익 금액(원). 부호로 +/- 와 색을 결정한다. */
  amountKrw: number;
  /** 수익률(%). 괄호 안에 절댓값으로 표기한다(부호는 금액이 전달). */
  returnPct: number;
  className?: string;
}

/** 부호 클래스 → 텍스트 색 (상승/수익=빨강, 하락/손실=파랑, 보합=muted). */
function signTextClass(n: number): string {
  const sign = signClass(n);
  if (sign === "up") {
    return "text-up";
  }
  if (sign === "down") {
    return "text-down";
  }
  return "text-muted";
}

/** 양수면 + 접두사를 붙인 원화 표기(음수의 - 는 formatKrw가 붙인다). */
function signedKrw(n: number): string {
  if (n > 0) {
    return `+${formatKrw(n)}`;
  }
  return formatKrw(n);
}

/**
 * 손익 금액 + 수익률을 부호 색 텍스트로 표기한다(배지 아님).
 * 예) "+₩100,000 (10.02%)" — 주식탭 종목 행과 동일한 표기.
 * 한국 증시 색: 수익=빨강(up), 손실=파랑(down), 보합=muted.
 */
export function PnlText({ amountKrw, returnPct, className = "" }: PnlTextProps) {
  return (
    <span className={`tabular-nums ${signTextClass(amountKrw)} ${className}`}>
      {signedKrw(amountKrw)} ({Math.abs(returnPct).toFixed(2)}%)
    </span>
  );
}
