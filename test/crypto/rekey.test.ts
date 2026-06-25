import { describe, it, expect, beforeEach } from "vitest";
import { deriveKey, encrypt, decrypt, makeSalt } from "@/lib/crypto/crypto";
import { rekeyVault } from "@/lib/crypto/rekey";
import { db } from "@/lib/db/schema";

// fake-indexeddb/auto는 setup.ts에서 import됨
// 각 테스트 전 DB를 초기화한다
beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("rekeyVault", () => {
  it("커넥션의 clientSecretEnc를 새 키로 재암호화한다", async () => {
    const oldSalt = makeSalt();
    const newSalt = makeSalt();
    const oldKey = await deriveKey("old-passphrase", oldSalt);
    const newKey = await deriveKey("new-passphrase", newSalt);

    const clientSecretEnc = await encrypt(oldKey, "my-client-secret");

    await db.connections.put({
      id: "conn-1",
      memberId: "member-1",
      type: "TOSS_API",
      label: "테스트 연동",
      clientId: "client-id-1",
      clientSecretEnc,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await rekeyVault(oldKey, newKey);

    const updated = await db.connections.get("conn-1");
    expect(updated).toBeDefined();
    expect(updated!.clientSecretEnc).toBeDefined();
    // 새 키로 복호화 가능
    expect(await decrypt(newKey, updated!.clientSecretEnc!)).toBe("my-client-secret");
    // 구 키로는 복호화 불가
    await expect(decrypt(oldKey, updated!.clientSecretEnc!)).rejects.toThrow();
  });

  it("clientSecretEnc가 없는 커넥션은 건드리지 않는다", async () => {
    const oldKey = await deriveKey("old", makeSalt());
    const newKey = await deriveKey("new", makeSalt());

    await db.connections.put({
      id: "conn-no-secret",
      memberId: "member-1",
      type: "MANUAL",
      label: "수동 연동",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await rekeyVault(oldKey, newKey);

    const unchanged = await db.connections.get("conn-no-secret");
    expect(unchanged).toBeDefined();
    expect(unchanged!.clientSecretEnc).toBeUndefined();
  });

  it("tokenCache의 accessTokenEnc를 새 키로 재암호화한다", async () => {
    const oldKey = await deriveKey("old-passphrase", makeSalt());
    const newKey = await deriveKey("new-passphrase", makeSalt());

    const accessTokenEnc = await encrypt(oldKey, "bearer-token-abc");
    await db.tokenCache.put({
      connectionId: "conn-1",
      accessTokenEnc,
      expiresAt: Date.now() + 3600_000,
    });

    await rekeyVault(oldKey, newKey);

    const updated = await db.tokenCache.get("conn-1");
    expect(updated).toBeDefined();
    expect(await decrypt(newKey, updated!.accessTokenEnc)).toBe("bearer-token-abc");
    await expect(decrypt(oldKey, updated!.accessTokenEnc)).rejects.toThrow();
  });

  it("복호화 불가한 stale tokenCache 행은 삭제한다", async () => {
    const oldKey = await deriveKey("old", makeSalt());
    const newKey = await deriveKey("new", makeSalt());
    // 다른 키로 암호화된 stale 토큰 (복호화 실패 시뮬레이션)
    const staleKey = await deriveKey("stale", makeSalt());
    const staleTokenEnc = await encrypt(staleKey, "stale-token");

    await db.tokenCache.put({
      connectionId: "conn-stale",
      accessTokenEnc: staleTokenEnc,
      expiresAt: Date.now() + 3600_000,
    });

    // 예외 없이 완료되어야 함
    await expect(rekeyVault(oldKey, newKey)).resolves.toBeUndefined();

    // stale 행은 삭제되어야 함
    const deleted = await db.tokenCache.get("conn-stale");
    expect(deleted).toBeUndefined();
  });

  it("여러 커넥션을 모두 재암호화한다", async () => {
    const oldKey = await deriveKey("old-pp", makeSalt());
    const newKey = await deriveKey("new-pp", makeSalt());

    const secrets = ["secret-a", "secret-b", "secret-c"];
    for (let i = 0; i < secrets.length; i++) {
      await db.connections.put({
        id: `conn-${i}`,
        memberId: "m1",
        type: "TOSS_API",
        label: `연동 ${i}`,
        clientSecretEnc: await encrypt(oldKey, secrets[i]),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    await rekeyVault(oldKey, newKey);

    for (let i = 0; i < secrets.length; i++) {
      const row = await db.connections.get(`conn-${i}`);
      expect(await decrypt(newKey, row!.clientSecretEnc!)).toBe(secrets[i]);
    }
  });
});
