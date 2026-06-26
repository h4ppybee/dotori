import Fastify, { type FastifyInstance } from "fastify";
import { loadConfig, type RelayConfig } from "./config.js";

export async function buildApp(config: RelayConfig): Promise<FastifyInstance> {
  const app = Fastify({ bodyLimit: config.bodyLimit, logger: true });
  app.get("/healthz", async () => ({ ok: true }));
  return app;
}

// tsx 직접 실행 시 진입점
if (process.argv[1] && process.argv[1].endsWith("server.ts")) {
  const config = loadConfig();
  const app = await buildApp(config);
  await app.listen({ port: config.port, host: "0.0.0.0" });
}
