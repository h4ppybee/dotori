import { SECTOR_SEED } from "@/lib/sector/seed";

export const UNCLASSIFIED = "미분류";

/**
 * 주어진 종목 코드(symbol)의 섹터를 결정한다.
 * 우선순위: overrides > seed > 미분류(UNCLASSIFIED)
 *
 * @param symbol   종목 코드 (예: "005930")
 * @param overrides IndexedDB의 sectorOverrides에서 로드한 재정의 맵 (호출자가 주입)
 * @returns 섹터 문자열
 */
export function resolveSector(
  symbol: string,
  overrides: Record<string, string>,
): string {
  if (overrides[symbol]) {
    return overrides[symbol];
  }
  if (SECTOR_SEED[symbol]) {
    return SECTOR_SEED[symbol];
  }
  return UNCLASSIFIED;
}
