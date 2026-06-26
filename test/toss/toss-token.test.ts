import { describe, it, expect, vi, afterEach } from "vitest";
import { db } from "@/lib/db/schema";
import { getValidToken } from "@/lib/toss/toss-token";
import { deriveKey, encrypt, makeSalt } from "@/lib/crypto/crypto";

afterEach(async () => { await db.delete(); await db.open(); vi.restoreAllMocks(); });

describe("toss-token", () => {
  it("returns cached token when not expired", async () => {
    const key = await deriveKey("pp", makeSalt());
    await db.tokenCache.put({ connectionId: "c1", accessTokenEnc: await encrypt(key, "CACHED"), expiresAt: Date.now() + 60_000 });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const tok = await getValidToken({ connectionId: "c1", clientId: "id", clientSecret: "sec", key });
    expect(tok).toBe("CACHED");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("re-issues via proxy when expired and caches encrypted", async () => {
    const key = await deriveKey("pp", makeSalt());
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ accessToken: "NEW", expiresIn: 3600 }), { status: 200 })));
    const tok = await getValidToken({ connectionId: "c1", clientId: "id", clientSecret: "sec", key });
    expect(tok).toBe("NEW");
    const cached = await db.tokenCache.get("c1");
    expect(cached?.accessTokenEnc).not.toContain("NEW"); // 암호화 저장 확인
    expect(await db.tokenCache.get("c1")).toBeTruthy();
  });

  it("re-issues when no cache exists", async () => {
    const key = await deriveKey("pp", makeSalt());
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ accessToken: "FRESH", expiresIn: 3600 }), { status: 200 })));
    const tok = await getValidToken({ connectionId: "cX", clientId: "id", clientSecret: "sec", key });
    expect(tok).toBe("FRESH");
  });

  it("throws when proxy token issue fails", async () => {
    const key = await deriveKey("pp", makeSalt());
    vi.stubGlobal("fetch", vi.fn(async () => new Response("err", { status: 401 })));
    await expect(getValidToken({ connectionId: "cY", clientId: "id", clientSecret: "sec", key }))
      .rejects.toThrow();
  });
});
