import { describe, it, expect } from "vitest";
import { derivePrfKey, toB64Url, fromB64Url, toB64, fromB64 } from "@/lib/biometric/prf-key";
import { encrypt, decrypt } from "@/lib/crypto/crypto";

const bytes = (n: number, fill: number) => new Uint8Array(n).fill(fill);

describe("prf-key", () => {
  it("같은 PRF 바이트로 만든 키는 서로 복호화된다", async () => {
    const enc = await encrypt(await derivePrfKey(bytes(32, 7)), "123456");
    expect(await decrypt(await derivePrfKey(bytes(32, 7)), enc)).toBe("123456");
  });

  it("다른 PRF 바이트로는 복호화에 실패한다", async () => {
    const enc = await encrypt(await derivePrfKey(bytes(32, 7)), "123456");
    await expect(decrypt(await derivePrfKey(bytes(32, 8)), enc)).rejects.toThrow();
  });

  it("파생 키는 비추출이다", async () => {
    const key = await derivePrfKey(bytes(32, 1));
    expect(key.extractable).toBe(false);
  });

  it("base64url·base64 왕복", () => {
    const b = new Uint8Array([251, 255, 0, 62, 63]);
    expect(toB64Url(b)).not.toMatch(/[+/=]/);
    expect(Array.from(fromB64Url(toB64Url(b)))).toEqual(Array.from(b));
    expect(Array.from(fromB64(toB64(b)))).toEqual(Array.from(b));
  });
});
