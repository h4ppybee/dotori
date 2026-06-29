import { describe, it, expect } from "vitest";
import {
  resolveActiveMain,
  resolveActiveSub,
  isAssetsRoute,
  isDetailRoute,
} from "@/lib/nav/active";

describe("resolveActiveMain", () => {
  it("홈은 정확히 / 일 때만", () => {
    expect(resolveActiveMain("/")).toBe("home");
    expect(resolveActiveMain("/plan")).toBe("plan");
    expect(resolveActiveMain("/ledger")).toBe("ledger");
    expect(resolveActiveMain("/settings")).toBe("settings");
  });
  it("/assets 이하 모든 경로는 자산 탭 활성", () => {
    expect(resolveActiveMain("/assets")).toBe("assets");
    expect(resolveActiveMain("/assets/stocks")).toBe("assets");
    expect(resolveActiveMain("/assets/crypto")).toBe("assets");
  });
  it("매칭 없으면 null", () => {
    expect(resolveActiveMain("/holdings/123")).toBeNull();
  });
});

describe("resolveActiveSub — 가장 긴 prefix 우선", () => {
  it("/assets 는 overview", () => {
    expect(resolveActiveSub("/assets")).toBe("overview");
  });
  it("/assets/stocks 는 overview가 아니라 stocks", () => {
    expect(resolveActiveSub("/assets/stocks")).toBe("stocks");
    expect(resolveActiveSub("/assets/savings")).toBe("savings");
    expect(resolveActiveSub("/assets/pension")).toBe("pension");
    expect(resolveActiveSub("/assets/crypto")).toBe("crypto");
  });
  it("하위 경로(/assets/stocks/AAPL)도 stocks로 잡힌다", () => {
    expect(resolveActiveSub("/assets/stocks/AAPL")).toBe("stocks");
  });
  it("자산 경로가 아니면 null", () => {
    expect(resolveActiveSub("/settings")).toBeNull();
  });
});

describe("경로 분류", () => {
  it("isAssetsRoute", () => {
    expect(isAssetsRoute("/assets")).toBe(true);
    expect(isAssetsRoute("/assets/stocks")).toBe(true);
    expect(isAssetsRoute("/plan")).toBe(false);
  });
  it("isDetailRoute(holdings)", () => {
    expect(isDetailRoute("/holdings")).toBe(true);
    expect(isDetailRoute("/holdings/new")).toBe(true);
    expect(isDetailRoute("/holdings/abc")).toBe(true);
    expect(isDetailRoute("/assets/stocks")).toBe(false);
  });
  it("isDetailRoute는 세그먼트 경계를 지킨다(/holdingsX는 false)", () => {
    expect(isDetailRoute("/holdingsX")).toBe(false);
  });
});
