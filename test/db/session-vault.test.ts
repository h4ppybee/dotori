import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db/schema";
import { deriveKey, makeSalt } from "@/lib/crypto/crypto";
import {
  saveSession,
  loadSession,
  touchSession,
  clearSession,
  AUTO_LOCK_MS,
} from "@/lib/db/session-vault";

afterEach(async () => {
  await db.delete();
  await db.open();
});

async function aKey() {
  return deriveKey("비밀번호1234", makeSalt());
}

describe("session-vault", () => {
  it("저장한 세션을 만료 전에 그대로 불러온다", async () => {
    const key = await aKey();
    const now = 1_000_000;
    await saveSession(key, now + AUTO_LOCK_MS);

    const loaded = await loadSession(now);
    expect(loaded).not.toBeNull();
    expect(loaded?.expiresAt).toBe(now + AUTO_LOCK_MS);
    // 비추출 키라도 복호화에는 쓸 수 있도록 같은 핸들이 돌아온다
    expect(loaded?.key).toBeInstanceOf(CryptoKey);
  });

  it("만료된 세션은 null을 반환하고 레코드를 삭제한다", async () => {
    const key = await aKey();
    const now = 1_000_000;
    await saveSession(key, now); // expiresAt === now → 만료로 간주

    const loaded = await loadSession(now);
    expect(loaded).toBeNull();
    // 만료 레코드는 즉시 삭제되어 다시 조회해도 없음
    expect(await db.session.get("current")).toBeUndefined();
  });

  it("세션이 없으면 null을 반환한다", async () => {
    expect(await loadSession(Date.now())).toBeNull();
  });

  it("touchSession이 만료시각만 연장한다", async () => {
    const key = await aKey();
    const base = 1_000_000;
    await saveSession(key, base + AUTO_LOCK_MS);

    const extended = base + 5 * AUTO_LOCK_MS;
    await touchSession(extended);

    const loaded = await loadSession(base);
    expect(loaded?.expiresAt).toBe(extended);
  });

  it("세션이 없으면 touchSession은 새 레코드를 만들지 않는다", async () => {
    await touchSession(Date.now() + AUTO_LOCK_MS);
    expect(await db.session.get("current")).toBeUndefined();
  });

  it("clearSession이 세션을 제거한다", async () => {
    const key = await aKey();
    await saveSession(key, Date.now() + AUTO_LOCK_MS);
    await clearSession();
    expect(await loadSession(Date.now())).toBeNull();
  });
});
