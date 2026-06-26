import { db } from "@/lib/db/schema";
import { encrypt, decrypt } from "@/lib/crypto/crypto";
import { tossEndpoint } from "@/lib/toss/relay-endpoint";

const SKEW_MS = 30_000; // 만료 30초 전 갱신

export async function getValidToken(p: {
  connectionId: string;
  clientId: string;
  clientSecret: string;
  key: CryptoKey;
}): Promise<string> {
  const cached = await db.tokenCache.get(p.connectionId);
  if (cached && cached.expiresAt - SKEW_MS > Date.now()) {
    return decrypt(p.key, cached.accessTokenEnc);
  }
  const { url, headers } = tossEndpoint("/token");
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ clientId: p.clientId, clientSecret: p.clientSecret }),
  });
  if (!res.ok) {
    throw new Error("token_issue_failed");
  }
  const { accessToken, expiresIn } = await res.json();
  await db.tokenCache.put({
    connectionId: p.connectionId,
    accessTokenEnc: await encrypt(p.key, accessToken),
    expiresAt: Date.now() + expiresIn * 1000,
  });
  return accessToken;
}
