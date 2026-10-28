import { describe, it, expect, afterEach } from "vitest";
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
});
