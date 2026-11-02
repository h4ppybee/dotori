import { describe, it, expect } from "vitest";
import { generateSyncKey, keyIdOf } from "@/lib/device-sync/key";
import { seal, open, isSyncEnvelope, SyncKeyError } from "@/lib/device-sync/envelope";

describe("봉투 seal/open", () => {
  it("왕복하고, 봉투에는 버전·알고리즘·keyId가 실린다", async () => {
    const key = generateSyncKey();
    const env = await seal(key, "통장 쪼개기 500만");
    expect(env).toMatchObject({ v: 1, alg: "A256GCM", keyId: await keyIdOf(key) });
    expect(atob(env.iv)).toHaveLength(12);
    expect(env.ct).not.toContain("500만");
    expect(await open(key, env)).toBe("통장 쪼개기 500만");
  });

  it("같은 평문도 매번 IV가 달라 암호문이 다르다", async () => {
    const key = generateSyncKey();
    const a = await seal(key, "같은 내용");
    const b = await seal(key, "같은 내용");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it("다른 키로 열면 SyncKeyError", async () => {
    const env = await seal(generateSyncKey(), "x");
    await expect(open(generateSyncKey(), env)).rejects.toBeInstanceOf(SyncKeyError);
  });

  it("keyId를 맞춰도 암호문이 변조되면 SyncKeyError(인증 실패)", async () => {
    const key = generateSyncKey();
    const env = await seal(key, "원래 내용");
    const tampered = { ...env, ct: `${env.ct[0] === "A" ? "B" : "A"}${env.ct.slice(1)}` };
    await expect(open(key, tampered)).rejects.toBeInstanceOf(SyncKeyError);
  });

  it("1MB 평문도 왕복한다(청크 base64)", async () => {
    const key = generateSyncKey();
    const big = "가".repeat(350_000); // UTF-8 약 1MB
    expect(await open(key, await seal(key, big))).toBe(big);
  });

  it("isSyncEnvelope는 형식만 검사한다", async () => {
    expect(isSyncEnvelope(await seal(generateSyncKey(), "x"))).toBe(true);
    expect(isSyncEnvelope({ v: 2, alg: "A256GCM", iv: "a", ct: "b", keyId: "c" })).toBe(false);
    expect(isSyncEnvelope(null)).toBe(false);
  });
});
