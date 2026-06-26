import { describe, it, expect } from "vitest";
import { isAllowedOrigin } from "../src/config";

describe("isAllowedOrigin", () => {
  const allow = isAllowedOrigin([
    "http://localhost:3000",
    "https://dotori-h4ppy-bee.vercel.app",
  ]);
  it("정확히 일치하는 Origin 허용", () => {
    expect(allow("http://localhost:3000")).toBe(true);
    expect(allow("https://dotori-h4ppy-bee.vercel.app")).toBe(true);
  });
  it("프리뷰 와일드카드(정규식) 허용", () => {
    expect(allow("https://dotori-abc123-h4ppy-bee.vercel.app")).toBe(true);
  });
  it("관계없는 Origin 거부", () => {
    expect(allow("https://evil.example.com")).toBe(false);
  });
});
