import { describe, it, expect } from "vitest";
import { resolveNavDirection } from "@/lib/nav/direction";

describe("resolveNavDirection", () => {
  it("오른쪽 메인 탭으로 가면 forward", () => {
    expect(resolveNavDirection("/", "/assets")).toBe("forward");
    expect(resolveNavDirection("/plan", "/settings")).toBe("forward");
  });
  it("왼쪽 메인 탭으로 가면 backward", () => {
    expect(resolveNavDirection("/settings", "/")).toBe("backward");
    expect(resolveNavDirection("/assets/crypto", "/")).toBe("backward");
  });
  it("같은 메인 탭 안에서는 서브탭 순서로 판단한다", () => {
    expect(resolveNavDirection("/assets", "/assets/pension")).toBe("forward");
    expect(resolveNavDirection("/assets/crypto/manage", "/assets/stocks")).toBe("backward");
    expect(resolveNavDirection("/plan/realty", "/plan")).toBe("backward");
  });
  it("같은 위치(하위 화면)·판단 불가 경로는 forward", () => {
    expect(resolveNavDirection("/assets/stocks", "/assets/stocks/manage")).toBe("forward");
    expect(resolveNavDirection("/holdings/1", "/assets/stocks")).toBe("forward");
  });
  it("가계부 서브탭(월별 → 분석)은 순서대로 판단한다", () => {
    expect(resolveNavDirection("/ledger", "/ledger/analysis")).toBe("forward");
    expect(resolveNavDirection("/ledger/analysis", "/ledger")).toBe("backward");
  });
  it("계획 → 가계부는 오른쪽 메인 탭이라 forward", () => {
    expect(resolveNavDirection("/plan", "/ledger")).toBe("forward");
    expect(resolveNavDirection("/ledger/analysis", "/plan/realty")).toBe("backward");
  });
});
