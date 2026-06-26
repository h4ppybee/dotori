import type { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { isAllowedOrigin, type RelayConfig } from "./config.js";

export async function registerSecurity(app: FastifyInstance, cfg: RelayConfig): Promise<void> {
  await app.register(helmet);

  const allow = isAllowedOrigin(cfg.allowedOrigins);
  await app.register(cors, {
    // origin이 없으면(서버간 호출 등) 허용, 허용 목록/정규식에 맞으면 허용, 그 외엔 ACAO 미부여
    origin: (origin, cb) => {
      if (!origin || allow(origin)) {
        cb(null, true);
        return;
      }
      cb(null, false);
    },
    methods: ["POST", "GET", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Relay-Secret"],
  });

  await app.register(rateLimit, { max: cfg.rateMax, timeWindow: "1 minute" });

  // 공유 시크릿 검증 (healthz·preflight는 예외)
  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/healthz" || req.method === "OPTIONS") {
      return;
    }
    if (req.headers["x-relay-secret"] !== cfg.relaySecret) {
      await reply.code(401).send({ error: "unauthorized" });
    }
  });
}
