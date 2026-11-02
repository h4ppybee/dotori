import { keyIdOf, type SyncKeyBytes } from "@/lib/device-sync/key";

/**
 * 기기 동기화 봉투(AES-GCM 256, 96비트 랜덤 IV). 서버·구글 드라이브에는 이 봉투만 저장된다.
 * 평문은 { syncVersion, data, sentAt } JSON(lib/device-sync/collect의 encodeSyncPayload).
 */
export interface SyncEnvelope {
  v: 1;
  alg: "A256GCM";
  iv: string;    // base64
  ct: string;    // base64 (GCM 태그 포함)
  keyId: string; // SHA-256(키) 앞 8바이트 hex
}

/** 키가 다르거나(keyId 불일치) 내용이 변조돼 인증에 실패했을 때. 적용하지 않는다. */
export class SyncKeyError extends Error {
  constructor() {
    super("SYNC_KEY_MISMATCH");
    this.name = "SyncKeyError";
  }
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// String.fromCharCode(...bytes)는 수백 KB를 넘으면 인자 수 한도로 RangeError가 난다 → 32KB씩 나눈다.
const B64_CHUNK = 0x8000;

export function bytesToB64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += B64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + B64_CHUNK));
  }
  return btoa(binary);
}

export function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function importAesKey(key: SyncKeyBytes): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function seal(key: SyncKeyBytes, plaintext: string): Promise<SyncEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await importAesKey(key), textEncoder.encode(plaintext));
  return {
    v: 1,
    alg: "A256GCM",
    iv: bytesToB64(iv),
    ct: bytesToB64(new Uint8Array(ct)),
    keyId: await keyIdOf(key),
  };
}

/** 봉투를 연다. 키가 다르거나 변조됐으면 SyncKeyError. */
export async function open(key: SyncKeyBytes, envelope: SyncEnvelope): Promise<string> {
  if (envelope.keyId !== (await keyIdOf(key))) {
    throw new SyncKeyError();
  }
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64ToBytes(envelope.iv) },
      await importAesKey(key),
      b64ToBytes(envelope.ct),
    );
    return textDecoder.decode(pt);
  } catch {
    throw new SyncKeyError();
  }
}

export function isSyncEnvelope(x: unknown): x is SyncEnvelope {
  if (x === null || typeof x !== "object") {
    return false;
  }
  const e = x as Record<string, unknown>;
  return e.v === 1 && e.alg === "A256GCM" &&
    typeof e.iv === "string" && typeof e.ct === "string" && typeof e.keyId === "string";
}
