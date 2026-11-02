/**
 * 기기 동기화 키. 첫 기기가 32바이트 랜덤 키를 만들고, 사람이 옮겨 적을 수 있게
 * Crockford base32 4자 그룹(XXXX-XXXX-…, 52자·13그룹)으로 보여준다.
 * 입력은 공백·하이픈·대소문자를 무시하고 헷갈리는 글자(O → 0, I·L → 1)를 바로잡는다.
 * 키 원문은 저장소·로그·문서에 남기지 않는다(기기에는 세션 키로 암호화해 syncConfig에만 둔다).
 */

export type SyncKeyBytes = Uint8Array<ArrayBuffer>;

export const SYNC_KEY_BYTES = 32;
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const SYNC_KEY_CHARS = Math.ceil((SYNC_KEY_BYTES * 8) / 5); // 52
const GROUP_SIZE = 4;

export function generateSyncKey(): SyncKeyBytes {
  return crypto.getRandomValues(new Uint8Array(SYNC_KEY_BYTES));
}

function encodeBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(value >>> bits) & 31];
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) {
    out += ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

function decodeBase32(text: string): SyncKeyBytes | null {
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of text) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) {
      return null;
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
    value &= (1 << bits) - 1;
  }
  // 52자 = 260비트 → 마지막 4비트는 패딩이라 0이어야 한다(오타 검출).
  if (value !== 0) {
    return null;
  }
  return Uint8Array.from(out);
}

export function formatSyncKey(key: SyncKeyBytes): string {
  const chars = encodeBase32(key);
  const groups: string[] = [];
  for (let i = 0; i < chars.length; i += GROUP_SIZE) {
    groups.push(chars.slice(i, i + GROUP_SIZE));
  }
  return groups.join("-");
}

/** 사용자가 입력한 키를 읽는다. 형식이 아니면 null. */
export function parseSyncKey(input: string): SyncKeyBytes | null {
  const normalized = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (normalized.length !== SYNC_KEY_CHARS) {
    return null;
  }
  const bytes = decodeBase32(normalized);
  if (!bytes || bytes.length !== SYNC_KEY_BYTES) {
    return null;
  }
  return bytes;
}

export async function sha256Hex(data: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 키 식별자 = SHA-256(키) 앞 8바이트 hex. 서버 메타와 대조해 다른 키로 덮어쓰는 일을 막는다. */
export async function keyIdOf(key: SyncKeyBytes): Promise<string> {
  return (await sha256Hex(key)).slice(0, 16);
}
