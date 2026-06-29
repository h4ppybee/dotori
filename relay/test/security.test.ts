import { describe, it, expect, vi, afterEach } from "vitest";
import { buildApp } from "../src/server";
import type { RelayConfig } from "../src/config";

const baseCfg: RelayConfig = {
  port: 0,
  allowedOrigins: ["http://localhost:3000"],
  relaySecret: "s",
  tossApiBase: "https://x",
  rateMax: 1000,
  bodyLimit: 65536,
};

function stubOkFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CORS", () => {
  it("허용 Origin preflight → ACAO 헤더 반환", async () => {
    const app = await buildApp(baseCfg);
    const res = await app.inject({
      method: "OPTIONS",
      url: "/token",
      headers: { origin: "http://localhost:3000", "access-control-request-method": "POST" },
    });
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
  });

  it("비허용 Origin → ACAO 헤더 없음", async () => {
    const app = await buildApp(baseCfg);
    const res = await app.inject({
      method: "OPTIONS",
      url: "/token",
      headers: { origin: "https://evil.example.com", "access-control-request-method": "POST" },
    });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("공유 시크릿", () => {
  it("X-Relay-Secret 누락 → 401", async () => {
    const app = await buildApp(baseCfg);
    const res = await app.inject({
      method: "POST",
      url: "/token",
      headers: { "content-type": "application/json" },
      payload: { clientId: "id", clientSecret: "sec" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("healthz는 시크릿 없이 200", async () => {
    const app = await buildApp(baseCfg);
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
  });
});

describe("rate-limit", () => {
  it("한도 초과 시 429", async () => {
    stubOkFetch();
    const app = await buildApp({ ...baseCfg, rateMax: 1 });
    const headers = { "x-relay-secret": "s", "content-type": "application/json" };
    const payload = { clientId: "id", clientSecret: "sec" };
    const first = await app.inject({ method: "POST", url: "/token", headers, payload });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({ method: "POST", url: "/token", headers, payload });
    expect(second.statusCode).toBe(429);
  });
});
