import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { useAppStore } from "@/stores/app-store";
import { db } from "@/lib/db/schema";
import { deriveKey, makeSalt, makeVerifier, checkVerifier } from "@/lib/crypto/crypto";
import { QueryWrapper } from "@/test/utils/query";
import { putSettings, getSettings } from "@/lib/db/local-store";

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
  return render(
    <QueryWrapper>
      <SettingsPage />
    </QueryWrapper>,
  );
}

describe("SettingsPage — 섹션 제목 렌더링", () => {
  beforeEach(async () => {
    await seedSessionKey();
  });

  it("설정 페이지 헤딩이 렌더링된다", async () => {
    await renderSettings();
    expect(screen.getByRole("heading", { level: 1, name: "설정" })).toBeInTheDocument();
  });

  it("API 연동 섹션이 렌더링된다", async () => {
    await renderSettings();
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "API 연동" })).toBeInTheDocument();
    });
  });

  it("데이터 백업 섹션이 렌더링된다", async () => {
    await renderSettings();
    expect(screen.getByRole("heading", { level: 2, name: "데이터 백업" })).toBeInTheDocument();
  });

  it("PIN 설정 섹션이 렌더링된다", async () => {
    await renderSettings();
    expect(screen.getByRole("heading", { level: 2, name: "PIN 설정" })).toBeInTheDocument();
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

  it("PIN 설정하기 버튼이 렌더링된다", async () => {
    await renderSettings();
    expect(screen.getByRole("button", { name: "PIN 설정하기" })).toBeInTheDocument();
  });

  it("모든 데이터 삭제 버튼이 렌더링된다", async () => {
    await renderSettings();
    expect(screen.getByRole("button", { name: "모든 데이터 삭제" })).toBeInTheDocument();
  });

  it("프라이버시 섹션이 렌더링된다", async () => {
    await renderSettings();
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "프라이버시" })).toBeInTheDocument();
    });
  });

  it("기존 문자 비밀번호에서 PIN으로 전환하면 lockType과 verifier가 갱신된다", async () => {
    const PASSPHRASE = "기존비밀번호";
    const salt = makeSalt();
    const oldKey = await deriveKey(PASSPHRASE, salt);
    await putSettings({
      id: "app",
      kdfSalt: salt,
      verifier: await makeVerifier(oldKey),
      schemaVersion: 1,
    });

    await renderSettings();

    // lockType 없음 → 현재 수단은 문자 비밀번호 입력
    const current = await screen.findByLabelText("현재 비밀번호");
    fireEvent.change(current, { target: { value: PASSPHRASE } });
    fireEvent.change(screen.getByLabelText("새 PIN"), { target: { value: "135790" } });
    fireEvent.change(screen.getByLabelText("새 PIN 확인"), { target: { value: "135790" } });
    fireEvent.click(screen.getByRole("button", { name: "PIN 설정하기" }));

    await waitFor(async () => {
      const s = await getSettings();
      expect(s?.lockType).toBe("pin");
    }, { timeout: 15000 });

    // 새 verifier가 PIN 파생 키로 검증돼야 한다
    const s = await getSettings();
    const newKey = await deriveKey("135790", s!.kdfSalt);
    expect(await checkVerifier(newKey, s!.verifier)).toBe(true);
  });

  it("새 PIN이 숫자 6자리가 아니면 에러를 보여준다", async () => {
    const salt = makeSalt();
    const oldKey = await deriveKey("기존비밀번호", salt);
    await putSettings({
      id: "app",
      kdfSalt: salt,
      verifier: await makeVerifier(oldKey),
      schemaVersion: 1,
    });

    await renderSettings();

    const current = await screen.findByLabelText("현재 비밀번호");
    fireEvent.change(current, { target: { value: "기존비밀번호" } });
    fireEvent.change(screen.getByLabelText("새 PIN"), { target: { value: "123" } });
    fireEvent.change(screen.getByLabelText("새 PIN 확인"), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "PIN 설정하기" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByRole("alert").textContent).toContain("숫자 6자리");
  });

  it("금액 숨기기 토글을 켜면 Settings에 저장된다", async () => {
    await putSettings({ id: "app", kdfSalt: "s", verifier: "v", schemaVersion: 1 });
    await renderSettings();
    const sw = await screen.findByRole("switch", { name: "금액 숨기기" });
    await waitFor(() => expect(sw).not.toBeDisabled());
    fireEvent.click(sw);
    await waitFor(async () => {
      const s = await getSettings();
      expect(s?.privacyAmounts).toBe(true);
    });
  });
});
