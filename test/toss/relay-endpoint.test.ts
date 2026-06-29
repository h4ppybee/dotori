import { describe, it, expect, vi, afterEach } from "vitest";
import { tossEndpoint } from "@/lib/toss/relay-endpoint";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("tossEndpoint", () => {
  it("RELAY_URL 없으면 상대경로 + 시크릿 헤더 없음", () => {
    const { url, headers } = tossEndpoint("/token");
    expect(url).toBe("/api/toss/token");
    expect(headers["X-Relay-Secret"]).toBeUndefined();
  });

  it("RELAY_URL 있으면 릴레이 절대 URL + 시크릿 헤더", () => {
    vi.stubEnv("NEXT_PUBLIC_RELAY_URL", "http://localhost:8787");
    vi.stubEnv("NEXT_PUBLIC_RELAY_SECRET", "s3cret");
    const { url, headers } = tossEndpoint("/token");
    expect(url).toBe("http://localhost:8787/token");
    expect(headers["X-Relay-Secret"]).toBe("s3cret");
  });
});
