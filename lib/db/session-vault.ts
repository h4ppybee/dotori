import { db, type SessionRecord } from "@/lib/db/schema";

/** 마지막 활동 이후 잠금까지의 유휴 시간 (10분). */
export const AUTO_LOCK_MS = 10 * 60 * 1000;

const KEY = "current" as const;

/**
 * 세션 볼트 — 자동 잠금을 위해 비추출 세션 키를 만료시각과 함께 IndexedDB에 둔다.
 *
 * 보안 메모: 저장되는 CryptoKey는 `deriveKey`가 `extractable: false`로 만든 핸들이라
 * 원본 키 바이트는 JS로도 디스크에서도 꺼낼 수 없다. 같은 브라우저에서 만료 전까지
 * 복호화에만 쓸 수 있다. (lib/crypto/crypto.ts, AGENTS.md 보안 모델)
 */
export async function saveSession(key: CryptoKey, expiresAt: number): Promise<void> {
  await db.session.put({ id: KEY, key, expiresAt });
}

/** 만료시각만 갱신한다(슬라이딩). 세션이 없으면 아무것도 하지 않는다. */
export async function touchSession(expiresAt: number): Promise<void> {
  const rec = await db.session.get(KEY);
  if (!rec) {
    return;
  }
  await db.session.put({ ...rec, expiresAt });
}

/**
 * 유효한 세션이 있으면 반환하고, 만료됐거나 없으면 null을 반환한다.
 * 만료된 레코드는 발견 즉시 삭제한다.
 */
export async function loadSession(now: number): Promise<SessionRecord | null> {
  const rec = await db.session.get(KEY);
  if (!rec) {
    return null;
  }
  if (rec.expiresAt <= now) {
    await db.session.delete(KEY);
    return null;
  }
  return rec;
}

export async function clearSession(): Promise<void> {
  await db.session.delete(KEY);
}
