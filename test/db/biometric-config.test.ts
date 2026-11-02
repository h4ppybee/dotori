import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db/schema";
import { getBiometricConfig, saveBiometricConfig, clearBiometricConfig } from "@/lib/db/local-store";

afterEach(async () => { await db.delete(); await db.open(); });

const SAMPLE = { credentialId: "Y3JlZC0x", prfSalt: "c2FsdA==", secretEnc: "aXY=.Y3Q=", createdAt: 1_700_000_000_000 };

describe("biometric 설정", () => {
  it("저장 전에는 undefined", async () => {
    expect(await getBiometricConfig()).toBeUndefined();
  });

  it("저장하면 단일 행으로 덮어쓰고, 해제하면 지운다", async () => {
    await saveBiometricConfig(SAMPLE);
    await saveBiometricConfig({ ...SAMPLE, credentialId: "Y3JlZC0y" });
    expect(await db.biometric.count()).toBe(1);
    expect((await getBiometricConfig())?.credentialId).toBe("Y3JlZC0y");
    await clearBiometricConfig();
    expect(await getBiometricConfig()).toBeUndefined();
  });
});
