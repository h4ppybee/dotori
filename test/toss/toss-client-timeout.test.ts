import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("toss-client fetch 타임아웃", () => {
  it("FETCH_TIMEOUT_MS 설정 시 fetch에 AbortSignal 전달", async () => {
    vi.stubEnv("FETCH_TIMEOUT_MS", "5000");
    const fetchSpy = vi.fn(
      async () => new Response(JSON.stringify({ access_token: "t", expires_in: 1 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const { exchangeToken } = await import("@/lib/toss/toss-client");
    await exchangeToken("id", "sec");
    const init = (fetchSpy.mock.calls[0] as unknown[])[1] as RequestInit | undefined;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("FETCH_TIMEOUT_MS 미설정 시 signal 없음 (기존 동작)", async () => {
    const fetchSpy = vi.fn(
      async () => new Response(JSON.stringify({ access_token: "t", expires_in: 1 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const { exchangeToken } = await import("@/lib/toss/toss-client");
    await exchangeToken("id", "sec");
    const init = (fetchSpy.mock.calls[0] as unknown[])[1] as RequestInit | undefined;
    expect(init?.signal).toBeUndefined();
  });
});
