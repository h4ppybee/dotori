import { describe, it, expect } from "vitest";
import { resolveSector } from "@/lib/sector/sector-map";

describe("sector-map", () => {
  it("resolves from seed", () => {
    expect(resolveSector("005930", {})).toBe("반도체"); // 삼성전자
  });
  it("override beats seed", () => {
    expect(resolveSector("005930", { "005930": "전자" })).toBe("전자");
  });
  it("falls back to 미분류", () => {
    expect(resolveSector("UNKNOWN", {})).toBe("미분류");
  });
});
