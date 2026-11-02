import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryWrapper } from "@/test/utils/query";
import { useAppStore } from "@/stores/app-store";
import { db } from "@/lib/db/schema";
import { deriveKey, makeSalt } from "@/lib/crypto/crypto";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

beforeEach(async () => {
  const key = await deriveKey("test-pp", makeSalt());
  useAppStore.setState({ locked: false, sessionKey: key });
});

afterEach(async () => {
  await db.delete();
  await db.open();
  useAppStore.setState({ locked: true, sessionKey: null });
});

// 탭을 처음 열 때 데이터가 오기 전 빈 상태가 한 번 그려졌다가 바뀌면 깜박임으로 보인다.
// 첫 렌더(데이터 없음)에는 빈 상태를 그리지 않고, 데이터가 비어 있다고 확인된 뒤에만 그려야 한다.
describe("첫 렌더 깜박임 방지", () => {
  it("홈: 목표를 불러오기 전에는 목표 빈 상태도 0원도 그리지 않는다", async () => {
    const { default: HomePage } = await import("@/app/page");
    render(<QueryWrapper><HomePage /></QueryWrapper>);
    expect(screen.queryByRole("button", { name: /목표/ })).not.toBeInTheDocument();
    expect(screen.queryByText("0원")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /목표/ })).toBeInTheDocument();
  });

  it("계획: 항목을 불러오기 전에는 '아직 항목이 없어요'를 그리지 않는다", async () => {
    const { default: PlanPage } = await import("@/app/plan/page");
    render(<QueryWrapper><PlanPage /></QueryWrapper>);
    expect(screen.queryByText(/아직 항목이 없어요/)).not.toBeInTheDocument();
    expect((await screen.findAllByText(/아직 항목이 없어요/)).length).toBeGreaterThan(0);
  });
});
