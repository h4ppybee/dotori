import { describe, it, expect } from "vitest";
import { toKrw } from "@/lib/portfolio/fx";

describe("toKrw", () => {
  it("passes KRW through ignoring the rate", () => {
    expect(toKrw(1000, "KRW")).toBe(1000);
    expect(toKrw(1000, "KRW", 1350)).toBe(1000);
  });

  it("multiplies USD by the rate", () => {
    expect(toKrw(100, "USD", 1350)).toBe(135000);
  });

  it("throws for USD with a missing rate", () => {
    expect(() => toKrw(100, "USD")).toThrow();
  });

  it("throws for USD with a NaN rate", () => {
    expect(() => toKrw(100, "USD", NaN)).toThrow();
  });
});
