import { describe, it, expect } from "vitest";
import {
  generateSyncKey, formatSyncKey, parseSyncKey, keyIdOf, sha256Hex, SYNC_KEY_BYTES,
} from "@/lib/device-sync/key";

describe("동기화 키", () => {
  it("32바이트 키를 52자·13그룹(XXXX-…) 표기로 만들고 다시 읽는다", () => {
    const key = generateSyncKey();
    expect(key).toHaveLength(SYNC_KEY_BYTES);
    const text = formatSyncKey(key);
    expect(text).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){12}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(parseSyncKey(text)).toEqual(key);
  });

  it("generateSyncKey는 매번 다른 키를 만든다", () => {
    expect(formatSyncKey(generateSyncKey())).not.toBe(formatSyncKey(generateSyncKey()));
  });

  it("공백·하이픈·소문자를 무시하고 O → 0, I·L → 1로 바로잡는다", () => {
    const zero = new Uint8Array(SYNC_KEY_BYTES);
    const zeroText = formatSyncKey(zero);
    expect(parseSyncKey(zeroText.replace(/0/g, "o").replace(/-/g, " "))).toEqual(zero);

    const one = new Uint8Array(SYNC_KEY_BYTES);
    one[0] = 0x08; // 앞 5비트 00001 → 첫 글자 "1"
    const oneText = formatSyncKey(one);
    expect(oneText.startsWith("1")).toBe(true);
    expect(parseSyncKey(`l${oneText.slice(1)}`)).toEqual(one);
    expect(parseSyncKey(`I${oneText.slice(1)}`.toLowerCase())).toEqual(one);
  });

  it("길이가 다르거나, 알파벳 밖 글자(U)가 있거나, 남는 패딩 비트가 0이 아니면 null", () => {
    const text = formatSyncKey(generateSyncKey()).replace(/-/g, "");
    expect(parseSyncKey(text.slice(0, -1))).toBeNull();
    expect(parseSyncKey(`${text}0`)).toBeNull();
    expect(parseSyncKey(`U${text.slice(1)}`)).toBeNull();
    expect(parseSyncKey(`${"0".repeat(51)}1`)).toBeNull();
    expect(parseSyncKey("")).toBeNull();
  });

  it("keyIdOf는 SHA-256(키) 앞 8바이트 hex(16자)", async () => {
    // SHA-256(32바이트 0) = 66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925
    expect(await keyIdOf(new Uint8Array(SYNC_KEY_BYTES))).toBe("66687aadf862bd77");
    expect(await sha256Hex(new Uint8Array(SYNC_KEY_BYTES))).toBe(
      "66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925",
    );
  });
});
