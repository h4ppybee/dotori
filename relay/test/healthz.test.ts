import { describe, it, expect } from "vitest";
import { buildApp } from "../src/server";
import type { RelayConfig } from "../src/config";

const cfg: RelayConfig = {
  port: 0,
  allowedOrigins: ["http://localhost:3000"],
  relaySecret: "s",
  tossApiBase: "https://x",
  rateMax: 60,
  bodyLimit: 65536,
};

describe("GET /healthz", () => {
  it("인증 없이 200", async () => {
    const app = await buildApp(cfg);
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
