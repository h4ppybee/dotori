import type { Currency } from "@/lib/types";

/**
 * 금액을 원화(KRW)로 환산한다.
 *
 * KRW는 그대로 통과시키고, USD는 환율을 곱한다.
 * USD인데 환율이 없거나 유한하지 않으면 예외를 던진다.
 */
export function toKrw(amount: number, currency: Currency, usdKrw?: number): number {
  if (currency === "KRW") {
    return amount;
  }
  if (usdKrw == null || !Number.isFinite(usdKrw)) {
    throw new Error("USD 환산에는 환율이 필요해요");
  }
  return amount * usdKrw;
}
