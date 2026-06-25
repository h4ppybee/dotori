import { describe, it, expect } from "vitest";
import { deriveKey, encrypt, decrypt, makeSalt, makeVerifier, checkVerifier } from "@/lib/crypto/crypto";

describe("crypto", () => {
  it("round-trips ciphertext", async () => {
    const salt = makeSalt();
    const key = await deriveKey("hunter2", salt);
    const ct = await encrypt(key, "my-secret");
    expect(ct).not.toContain("my-secret");
    expect(await decrypt(key, ct)).toBe("my-secret");
  });

  it("rejects wrong passphrase via verifier", async () => {
    const salt = makeSalt();
    const good = await deriveKey("hunter2", salt);
    const verifier = await makeVerifier(good);
    expect(await checkVerifier(good, verifier)).toBe(true);

    const bad = await deriveKey("wrong", salt);
    expect(await checkVerifier(bad, verifier)).toBe(false);
  });

  it("fails to decrypt with wrong key", async () => {
    const salt = makeSalt();
    const ct = await encrypt(await deriveKey("a", salt), "secret");
    await expect(decrypt(await deriveKey("b", salt), ct)).rejects.toThrow();
  });

  it("rejects malformed payload", async () => {
    const key = await deriveKey("hunter2", makeSalt());
    await expect(decrypt(key, "no-separator")).rejects.toThrow();
  });

  it("uses a random IV per encryption", async () => {
    const key = await deriveKey("hunter2", makeSalt());
    const a = await encrypt(key, "same-plaintext");
    const b = await encrypt(key, "same-plaintext");
    expect(a).not.toBe(b);
  });
});
