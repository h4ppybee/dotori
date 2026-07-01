import crypto from "node:crypto";

const b64url = (obj: unknown): string =>
  Buffer.from(JSON.stringify(obj)).toString("base64url");

/** 업비트 요청용 JWT. 파라미터 없는 요청(accounts) 전용 → query_hash 미포함. */
export function buildUpbitJwt(accessKey: string, secretKey: string): string {
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({ access_key: accessKey, nonce: crypto.randomUUID() });
  const sig = crypto.createHmac("sha256", secretKey).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}
