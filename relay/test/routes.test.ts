import { describe, it, expect, vi, afterEach } from "vitest";
import { buildApp } from "../src/server";
import type { RelayConfig } from "../src/config";

const cfg: RelayConfig = {
  port: 0,
  allowedOrigins: ["http://localhost:3000"],
  relaySecret: "s",
  tossApiBase: "https://x",
  rateMax: 1000,
  bodyLimit: 65536,
};

const AUTH = { "x-relay-secret": "s", "content-type": "application/json" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("routes", () => {
  it("POST /token 정상 → 200 + {accessToken, expiresIn}", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 })),
    );
    const app = await buildApp(cfg);
    const res = await app.inject({
      method: "POST",
      url: "/token",
      headers: AUTH,
      payload: { clientId: "id", clientSecret: "sec" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ accessToken: "tok", expiresIn: 3600 });
  });

  it("POST /token 스키마 위반(clientSecret 누락) → 400", async () => {
    const app = await buildApp(cfg);
    const res = await app.inject({
      method: "POST",
      url: "/token",
      headers: AUTH,
      payload: { clientId: "id" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("TossError status 전파 (토스 401 → 401)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    const app = await buildApp(cfg);
    const res = await app.inject({
      method: "POST",
      url: "/token",
      headers: AUTH,
      payload: { clientId: "id", clientSecret: "sec" },
    });
    expect(res.statusCode).toBe(401);
  });
});
