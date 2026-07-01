import type { FastifyInstance, FastifyReply } from "fastify";
import { handlers } from "./toss-handlers.js";
import { upbitHandlers } from "./upbit-handlers.js";
import { TossError } from "../../lib/toss/toss-client.js";
import { UpbitError } from "../../lib/upbit/upbit-client.js";

const NO_STORE = { "Cache-Control": "no-store" };

const tokenSchema = {
  type: "object",
  required: ["clientId", "clientSecret"],
  properties: {
    clientId: { type: "string", minLength: 1, maxLength: 512 },
    clientSecret: { type: "string", minLength: 1, maxLength: 512 },
  },
  additionalProperties: false,
} as const;

const tokenOnlySchema = {
  type: "object",
  required: ["token"],
  properties: { token: { type: "string", minLength: 1, maxLength: 4096 } },
  additionalProperties: false,
} as const;

const holdingsSchema = {
  type: "object",
  required: ["token", "accountSeq"],
  properties: {
    token: { type: "string", minLength: 1, maxLength: 4096 },
    accountSeq: { type: "string", minLength: 1, maxLength: 128 },
  },
  additionalProperties: false,
} as const;

const pricesSchema = {
  type: "object",
  required: ["token", "symbols"],
  properties: {
    token: { type: "string", minLength: 1, maxLength: 4096 },
    symbols: {
      type: "array",
      maxItems: 2000,
      items: {
        type: "object",
        required: ["symbol", "currency"],
        properties: {
          symbol: { type: "string", minLength: 1, maxLength: 64 },
          currency: { type: "string", minLength: 1, maxLength: 8 },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;

const upbitAccountsSchema = {
  type: "object",
  required: ["accessKey", "secretKey"],
  properties: {
    accessKey: { type: "string", minLength: 1, maxLength: 512 },
    secretKey: { type: "string", minLength: 1, maxLength: 512 },
  },
  additionalProperties: false,
} as const;

const upbitTickersSchema = {
  type: "object",
  required: ["markets"],
  properties: {
    markets: {
      type: "array",
      maxItems: 500,
      items: { type: "string" },
    },
  },
  additionalProperties: false,
} as const;

// 토스/업비트 원문·내부 에러를 노출하지 않고 status만 전파한다 (기존 app/api/toss 라우트와 동일 정책).
async function run(reply: FastifyReply, fn: () => Promise<unknown>): Promise<void> {
  try {
    const data = await fn();
    await reply.headers(NO_STORE).send(data);
  } catch (e) {
    if (e instanceof TossError) {
      await reply.code(e.status).headers(NO_STORE).send({ error: "toss_error" });
      return;
    }
    if (e instanceof UpbitError) {
      await reply.code(e.status).headers(NO_STORE).send({ error: "upbit_error" });
      return;
    }
    await reply.code(400).headers(NO_STORE).send({ error: "bad_request" });
  }
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.post("/token", { schema: { body: tokenSchema } }, (req, reply) =>
    run(reply, () => handlers.token(req.body as { clientId: string; clientSecret: string })),
  );
  app.post("/accounts", { schema: { body: tokenOnlySchema } }, (req, reply) =>
    run(reply, () => handlers.accounts(req.body as { token: string })),
  );
  app.post("/holdings", { schema: { body: holdingsSchema } }, (req, reply) =>
    run(reply, () => handlers.holdings(req.body as { token: string; accountSeq: string })),
  );
  app.post("/prices", { schema: { body: pricesSchema } }, (req, reply) =>
    run(reply, () =>
      handlers.prices(req.body as { token: string; symbols: { symbol: string; currency: string }[] }),
    ),
  );
  app.post("/exchange-rate", { schema: { body: tokenOnlySchema } }, (req, reply) =>
    run(reply, () => handlers["exchange-rate"](req.body as { token: string })),
  );
  app.post("/upbit/accounts", { schema: { body: upbitAccountsSchema } }, (req, reply) =>
    run(reply, () =>
      upbitHandlers.accounts(req.body as { accessKey: string; secretKey: string }),
    ),
  );
  app.post("/upbit/tickers", { schema: { body: upbitTickersSchema } }, (req, reply) =>
    run(reply, () => upbitHandlers.tickers(req.body as { markets: string[] })),
  );
  app.post("/upbit/markets", (req, reply) => run(reply, () => upbitHandlers.markets()));
}
