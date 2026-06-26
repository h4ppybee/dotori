import { SECTOR_SEED } from "@/lib/sector/seed";

export const UNCLASSIFIED = "미분류";

/**
 * 기본 섹터 목록 — 한국 개인투자자에게 익숙한 테마형 분류.
 * 섹터 선택 드롭다운의 기본 후보로 쓴다. 사용자가 만든 섹터(sectorOverrides)는
 * 호출 측에서 합쳐 확장하며, 목록에 없는 분류는 "직접 입력"으로 추가한다.
 */
export const KNOWN_SECTORS: string[] = [
  "반도체",
  "인터넷",
  "2차전지",
  "자동차",
  "바이오",
  "화학",
  "게임/엔터",
  "금융",
  "통신",
  "소비재",
  "에너지",
  "원자재",
  // 광범위 지수 추종 ETF — 추종 지수별로 분류한다.
  "나스닥100",
  "S&P500",
  "코스피",
];

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
