import Fastify, { type FastifyInstance } from "fastify";
import { loadConfig, type RelayConfig } from "./config.js";
import { registerRoutes } from "./routes.js";
import { registerSecurity } from "./security.js";

export async function buildApp(config: RelayConfig): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: config.bodyLimit,
    // 토큰·시크릿이 로그에 남지 않도록 마스킹
    logger: {
      redact: ["req.headers.x-relay-secret", "req.body.clientSecret", "req.body.token"],
    },
  });
  await registerSecurity(app, config);
  app.get("/healthz", async () => ({ ok: true }));
  await registerRoutes(app);
  return app;
}

// tsx 직접 실행 시 진입점
if (process.argv[1] && process.argv[1].endsWith("server.ts")) {
  const config = loadConfig();
  const app = await buildApp(config);
  // Caddy가 localhost로 리버스 프록시하므로 외부 인터페이스에 바인딩하지 않는다(심층방어).
  await app.listen({ port: config.port, host: "127.0.0.1" });
}
