import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BiometricPanel } from "@/components/settings/BiometricPanel";
import { db } from "@/lib/db/schema";
import { putSettings, getBiometricConfig } from "@/lib/db/local-store";
import { deriveKey, makeSalt, makeVerifier } from "@/lib/crypto/crypto";
import { installFakeWebAuthn, uninstallFakeWebAuthn } from "@/test/biometric/fake-webauthn";
import { startEnrollment } from "@/lib/biometric/biometric-unlock";
import { QueryWrapper } from "@/test/utils/query";
import { useAppStore } from "@/stores/app-store";

afterEach(async () => {
  uninstallFakeWebAuthn();
  localStorage.clear();
  await db.delete();
  await db.open();
  useAppStore.setState({ locked: true, sessionKey: null });
});

// BiometricPanel의 useSettings/useBiometricConfig는 locked 상태에서는 비활성이라
// 설정 화면처럼 잠금 해제 상태(세션 키 보유)를 흉내낸다.
async function seedPin(pin: string) {
  const salt = makeSalt();
  const key = await deriveKey(pin, salt);
  await putSettings({
    id: "app",
    kdfSalt: salt,
    verifier: await makeVerifier(key),
    schemaVersion: 1,
    lockType: "pin",
  });
  useAppStore.setState({ locked: false, sessionKey: key });
}

function renderPanel() {
  return render(
    <QueryWrapper>
      <BiometricPanel />
    </QueryWrapper>,
  );
}

describe("BiometricPanel", () => {
  it("지원하지 않는 기기에서는 렌더링하지 않는다", async () => {
    installFakeWebAuthn({ available: false });
    const { container } = renderPanel();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("PIN 확인 후 Face ID 켜기를 누르면 등록한다", async () => {
    installFakeWebAuthn();
    await seedPin("135790");
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("switch", { name: "Face ID로 잠금 해제" }));
    await user.type(await screen.findByLabelText("현재 PIN"), "135790");
    await user.click(screen.getByRole("button", { name: "PIN 확인" }));
    await user.click(await screen.findByRole("button", { name: "Face ID 켜기" }));
    await waitFor(async () => expect(await getBiometricConfig()).toBeDefined(), { timeout: 15000 });
  });

  it("틀린 PIN이면 1단계에서 오류를 보여주고 등록하지 않는다", async () => {
    installFakeWebAuthn();
    await seedPin("135790");
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("switch", { name: "Face ID로 잠금 해제" }));
    await user.type(await screen.findByLabelText("현재 PIN"), "000000");
    await user.click(screen.getByRole("button", { name: "PIN 확인" }));
    expect(
      await screen.findByText("PIN이 일치하지 않아요.", {}, { timeout: 15000 }),
    ).toBeInTheDocument();
    expect(await getBiometricConfig()).toBeUndefined();
    // Face ID 켜기 버튼(2단계)은 아직 나타나지 않아야 한다
    expect(screen.queryByRole("button", { name: "Face ID 켜기" })).not.toBeInTheDocument();
  });

  it("끄면 등록을 지운다", async () => {
    installFakeWebAuthn();
    await seedPin("135790");
    await startEnrollment("135790");
    const user = userEvent.setup();
    renderPanel();
    const sw = await screen.findByRole("switch", { name: "Face ID로 잠금 해제" });
    await waitFor(() => expect(sw).toHaveAttribute("aria-checked", "true"));
    await user.click(sw);
    await waitFor(async () => expect(await getBiometricConfig()).toBeUndefined());
  });

  it("등록 전(미확정) 상태에서 스위치를 다시 누르면 폼만 닫고 등록을 건드리지 않는다", async () => {
    installFakeWebAuthn();
    await seedPin("135790");
    const user = userEvent.setup();
    renderPanel();
    const sw = await screen.findByRole("switch", { name: "Face ID로 잠금 해제" });
    await user.click(sw); // 아직 등록 안 한 상태에서 켜짐 — asking 시작
    await screen.findByLabelText("현재 PIN");

    await user.click(sw); // 다시 눌러서 끔 — enabled=false이므로 폼만 닫혀야 한다

    expect(screen.queryByLabelText("현재 PIN")).not.toBeInTheDocument();
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(await getBiometricConfig()).toBeUndefined();
  });

  it("끄기에 실패하면 오류를 보여주고 등록은 그대로 남는다", async () => {
    installFakeWebAuthn();
    await seedPin("135790");
    await startEnrollment("135790");
    const deleteSpy = vi.spyOn(db.biometric, "delete").mockRejectedValueOnce(new Error("boom"));
    const user = userEvent.setup();
    renderPanel();
    const sw = await screen.findByRole("switch", { name: "Face ID로 잠금 해제" });
    await waitFor(() => expect(sw).toHaveAttribute("aria-checked", "true"));

    await user.click(sw);

    expect(await screen.findByText("Face ID를 끄지 못했어요. 다시 시도해 주세요.")).toBeInTheDocument();
    expect(await getBiometricConfig()).toBeDefined();
    deleteSpy.mockRestore();
  });

  it("PIN 확인만으로는 패스키를 만들지 않는다", async () => {
    const fake = installFakeWebAuthn();
    await seedPin("135790");
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("switch", { name: "Face ID로 잠금 해제" }));
    await user.type(await screen.findByLabelText("현재 PIN"), "135790");
    await user.click(screen.getByRole("button", { name: "PIN 확인" }));
    await screen.findByRole("button", { name: "Face ID 켜기" });
    expect(fake.create).not.toHaveBeenCalled();
  });

  it("생성 시점에 PRF 결과가 없으면 한 번 더 확인해 등록을 마친다(needs-confirm)", async () => {
    installFakeWebAuthn({ prfOnCreate: "enabled-only" });
    await seedPin("135790");
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("switch", { name: "Face ID로 잠금 해제" }));
    await user.type(await screen.findByLabelText("현재 PIN"), "135790");
    await user.click(screen.getByRole("button", { name: "PIN 확인" }));
    await user.click(await screen.findByRole("button", { name: "Face ID 켜기" }));

    await user.click(await screen.findByRole("button", { name: "한 번 더 확인해 주세요" }));

    await waitFor(async () => expect(await getBiometricConfig()).toBeDefined(), { timeout: 15000 });
  });

  it("문자 비밀번호 사용자에게는 '비밀번호 확인' 버튼을 보여준다", async () => {
    installFakeWebAuthn();
    const salt = makeSalt();
    const key = await deriveKey("기존비밀번호", salt);
    await putSettings({ id: "app", kdfSalt: salt, verifier: await makeVerifier(key), schemaVersion: 1 });
    useAppStore.setState({ locked: false, sessionKey: key });
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("switch", { name: "Face ID로 잠금 해제" }));
    expect(await screen.findByLabelText("현재 비밀번호")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "비밀번호 확인" })).toBeInTheDocument();
  });
});
