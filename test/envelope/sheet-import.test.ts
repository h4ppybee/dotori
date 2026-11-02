import { describe, it, expect } from "vitest";
import { parseEnvelopeSheet } from "@/lib/envelope/sheet-import";

// 가상 예시 그리드 — 실제 사용자 시트 값이 아니다.
// B~G열에 표, I~J열에 요약이 있는 모양을 흉내 낸다.
const grid: unknown[][] = [
  [],
  ["", "", "", "", "", "", "업데이트일"],
  ["", "태그", "은행", "항목", "금액", "비율", "비고", "", "은행A", 120],
  ["", "저축", "은행A", "청년도약적금", 50, 0.4, "", "", "합", "OK"],
  ["", "생활비", "은행B", "용돈", 20.5, 0.16, "매월 1일"],
  ["", "", "", "", "", ""],
  ["", "고정지출", "", "모임회비", "1,200", 0.1],
  ["", "", "", "", 1290.5, 1],
  ["", "투자", "은행A", "잘못된금액", "많이", 0],
  ["", "투자", "은행A", "음수", -3, 0],
  [],
  ["", "태그", "위치", "항목", "금액", "비율", "비고"],
  ["", "투자", "본인", "투자", 100, 0.5, "자동이체"],
  ["", "", "본인", "", 0, 0],
  ["", "생활비", "본인", "공동생활비", 40, 0.2],
  ["", "", "", "", 140, 1],
  [],
  ["", "통합"],
  ["", "고정지출", 10],
];

describe("parseEnvelopeSheet", () => {
  it("위 블록은 아내, 아래 블록은 남편으로 시트 순서대로 가져온다", () => {
    const r = parseEnvelopeSheet(grid);
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    expect(r.items).toEqual([
      { profile: "wife", tag: "저축", account: "은행A", name: "청년도약적금", amountKrw: 500_000 },
      { profile: "wife", tag: "생활비", account: "은행B", name: "용돈", amountKrw: 205_000, note: "매월 1일" },
      { profile: "wife", tag: "고정지출", account: "기타", name: "모임회비", amountKrw: 12_000_000 },
      { profile: "husband", tag: "투자", account: "본인", name: "투자", amountKrw: 1_000_000, note: "자동이체" },
      { profile: "husband", tag: "생활비", account: "본인", name: "공동생활비", amountKrw: 400_000 },
    ]);
  });

  it("헤더 라벨로 열을 찾아 열이 밀려도 동작한다", () => {
    const shifted: unknown[][] = [
      ["태그", "항목", "은행", "비고", "금액"],
      ["저축", "파킹통장", "은행A", "", 5.1],
      ["태그", "항목", "위치", "비고", "금액"],
      ["투자", "적립식", "본인", "메모", 30],
    ];
    const r = parseEnvelopeSheet(shifted);
    expect(r).toEqual({
      ok: true,
      items: [
        { profile: "wife", tag: "저축", account: "은행A", name: "파킹통장", amountKrw: 51_000 },
        { profile: "husband", tag: "투자", account: "본인", name: "적립식", amountKrw: 300_000, note: "메모" },
      ],
    });
  });

  it("표 헤더가 2개 미만이면 실패", () => {
    expect(parseEnvelopeSheet([["태그", "은행", "항목", "금액"], ["저축", "은행A", "적금", 10]]))
      .toEqual({ ok: false, message: "통장쪼개기 표를 찾지 못했어요." });
    expect(parseEnvelopeSheet([])).toEqual({ ok: false, message: "통장쪼개기 표를 찾지 못했어요." });
  });
});
