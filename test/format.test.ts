import { describe, it, expect } from "vitest";
import { formatKrw, formatUsd, formatPct, signClass, formatKoreanUnit, formatDateTime, toLocalYmd } from "@/lib/format";

describe("formatKoreanUnit", () => {
  it("만 단위로 읽기 쉽게 표기한다", () => {
    expect(formatKoreanUnit(700000)).toBe("70만원");
    expect(formatKoreanUnit(5000000)).toBe("500만원");
    expect(formatKoreanUnit(12000000)).toBe("1,200만원");
  });

  it("만 미만 잔액과 억 단위를 함께 표기한다", () => {
    expect(formatKoreanUnit(123450)).toBe("12만 3,450원");
    expect(formatKoreanUnit(350000000)).toBe("3억 5,000만원");
    expect(formatKoreanUnit(368749202)).toBe("3억 6,874만 9,202원");
  });

  it("만 미만은 원만 표기하고, 0은 0원이다", () => {
    expect(formatKoreanUnit(9202)).toBe("9,202원");
    expect(formatKoreanUnit(0)).toBe("0원");
  });
});

describe("formatKrw", () => {
  it("천 단위 콤마와 ₩ 기호를 붙인다", () => {
    expect(formatKrw(1234567)).toBe("₩1,234,567");
  });

  it("음수도 올바르게 포맷한다", () => {
    expect(formatKrw(-500000)).toBe("-₩500,000");
  });

  it("0은 ₩0으로 표시한다", () => {
    expect(formatKrw(0)).toBe("₩0");
  });

  it("소수는 반올림한다", () => {
    expect(formatKrw(1000.9)).toBe("₩1,001");
  });
});

describe("formatUsd", () => {
  it("달러 기호와 소수점 2자리를 포함한다", () => {
    expect(formatUsd(1234.56)).toBe("$1,234.56");
  });

  it("음수도 올바르게 포맷한다", () => {
    expect(formatUsd(-99.5)).toBe("-$99.50");
  });

  it("0은 $0.00으로 표시한다", () => {
    expect(formatUsd(0)).toBe("$0.00");
  });
});

describe("formatPct", () => {
  it("양수에 + 부호를 붙인다", () => {
    expect(formatPct(2.5)).toBe("+2.50%");
  });

  it("음수에 - 부호를 붙인다", () => {
    expect(formatPct(-1.3)).toBe("-1.30%");
  });

  it("0은 +0.00%로 표시한다", () => {
    expect(formatPct(0)).toBe("+0.00%");
  });

  it("소수점 2자리를 유지한다", () => {
    expect(formatPct(10)).toBe("+10.00%");
  });
});

describe("signClass", () => {
  it("양수는 up을 반환한다", () => {
    expect(signClass(1)).toBe("up");
  });

  it("음수는 down을 반환한다", () => {
    expect(signClass(-0.1)).toBe("down");
  });

  it("0은 flat을 반환한다", () => {
    expect(signClass(0)).toBe("flat");
  });

  it("아주 작은 양수도 up을 반환한다", () => {
    expect(signClass(0.001)).toBe("up");
  });

  it("아주 작은 음수도 down을 반환한다", () => {
    expect(signClass(-0.001)).toBe("down");
  });
});

describe("formatDateTime", () => {
  it("formatDateTime: epoch ms → YYYY.MM.DD HH:mm", () => {
    // 로컬 타임존 기준 — 고정 시각으로 구성
    const d = new Date(2026, 6, 2, 14, 5); // 2026-07-02 14:05
    expect(formatDateTime(d.getTime())).toBe("2026.07.02 14:05");
  });
});

describe("toLocalYmd", () => {
  it("로컬 날짜를 YYYY-MM-DD로 만든다", () => {
    expect(toLocalYmd(new Date(2026, 9, 4, 23, 59).getTime())).toBe("2026-10-04");
  });
});
