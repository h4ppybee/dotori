const HKDF_INFO = new TextEncoder().encode("dotori-biometric-v1");

export const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
export const fromB64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** WebAuthn credential ID용 base64url (패딩 없음). lib/crypto의 toB64는 표준 base64라 따로 둔다. */
export const toB64Url = (b: Uint8Array) => toB64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export function fromB64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return fromB64(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}

/**
 * WebAuthn PRF 출력(32바이트)을 HKDF로 처리해 비추출 AES-GCM 키를 만든다.
 * 이 키로 PIN/비밀번호를 암호화해 두고, Face ID를 통과해 같은 PRF 값을 받아야만 복호화된다.
 */
export async function derivePrfKey(prf: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", prf, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: HKDF_INFO },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
