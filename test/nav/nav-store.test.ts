import { describe, it, expect, beforeEach } from "vitest";
import { useNavStore } from "@/stores/nav-store";

beforeEach(() => {
  useNavStore.setState({ lastMainTabPath: "/" });
});

describe("useNavStore", () => {
  it("초기값은 /", () => {
    expect(useNavStore.getState().lastMainTabPath).toBe("/");
  });
  it("setLastMainTab으로 경로를 저장한다", () => {
    useNavStore.getState().setLastMainTab("/plan");
    expect(useNavStore.getState().lastMainTabPath).toBe("/plan");
  });
});
