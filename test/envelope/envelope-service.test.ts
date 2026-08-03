import { describe, it, expect } from "vitest";
import { buildEnvelopeView } from "@/lib/envelope/envelope-service";
import type { EnvelopeItem } from "@/lib/types";

const mk = (o: Partial<EnvelopeItem>): EnvelopeItem => ({
  id: o.id ?? Math.random().toString(36).slice(2),
  profile: o.profile ?? "wife",
  tag: o.tag ?? "저축",
  account: o.account ?? "신한",
  name: o.name ?? "항목",
  amountKrw: o.amountKrw ?? 0,
  sortOrder: o.sortOrder ?? 0,
  createdAt: 0,
  note: o.note,
});

const items: EnvelopeItem[] = [
  mk({ profile: "wife", tag: "저축", account: "신한", amountKrw: 700_000, sortOrder: 0 }),
  mk({ profile: "wife", tag: "생활비", account: "하나당근", amountKrw: 300_000, sortOrder: 1 }),
  mk({ profile: "husband", tag: "투자", account: "토스", amountKrw: 1_200_000, sortOrder: 0 }),
];

describe("buildEnvelopeView", () => {
  it("프로필 뷰: 총액·비율·항목 rows(sortOrder 순)", () => {
    const v = buildEnvelopeView({ items, scope: "wife" });
    expect(v.totalKrw).toBe(1_000_000);
    expect(v.rows.map((r) => r.item.tag)).toEqual(["저축", "생활비"]);
    expect(v.rows[0].ratioPct).toBe(70);
    expect(v.byProfile).toEqual([]);
  });

  it("태그/통장 롤업: 금액 내림차순, 키 tiebreaker", () => {
    const v = buildEnvelopeView({ items, scope: "wife" });
    expect(v.byTag[0]).toMatchObject({ key: "저축", amountKrw: 700_000, ratioPct: 70 });
    expect(v.byTag[1]).toMatchObject({ key: "생활비", amountKrw: 300_000 });
    expect(v.byAccount.map((e) => e.key)).toEqual(["신한", "하나당근"]);
  });

  it("통합: 전체 합산 + byProfile, rows는 아내→남편 순 전체 항목", () => {
    const v = buildEnvelopeView({ items, scope: "combined" });
    expect(v.totalKrw).toBe(2_200_000);
    expect(v.byProfile.find((e) => e.key === "husband")?.amountKrw).toBe(1_200_000);
    expect(v.byTag.map((e) => e.key)).toEqual(["투자", "저축", "생활비"]);
    // 아내 항목 먼저(sortOrder 순), 그 다음 남편 항목
    expect(v.rows.map((r) => r.item.profile)).toEqual(["wife", "wife", "husband"]);
    expect(v.rows.map((r) => r.item.tag)).toEqual(["저축", "생활비", "투자"]);
    // ratioPct는 combined 총액 2,200,000 기준
    expect(v.rows.find((r) => r.item.tag === "투자")!.ratioPct).toBeCloseTo(
      (1_200_000 / 2_200_000) * 100,
    );
  });

  it("프로필 뷰 rows는 해당 프로필 항목만 sortOrder 순", () => {
    const v = buildEnvelopeView({ items, scope: "wife" });
    expect(v.rows).toHaveLength(2);
    expect(v.rows.map((r) => r.item.tag)).toEqual(["저축", "생활비"]);
  });

  it("빈 목록: total 0, 배열 비고 ratio 0", () => {
    const v = buildEnvelopeView({ items: [], scope: "wife" });
    expect(v.totalKrw).toBe(0);
    expect(v.byTag).toEqual([]);
    expect(v.rows).toEqual([]);
  });

  it("total 0(0원 항목만): ratio 0, 그룹은 표시", () => {
    const zero = [mk({ profile: "wife", tag: "저축", amountKrw: 0 })];
    const v = buildEnvelopeView({ items: zero, scope: "wife" });
    expect(v.totalKrw).toBe(0);
    expect(v.byTag).toHaveLength(1);
    expect(v.byTag[0]).toMatchObject({ key: "저축", amountKrw: 0, ratioPct: 0 });
  });

  it("동점 금액은 키 오름차순", () => {
    const tie = [
      mk({ profile: "wife", tag: "나", account: "x", amountKrw: 100 }),
      mk({ profile: "wife", tag: "가", account: "y", amountKrw: 100 }),
    ];
    const v = buildEnvelopeView({ items: tie, scope: "wife" });
    expect(v.byTag.map((e) => e.key)).toEqual(["가", "나"]);
  });
});
