import { describe, it, expect } from "vitest";
import { buildTrendData } from "@/lib/snapshot/trend";

const snap = (id: string, createdAt: number, netWorthKrw: number) => ({ id, createdAt, netWorthKrw });

describe("buildTrendData", () => {
  it("내림차순 입력을 시간순으로 뒤집고 직전 대비 변화량을 계산한다", () => {
    const out = buildTrendData([snap("c", 3, 130), snap("b", 2, 100), snap("a", 1, 120)]);
    expect(out.map((d) => d.id)).toEqual(["a", "b", "c"]);
    expect(out.map((d) => d.deltaKrw)).toEqual([null, -20, 30]); // 첫 기록은 직전 없음
  });

  it("display개 초과면 최신 display개만 표시하되, 잘린 직전 값으로 가장 오래된 막대도 계산한다", () => {
    // 25개(최신 createdAt=25). display=20 → 표시 6..25, 6의 delta는 5 기준으로 계산됨
    const desc = Array.from({ length: 25 }, (_, i) => snap(`s${25 - i}`, 25 - i, (25 - i) * 10));
    const out = buildTrendData(desc, 20);
    expect(out).toHaveLength(20);
    expect(out[0].id).toBe("s6");
    expect(out[0].deltaKrw).toBe(10); // 60 - 50
  });

  it("변화량 0은 0으로 유지한다(막대 생략은 렌더 판단)", () => {
    const out = buildTrendData([snap("b", 2, 100), snap("a", 1, 100)]);
    expect(out[1].deltaKrw).toBe(0);
  });
});
