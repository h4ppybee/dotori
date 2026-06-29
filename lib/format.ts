/**
 * 공용 포맷 헬퍼. 순수 함수 — 부수 효과 없음.
 * 한국 증시 색 시맨틱: 상승/수익=up(빨강), 하락/손실=down(파랑), 보합=flat
 */

/** 원화 금액을 천 단위 콤마 + ₩ 기호로 포맷한다. */
export function formatKrw(n: number): string {
  const abs = Math.round(Math.abs(n));
  const formatted = abs.toLocaleString("ko-KR");
  if (n < 0) {
    return `-₩${formatted}`;
  }
  return `₩${formatted}`;
}

/** 달러 금액을 소수점 2자리 + $ 기호로 포맷한다. */
export function formatUsd(n: number): string {
  const abs = Math.abs(n).toFixed(2);
  const [intPart, decPart] = abs.split(".");
  const formatted = Number(intPart).toLocaleString("en-US");
  if (n < 0) {
    return `-$${formatted}.${decPart}`;
  }
  return `$${formatted}.${decPart}`;
}

/**
 * 금액을 한글 단위(억·만·원)로 읽기 쉽게 포맷한다. 입력 보조 표기용.
 * 예) 700000 → "70만원", 177930 → "17만 7,930원", 265000000 → "2억 6,500만원"
 */
export function formatKoreanUnit(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.floor(Math.abs(n));
  if (abs === 0) {
    return "0원";
  }
  const eok = Math.floor(abs / 100_000_000);
  const man = Math.floor((abs % 100_000_000) / 10_000);
  const rest = abs % 10_000;
  const parts: string[] = [];
  if (eok > 0) {
    parts.push(`${eok.toLocaleString("ko-KR")}억`);
  }
  if (man > 0) {
    parts.push(`${man.toLocaleString("ko-KR")}만`);
  }
  if (rest > 0) {
    parts.push(`${rest.toLocaleString("ko-KR")}`);
  }
  return `${sign}${parts.join(" ")}원`;
}

/** 수익률을 +/- 부호 포함 소수점 2자리로 포맷한다. */
export function formatPct(n: number): string {
  const sign = n < 0 ? "" : "+";
  return `${sign}${n.toFixed(2)}%`;
}

/** 수익률 부호 클래스: up(양수) | down(음수) | flat(0) */
export type SignClass = "up" | "down" | "flat";

export function signClass(n: number): SignClass {
  if (n > 0) {
    return "up";
  }
  if (n < 0) {
    return "down";
  }
  return "flat";
}
