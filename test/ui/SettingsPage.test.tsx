import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useAppStore } from "@/stores/app-store";
import { db } from "@/lib/db/schema";
import { deriveKey, makeSalt } from "@/lib/crypto/crypto";

// next/navigation mock
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

async function seedSessionKey() {
  const key = await deriveKey("test-pp", makeSalt());
  useAppStore.setState({ locked: false, sessionKey: key });
  return key;
}

afterEach(async () => {
  await db.delete();
  await db.open();
  useAppStore.setState({ locked: true, sessionKey: null, lastRefreshAt: null });
  vi.clearAllMocks();
});

// 설정 페이지는 "use client" 클라이언트 컴포넌트이므로 동적 import 없이 직접 사용
async function renderSettings() {
  const { default: SettingsPage } = await import("@/app/settings/page");
  return render(<SettingsPage />);
}

describe("SettingsPage — 섹션 제목 렌더링", () => {
  beforeEach(async () => {
    await seedSessionKey();
  });

  it("설정 페이지 헤딩이 렌더링된다", async () => {
    await renderSettings();
    expect(screen.getByRole("heading", { level: 1, name: "설정" })).toBeInTheDocument();
  });

  it("토스 API 프리셋 섹션이 렌더링된다", async () => {
    await renderSettings();
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "토스 API 프리셋" })).toBeInTheDocument();
    });
  });

  it("데이터 백업 섹션이 렌더링된다", async () => {
    await renderSettings();
    expect(screen.getByRole("heading", { level: 2, name: "데이터 백업" })).toBeInTheDocument();
  });

  it("패스프레이즈 변경 섹션이 렌더링된다", async () => {
    await renderSettings();
    expect(screen.getByRole("heading", { level: 2, name: "패스프레이즈 변경" })).toBeInTheDocument();
  });

  it("로컬 데이터 전체 삭제 섹션이 렌더링된다", async () => {
    await renderSettings();
    expect(screen.getByRole("heading", { level: 2, name: "로컬 데이터 전체 삭제" })).toBeInTheDocument();
  });

  it("내보내기 버튼이 렌더링된다", async () => {
    await renderSettings();
    expect(screen.getByRole("button", { name: "내보내기" })).toBeInTheDocument();
  });

  it("불러오기 버튼이 렌더링된다", async () => {
    await renderSettings();
    expect(screen.getByRole("button", { name: "불러오기" })).toBeInTheDocument();
  });

  it("변경하기 버튼이 렌더링된다", async () => {
    await renderSettings();
    expect(screen.getByRole("button", { name: "변경하기" })).toBeInTheDocument();
  });

  it("모든 데이터 삭제 버튼이 렌더링된다", async () => {
    await renderSettings();
    expect(screen.getByRole("button", { name: "모든 데이터 삭제" })).toBeInTheDocument();
  });
});
