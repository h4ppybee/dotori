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
 * 예) 700000 → "70만원", 123450 → "12만 3,450원", 350000000 → "3억 5,000만원"
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

/** epoch ms → "YYYY.MM.DD HH:mm" (스냅샷 시점 등 로컬 시각 표기). */
export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** epoch ms → 로컬 날짜 "YYYY-MM-DD" (저장용 날짜 키). */
export function toLocalYmd(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 입력 금액 상한(1조 원). */
export const MAX_AMOUNT = 1_000_000_000_000;

/**
 * 금액 입력 문자열을 0 이상 정수(원)로. 쉼표·₩·공백·부호 등 숫자 외 문자는 모두 지우고,
 * 빈 문자열은 0, 상한(1조 원)을 넘으면 상한으로 자른다.
 */
export function parseAmount(s: string): number {
  const digits = s.replace(/[^\d]/g, "");
  if (digits === "") {
    return 0;
  }
  const n = Number(digits);
  if (!Number.isFinite(n) || n > MAX_AMOUNT) {
    return MAX_AMOUNT;
  }
  return n;
}
