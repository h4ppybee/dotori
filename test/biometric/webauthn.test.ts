import { describe, it, expect, afterEach } from "vitest";
import { installFakeWebAuthn, uninstallFakeWebAuthn } from "./fake-webauthn";
import {
  isBiometricAvailable, createCredential, getPrfSecret,
  BiometricCancelledError, BiometricUnsupportedError,
} from "@/lib/biometric/webauthn";

afterEach(() => uninstallFakeWebAuthn());
const salt = new Uint8Array(32).fill(1);
const userId = new Uint8Array(16).fill(2);

// create 호출 인자에서 우리가 넣은 publicKey 옵션만 검사하기 위한 로컬 타입.
interface FakePublicKeyOptions {
  rp: { id: string };
  authenticatorSelection: { authenticatorAttachment: string; userVerification: string; residentKey: string };
  extensions: { prf: { eval: { first: Uint8Array } } };
}

describe("isBiometricAvailable", () => {
  it("UV 인증기와 PRF 지원이 모두 있으면 true", async () => {
    installFakeWebAuthn();
    expect(await isBiometricAvailable()).toBe(true);
  });
  it("PRF capability가 false면 false", async () => {
    installFakeWebAuthn({ prfCapability: false });
    expect(await isBiometricAvailable()).toBe(false);
  });
  it("capabilities API가 없으면 UV 인증기 여부만 본다", async () => {
    installFakeWebAuthn({ prfCapability: null });
    expect(await isBiometricAvailable()).toBe(true);
  });
  it("PublicKeyCredential이 없으면 false", async () => {
    uninstallFakeWebAuthn();
    expect(await isBiometricAvailable()).toBe(false);
  });
});

describe("createCredential", () => {
  it("platform·UV required·PRF eval로 만들고 credentialId와 PRF를 돌려준다", async () => {
    const fake = installFakeWebAuthn();
    const res = await createCredential(salt, userId);
    expect(res.credentialId).toBe("AQIDBA");
    expect(res.prf?.length).toBe(32);
    const pk = (fake.create.mock.calls[0][0] as unknown as { publicKey: FakePublicKeyOptions }).publicKey;
    expect(pk.authenticatorSelection).toMatchObject({ authenticatorAttachment: "platform", userVerification: "required", residentKey: "required" });
    expect(pk.rp.id).toBe(location.hostname);
    expect(pk.extensions.prf.eval.first).toEqual(salt);
  });
  it("create 시점에 PRF 결과가 없으면 prf=null", async () => {
    installFakeWebAuthn({ prfOnCreate: "enabled-only" });
    expect((await createCredential(salt, userId)).prf).toBeNull();
  });
  it("prf.enabled=false면 Unsupported를 던지고 패스키 정리를 알린다", async () => {
    const fake = installFakeWebAuthn({ prfOnCreate: "disabled" });
    await expect(createCredential(salt, userId)).rejects.toBeInstanceOf(BiometricUnsupportedError);
    expect(fake.PKC.signalUnknownCredential).toHaveBeenCalled();
  });
});

describe("getPrfSecret", () => {
  it("PRF 32바이트를 돌려준다", async () => {
    installFakeWebAuthn();
    expect((await getPrfSecret("AQIDBA", salt)).length).toBe(32);
  });
  it("NotAllowedError는 Cancelled로 바꾼다", async () => {
    installFakeWebAuthn({ failGetWith: "NotAllowedError" });
    await expect(getPrfSecret("AQIDBA", salt)).rejects.toBeInstanceOf(BiometricCancelledError);
  });
});
