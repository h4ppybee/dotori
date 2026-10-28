import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { useAppStore } from "@/stores/app-store";
import { db } from "@/lib/db/schema";
import { deriveKey, makeSalt, makeVerifier, checkVerifier, encrypt } from "@/lib/crypto/crypto";
import { QueryWrapper } from "@/test/utils/query";
import { putSettings, getSettings, saveBiometricConfig, getBiometricConfig } from "@/lib/db/local-store";

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
  localStorage.clear();
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

  it("모든 데이터를 삭제하면 마지막 시트 내보내기 기록도 지운다", async () => {
    useAppStore.setState({ lastSheetExport: { at: 1, status: "error", message: "이전 실패" } });
    await renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "모든 데이터 삭제" }));
    fireEvent.click(await screen.findByRole("button", { name: "삭제하기" }));
    await waitFor(() => expect(useAppStore.getState().lastSheetExport).toBeNull());
  });

  it("모든 데이터를 삭제하면 Face ID 등록 제안 기록(dotori.biometricOffered)도 지운다", async () => {
    localStorage.setItem("dotori.biometricOffered", "1");
    await renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "모든 데이터 삭제" }));
    fireEvent.click(await screen.findByRole("button", { name: "삭제하기" }));
    await waitFor(() => expect(localStorage.getItem("dotori.biometricOffered")).toBeNull());
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

  it("PIN을 바꾸면 Face ID 등록이 해제된다", async () => {
    const PIN = "135790";
    const salt = makeSalt();
    const oldKey = await deriveKey(PIN, salt);
    await putSettings({
      id: "app", kdfSalt: salt, verifier: await makeVerifier(oldKey),
      schemaVersion: 1, lockType: "pin",
    });
    await saveBiometricConfig({
      credentialId: "cred-1", prfSalt: "salt", secretEnc: "iv.ct", createdAt: 1,
    });

    await renderSettings();

    const current = await screen.findByLabelText("현재 PIN");
    fireEvent.change(current, { target: { value: PIN } });
    fireEvent.change(screen.getByLabelText("새 PIN"), { target: { value: "246810" } });
    fireEvent.change(screen.getByLabelText("새 PIN 확인"), { target: { value: "246810" } });
    fireEvent.click(screen.getByRole("button", { name: "PIN 바꾸기" }));

    expect(
      await screen.findByText(/Face ID는 다시 켜 주세요/, {}, { timeout: 15000 }),
    ).toBeInTheDocument();
    expect(await getBiometricConfig()).toBeUndefined();
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

describe("SettingsPage — 구글 시트 내보내기 패널", () => {
  beforeEach(async () => {
    await seedSessionKey();
    useAppStore.setState({ lastSheetExport: null });
  });

  it("미연결 상태에서 설정 폼과 연결하기 버튼을 보여준다", async () => {
    await renderSettings();
    expect(screen.getByRole("heading", { level: 2, name: "구글 시트 내보내기" })).toBeInTheDocument();
    expect(screen.getByLabelText("웹앱 URL")).toBeInTheDocument();
    expect(screen.getByLabelText("비밀키")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "연결하기" })).toBeInTheDocument();
  });

  it("잘못된 웹앱 URL로 연결하면 오류 문구를 보여준다", async () => {
    await renderSettings();
    fireEvent.change(screen.getByLabelText("웹앱 URL"), { target: { value: "https://example.com" } });
    fireEvent.change(screen.getByLabelText("비밀키"), { target: { value: "s3cret" } });
    fireEvent.click(screen.getByRole("button", { name: "연결하기" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("웹앱 URL 형식이 아니에요");
    });
  });

  it("올바른 URL로 연결하면 연결 상태로 바뀐다", async () => {
    await renderSettings();
    fireEvent.change(screen.getByLabelText("웹앱 URL"), {
      target: { value: "https://script.google.com/macros/s/abc123/exec" },
    });
    fireEvent.change(screen.getByLabelText("비밀키"), { target: { value: "s3cret" } });
    fireEvent.click(screen.getByRole("button", { name: "연결하기" }));
    expect(await screen.findByRole("button", { name: "지금 내보내기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "연결 해제하기" })).toBeInTheDocument();
  });

  it("'지금 내보내기' 결과가 skipped면 설정 조회를 무효화해 미연결 상태로 돌아간다", async () => {
    const key = useAppStore.getState().sessionKey!;
    await db.sheetExport.put({
      id: "sheet",
      webAppUrl: "https://script.google.com/macros/s/abc123/exec",
      secretEnc: await encrypt(key, "secret"),
      updatedAt: Date.now(),
    });

    await renderSettings();
    expect(await screen.findByRole("button", { name: "지금 내보내기" })).toBeInTheDocument();

    // 다른 곳(다른 기기·탭)에서 연결이 지워진 상황을 흉내낸다 — 쿼리 캐시는 아직 연결 상태.
    await db.sheetExport.delete("sheet");

    fireEvent.click(screen.getByRole("button", { name: "지금 내보내기" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "연결하기" })).toBeInTheDocument();
    });
  });
});
