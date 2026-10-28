import { describe, it, expect, afterEach, vi } from "vitest";
import { db } from "@/lib/db/schema";
import { getBiometricConfig } from "@/lib/db/local-store";
import { installFakeWebAuthn, uninstallFakeWebAuthn } from "./fake-webauthn";
import {
  startEnrollment, unlockWithBiometric, disableBiometric,
  hasOfferedBiometric, markBiometricOffered, clearBiometricOffered, getDeviceUserId,
  BiometricInvalidError,
} from "@/lib/biometric/biometric-unlock";
import { BiometricCancelledError, BiometricUnsupportedError } from "@/lib/biometric/webauthn";

afterEach(async () => {
  uninstallFakeWebAuthn();
  localStorage.clear();
  clearBiometricOffered();
  await db.delete(); await db.open();
});

describe("startEnrollment", () => {
  it("create에 PRF가 오면 바로 저장하고 secret은 평문으로 남지 않는다", async () => {
    installFakeWebAuthn();
    const res = await startEnrollment("123456");
    expect(res.status).toBe("done");
    const cfg = await getBiometricConfig();
    expect(cfg?.credentialId).toBe("AQIDBA");
    expect(cfg?.secretEnc).not.toContain("123456");
  });

  it("create에 PRF가 없으면 needs-confirm을 돌려주고 finish로 마친다", async () => {
    const fake = installFakeWebAuthn({ prfOnCreate: "enabled-only" });
    const res = await startEnrollment("123456");
    expect(res.status).toBe("needs-confirm");
    expect(await getBiometricConfig()).toBeUndefined();
    if (res.status !== "needs-confirm") { return; }
    await res.finish();
    expect(fake.get).toHaveBeenCalledTimes(1);
    expect(await getBiometricConfig()).toBeDefined();
  });

  it("needs-confirm의 cancel은 만든 패스키를 브라우저에 알려 정리한다", async () => {
    const fake = installFakeWebAuthn({ prfOnCreate: "enabled-only" });
    const res = await startEnrollment("123456");
    if (res.status !== "needs-confirm") { throw new Error("needs-confirm이어야 한다"); }
    res.cancel();
    expect(fake.PKC.signalUnknownCredential).toHaveBeenCalledWith({ rpId: location.hostname, credentialId: "AQIDBA" });
    expect(await getBiometricConfig()).toBeUndefined();
  });

  it("cancel은 signalUnknownCredential이 없거나 실패해도 throw하지 않는다", async () => {
    const fake = installFakeWebAuthn({ prfOnCreate: "enabled-only" });
    const res = await startEnrollment("123456");
    if (res.status !== "needs-confirm") { throw new Error("needs-confirm이어야 한다"); }
    fake.PKC.signalUnknownCredential.mockImplementationOnce(() => { throw new Error("sync boom"); });
    expect(() => res.cancel()).not.toThrow();
    fake.PKC.signalUnknownCredential.mockRejectedValueOnce(new Error("async boom"));
    expect(() => res.cancel()).not.toThrow();
    vi.stubGlobal("PublicKeyCredential", {});
    expect(() => res.cancel()).not.toThrow();
  });

  it("PRF 미지원 기기면 Unsupported를 던지고 행을 남기지 않는다", async () => {
    installFakeWebAuthn({ prfOnCreate: "disabled" });
    await expect(startEnrollment("123456")).rejects.toBeInstanceOf(BiometricUnsupportedError);
    expect(await getBiometricConfig()).toBeUndefined();
  });
});

describe("unlockWithBiometric", () => {
  it("등록한 secret을 돌려준다", async () => {
    installFakeWebAuthn();
    await startEnrollment("123456");
    expect(await unlockWithBiometric()).toBe("123456");
  });

  it("등록이 없으면 null", async () => {
    installFakeWebAuthn();
    expect(await unlockWithBiometric()).toBeNull();
  });

  it("취소는 Cancelled로 전달된다", async () => {
    installFakeWebAuthn();
    await startEnrollment("123456");
    uninstallFakeWebAuthn();
    installFakeWebAuthn({ failGetWith: "NotAllowedError" });
    await expect(unlockWithBiometric()).rejects.toBeInstanceOf(BiometricCancelledError);
  });

  it("다른 PRF 값이면 복호화 실패를 던진다", async () => {
    installFakeWebAuthn();
    await startEnrollment("123456");
    uninstallFakeWebAuthn();
    installFakeWebAuthn({ prfSecret: new Uint8Array(32).fill(3) });
    await expect(unlockWithBiometric()).rejects.toBeInstanceOf(BiometricInvalidError);
  });

  it("cfg를 직접 넘기면 DB 행이 지워져도 secret을 돌려준다", async () => {
    installFakeWebAuthn();
    await startEnrollment("123456");
    const cfg = await getBiometricConfig();
    await disableBiometric();
    expect(await getBiometricConfig()).toBeUndefined();
    expect(await unlockWithBiometric(cfg)).toBe("123456");
  });
});

describe("기기 상태", () => {
  it("disableBiometric은 행을 지운다", async () => {
    installFakeWebAuthn();
    await startEnrollment("123456");
    await disableBiometric();
    expect(await getBiometricConfig()).toBeUndefined();
  });

  it("device user.id는 한 번 만들면 유지된다", () => {
    expect(Array.from(getDeviceUserId())).toEqual(Array.from(getDeviceUserId()));
  });

  it("저장된 값이 손상됐으면 새로 만든다", () => {
    localStorage.setItem("dotori.biometricUserId", "!!!not-base64!!!");
    const id = getDeviceUserId();
    expect(id.length).toBe(16);
    // 새로 만든 값이 저장돼 이후 호출에서도 유지된다.
    expect(Array.from(getDeviceUserId())).toEqual(Array.from(id));
  });

  it("제안 기록을 남기고 지울 수 있다", () => {
    expect(hasOfferedBiometric()).toBe(false);
    markBiometricOffered();
    expect(hasOfferedBiometric()).toBe(true);
    clearBiometricOffered();
    expect(hasOfferedBiometric()).toBe(false);
  });

  it("localStorage에 못 남겨도 같은 페이지 세션에서는 제안 기록을 기억한다", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    try {
      markBiometricOffered();
      expect(localStorage.getItem("dotori.biometricOffered")).toBeNull();
      expect(hasOfferedBiometric()).toBe(true);
      clearBiometricOffered();
      expect(hasOfferedBiometric()).toBe(false);
    } finally {
      setItem.mockRestore();
    }
  });
});
