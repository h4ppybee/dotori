import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { buildUpbitJwt } from "@/lib/upbit/upbit-jwt";

function decode(part: string) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

describe("buildUpbitJwt", () => {
  it("HS256 헤더와 access_key/nonce payload를 담고 secretKey로 서명한다", () => {
    const jwt = buildUpbitJwt("AK", "SK");
    const [h, p, sig] = jwt.split(".");
    expect(decode(h)).toEqual({ alg: "HS256", typ: "JWT" });
    const payload = decode(p);
    expect(payload.access_key).toBe("AK");
    expect(typeof payload.nonce).toBe("string");
    expect(payload.nonce.length).toBeGreaterThan(0);
    const expected = crypto.createHmac("sha256", "SK").update(`${h}.${p}`).digest("base64url");
    expect(sig).toBe(expected);
  });

  it("호출마다 nonce가 달라진다", () => {
    const a = buildUpbitJwt("AK", "SK").split(".")[1];
    const b = buildUpbitJwt("AK", "SK").split(".")[1];
    expect(a).not.toBe(b);
  });
});
