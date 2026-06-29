# 토스 릴레이 서버 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 토스로 나가는 모든 호출이 고정 공인 IP 1개(Oracle VM)를 거치게 하는 Fastify 릴레이 서버를 만들고, dev에서 먼저 연결을 검증한 뒤 프로덕션에 배포한다.

**Architecture:** dotori 레포 안 `relay/` 디렉토리에 독립 Fastify 서버를 두고, 토스 응답 파싱은 기존 [lib/toss/toss-client.ts](../../../lib/toss/toss-client.ts)를 공유 import한다. 클라이언트는 `NEXT_PUBLIC_RELAY_URL` 유무로 릴레이/기존 라우트를 분기한다. 릴레이는 Caddy(nip.io TLS) 뒤에서 systemd로 실행되고, 보안은 CORS allowlist·공유 시크릿·rate-limit·입력검증·OS 하드닝으로 다층 방어한다.

**Tech Stack:** Node 22, Fastify 5, @fastify/{cors,rate-limit,helmet}, tsx(런타임 TS 실행), vitest, Caddy, systemd, Oracle Cloud Free Tier.

설계 근거: [docs/superpowers/specs/2026-06-26-toss-relay-server-design.md](../specs/2026-06-26-toss-relay-server-design.md)

---

## File Structure

| 파일 | 책임 | 신규/수정 |
|---|---|---|
| `relay/package.json` | 릴레이 의존성·스크립트 | 신규 |
| `relay/tsconfig.json` | TS 설정(상위 lib 포함) | 신규 |
| `relay/.env.example` | 릴레이 env 예시 | 신규 |
| `relay/src/config.ts` | env 로드·검증, CORS origin 매처 | 신규 |
| `relay/src/toss-handlers.ts` | 5개 엔드포인트의 토스 위임 로직(toss-client 호출) | 신규 |
| `relay/src/routes.ts` | Fastify 라우트 등록 + JSON 스키마 | 신규 |
| `relay/src/security.ts` | CORS·secret·rate-limit·helmet 플러그인 등록 | 신규 |
| `relay/src/server.ts` | 앱 부팅(`buildApp()`)·listen | 신규 |
| `relay/test/*.test.ts` | 라우트·config·보안 단위 테스트 | 신규 |
| `lib/toss/relay-endpoint.ts` | 클라 분기 헬퍼(`tossEndpoint`) | 신규 |
| `lib/toss/toss-token.ts` | `tossEndpoint` 적용 | 수정 |
| `lib/sync/refresh.ts` | `proxyPost`/`proxyPostWithTokenRetry`에 `tossEndpoint` 적용 | 수정 |
| `test/toss/relay-endpoint.test.ts` | 분기 헬퍼 테스트 | 신규 |
| `.vercelignore` | `relay/` Vercel 빌드 제외 | 신규/수정 |
| `vitest.config.ts` | 루트 vitest에서 `relay/**` 제외 | 수정 |
| `infra/relay/` | Caddyfile·systemd unit·셋업 런북 | 신규 |

> 릴레이는 빌드 스텝 없이 **tsx로 TS를 직접 실행**한다(dev/prod 동일). 따라서 `relay/src`가 상대경로로 `../../lib/toss/toss-client`를 그대로 import한다. 타입체크는 `relay/tsconfig.json`의 include에 해당 파일을 포함해 커버한다.

---

## Task 1: relay 스캐폴딩 + healthz

**Files:**
- Create: `relay/package.json`, `relay/tsconfig.json`, `relay/.env.example`, `relay/src/config.ts`, `relay/src/server.ts`
- Test: `relay/test/config.test.ts`

- [ ] **Step 1: `relay/package.json` 작성**

```json
{
  "name": "dotori-relay",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "fastify": "^5.2.0",
    "@fastify/cors": "^10.0.1",
    "@fastify/rate-limit": "^10.2.0",
    "@fastify/helmet": "^12.0.1"
  },
  "devDependencies": {
    "tsx": "^4.19.2",
    "typescript": "^5",
    "vitest": "^4.1.9",
    "@types/node": "^22"
  }
}
```

> 설치 전 `relay/`에서 `node_modules` 분리. `npm install`은 `relay/`에서 별도로 실행한다. 정확한 최신 버전은 설치 시 확정.

- [ ] **Step 2: `relay/tsconfig.json` 작성**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "../lib/toss/toss-client.ts"]
}
```

- [ ] **Step 2b: 루트 vitest에서 relay 테스트 제외**

루트 `vitest.config.ts`의 `test.exclude` 배열에 `"relay/**"`를 추가한다. (루트 vitest 기본 include가 `**/*.test.ts`라 추가하지 않으면 루트 `npm test`가 `relay/test/*.test.ts`까지 수집해, root의 jsdom 환경·`test/setup.ts`·root에 없는 fastify 의존성 때문에 깨진다.) 의도된 분리: **루트 CI는 루트 테스트만, relay 테스트는 `cd relay && npm test`로 실행.**

```ts
// vitest.config.ts (예시 — 기존 exclude 배열에 항목 추가)
test: {
  exclude: [...configDefaults.exclude, "**/.worktrees/**", "relay/**"],
  // ...기존 설정 유지
}
```

- [ ] **Step 3: `relay/src/config.ts` — env 로드 + CORS origin 매처 (실패 테스트 먼저)**

테스트 작성: `relay/test/config.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { isAllowedOrigin } from "../src/config";

describe("isAllowedOrigin", () => {
  const allow = isAllowedOrigin([
    "http://localhost:3000",
    "https://dotori-h4ppy-bee.vercel.app",
  ]);
  it("정확히 일치하는 Origin 허용", () => {
    expect(allow("http://localhost:3000")).toBe(true);
    expect(allow("https://dotori-h4ppy-bee.vercel.app")).toBe(true);
  });
  it("프리뷰 와일드카드(정규식) 허용", () => {
    expect(allow("https://dotori-abc123-h4ppy-bee.vercel.app")).toBe(true);
  });
  it("관계없는 Origin 거부", () => {
    expect(allow("https://evil.example.com")).toBe(false);
  });
});
```

- [ ] **Step 4: 테스트 실패 확인**

Run: `cd relay && npx vitest run test/config.test.ts`
Expected: FAIL ("isAllowedOrigin is not a function" 등)

- [ ] **Step 5: `relay/src/config.ts` 구현**

```ts
const PREVIEW_RE = /^https:\/\/dotori-[a-z0-9-]+-h4ppy-bee\.vercel\.app$/;

export function isAllowedOrigin(exact: string[]): (origin: string) => boolean {
  const set = new Set(exact);
  return (origin: string) => set.has(origin) || PREVIEW_RE.test(origin);
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`env ${name} 필요`);
  }
  return v;
}

export interface RelayConfig {
  port: number;
  allowedOrigins: string[];
  relaySecret: string;
  tossApiBase: string;
  rateMax: number;
  bodyLimit: number;
}

export function loadConfig(): RelayConfig {
  return {
    port: Number(process.env.PORT ?? 8787),
    allowedOrigins: required("ALLOWED_ORIGINS").split(",").map((s) => s.trim()),
    relaySecret: required("RELAY_SECRET"),
    tossApiBase: process.env.TOSS_API_BASE ?? "https://openapi.tossinvest.com",
    rateMax: Number(process.env.RATE_MAX ?? 60),
    bodyLimit: Number(process.env.BODY_LIMIT ?? 65536),
  };
}
```

> 타임아웃 `FETCH_TIMEOUT_MS`는 `config`에 두지 않는다. 공유 파일 `toss-client.ts`가 이 env를 **직접** 읽어 모든 fetch에 적용하므로(Task 5), relay 프로세스의 env로만 설정하면 된다.

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd relay && npx vitest run test/config.test.ts`
Expected: PASS

- [ ] **Step 7: `relay/src/server.ts` — `buildApp()` + healthz 골격**

```ts
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
```

- [ ] **Step 8: `relay/.env.example` 작성**

```
PORT=8787
ALLOWED_ORIGINS=http://localhost:3000,https://dotori-h4ppy-bee.vercel.app
RELAY_SECRET=change-me
TOSS_API_BASE=https://openapi.tossinvest.com
RATE_MAX=60
BODY_LIMIT=65536
FETCH_TIMEOUT_MS=10000
```

- [ ] **Step 9: healthz 테스트 + 커밋**

`relay/test/healthz.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildApp } from "../src/server";

const cfg = { port: 0, allowedOrigins: ["http://localhost:3000"], relaySecret: "s", tossApiBase: "https://x", rateMax: 60, bodyLimit: 65536 };

describe("GET /healthz", () => {
  it("인증 없이 200", async () => {
    const app = await buildApp(cfg as any);
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
```

Run: `cd relay && npm install && npx vitest run`
Expected: PASS

```bash
git add relay/ && git commit -m "feat: 릴레이 서버 스캐폴딩과 healthz 추가"
```

---

## Task 2: 토스 위임 핸들러 (toss-client 공유)

**Files:**
- Create: `relay/src/toss-handlers.ts`
- Test: `relay/test/toss-handlers.test.ts`

핵심: 5개 엔드포인트가 호출할 위임 함수를 한 곳에 모은다. `toss-client`의 `fetch`는 전역이라 테스트에서 `vi.stubGlobal("fetch", ...)`로 모킹한다. `TOSS_API_BASE`는 env로 주입.

- [ ] **Step 1: 실패 테스트 작성** — `token` 핸들러가 `exchangeToken`을 호출해 `{accessToken, expiresIn}`을 반환하는지. fetch 모킹.

- [ ] **Step 2: 실패 확인** (`cd relay && npx vitest run test/toss-handlers.test.ts`)

- [ ] **Step 3: 구현**

```ts
import {
  exchangeToken, fetchAccounts, fetchHoldings, fetchPrices, fetchExchangeRate,
  type NormalizedHolding, type NormalizedPrice,
} from "../../lib/toss/toss-client.js";

export const handlers = {
  token: (b: { clientId: string; clientSecret: string }) =>
    exchangeToken(b.clientId, b.clientSecret).then((t) => ({ accessToken: t.accessToken, expiresIn: t.expiresIn })),
  accounts: (b: { token: string }) =>
    fetchAccounts(b.token).then((accounts) => ({ accounts })),
  holdings: (b: { token: string; accountSeq: string }) =>
    fetchHoldings(b.token, b.accountSeq).then((holdings: NormalizedHolding[]) => ({ holdings })),
  prices: (b: { token: string; symbols: { symbol: string; currency: string }[] }) =>
    fetchPrices(b.token, b.symbols).then((prices: NormalizedPrice[]) => ({ prices })),
  "exchange-rate": (b: { token: string }) =>
    fetchExchangeRate(b.token).then(({ rate }) => ({ rate })),
};
```

> 주의: import 경로 `../../lib/toss/toss-client.js` (tsx/ESM). `TossError`도 함께 export해 라우트의 에러 매핑에 사용.

- [ ] **Step 4: 통과 확인 → 커밋** `feat: 토스 위임 핸들러 추가 (toss-client 공유)`

---

## Task 3: 라우트 + JSON 스키마 + 에러 매핑

**Files:**
- Create: `relay/src/routes.ts`
- Modify: `relay/src/server.ts` (라우트 등록)
- Test: `relay/test/routes.test.ts`

기존 [app/api/toss/token/route.ts](../../../app/api/toss/token/route.ts) 에러 매핑을 그대로 따른다: `TossError` → 해당 status + 코드화 에러, 그 외 → 400 `bad_request`. 토스 원문 미노출.

> 참고(spec 권고): `fetchHoldings`·`fetchExchangeRate`는 기존부터 429 재시도 경로가 없다. 릴레이는 이 동작을 **그대로 계승**하며 새로 고치지 않는다(YAGNI).

- [ ] **Step 1: 실패 테스트** — 각 엔드포인트 정상 응답(핸들러 모킹), 스키마 위반 시 400, TossError 시 상태 전파.

각 라우트는 JSON 스키마로 body 검증:
```ts
const tokenSchema = {
  body: {
    type: "object",
    required: ["clientId", "clientSecret"],
    properties: {
      clientId: { type: "string", minLength: 1, maxLength: 512 },
      clientSecret: { type: "string", minLength: 1, maxLength: 512 },
    },
    additionalProperties: false,
  },
};
// accounts/exchange-rate: { token }, holdings: { token, accountSeq }, prices: { token, symbols[] }
```

- [ ] **Step 2: 실패 확인**

- [ ] **Step 3: `routes.ts` 구현** — `app.post("/token", { schema: tokenSchema }, handler)` 형태로 5개. 핸들러는 `handlers[name]` 위임 + try/catch 에러 매핑. `Cache-Control: no-store` 응답 헤더.

- [ ] **Step 4: `server.ts`에서 `await registerRoutes(app, config)` 호출**

- [ ] **Step 5: 통과 확인 → 커밋** `feat: 릴레이 5개 엔드포인트와 입력검증 추가`

---

## Task 4: 보안 미들웨어

**Files:**
- Create: `relay/src/security.ts`
- Modify: `relay/src/server.ts`
- Test: `relay/test/security.test.ts`

- [ ] **Step 1: 실패 테스트**
  - CORS: 허용 Origin preflight 200/허용 헤더, 비허용 Origin 거부.
  - 시크릿: `X-Relay-Secret` 누락/불일치 → 401, 일치 → 통과. (healthz는 예외로 인증 불필요)
  - rate-limit: 한도 초과 시 429.

- [ ] **Step 2: 실패 확인**

- [ ] **Step 3: `security.ts` 구현**

```ts
import type { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { isAllowedOrigin, type RelayConfig } from "./config.js";

export async function registerSecurity(app: FastifyInstance, cfg: RelayConfig): Promise<void> {
  await app.register(helmet);
  const allow = isAllowedOrigin(cfg.allowedOrigins);
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || allow(origin)) {
        cb(null, true);
        return;
      }
      cb(new Error("origin not allowed"), false);
    },
    methods: ["POST", "GET", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Relay-Secret"],
  });
  await app.register(rateLimit, { max: cfg.rateMax, timeWindow: "1 minute" });

  // 공유 시크릿 검증 (healthz 제외)
  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/healthz") {
      return;
    }
    if (req.method === "OPTIONS") {
      return;
    }
    if (req.headers["x-relay-secret"] !== cfg.relaySecret) {
      reply.code(401).send({ error: "unauthorized" });
    }
  });
}
```

- [ ] **Step 4: `server.ts`에서 라우트보다 **먼저** `registerSecurity` 호출**

- [ ] **Step 5: 통과 확인 → 커밋** `feat: 릴레이 보안 미들웨어(CORS·시크릿·rate-limit·helmet) 추가`

---

## Task 5: fetch 타임아웃 + 로깅 위생

**Files:**
- Modify: `relay/src/server.ts` (logger redact)
- 검토: `lib/toss/toss-client.ts` 타임아웃 적용 방식

- [ ] **Step 1: logger redact 설정** — Fastify logger에 민감 헤더/필드 마스킹.

```ts
const app = Fastify({
  bodyLimit: config.bodyLimit,
  logger: { redact: ["req.headers.x-relay-secret", "req.body.clientSecret", "req.body.token"] },
});
```

- [ ] **Step 2: fetch 타임아웃** — `toss-client.ts`의 `fetch` 호출에 타임아웃을 적용해야 하지만, `toss-client`는 공유 파일이라 시그니처를 바꾸면 Next 라우트에도 영향. 결정: 환경변수 `FETCH_TIMEOUT_MS`(config의 이름과 동일)를 `toss-client` 내부에서 직접 읽어 모든 fetch에 `signal: AbortSignal.timeout(ms)` 부여(미설정이면 signal 없음 = 기존 동작). 이러면 양쪽 공유 + 하위호환. (relay는 `relay/.env`의 `FETCH_TIMEOUT_MS`로, Next 라우트는 미설정으로 둠.)
  - 실패 테스트: 타임아웃 env 설정 시 fetch에 signal이 전달되는지(fetch 모킹으로 두 번째 인자 검사).

- [ ] **Step 3: 구현 → 통과 확인 → 커밋** `feat: 릴레이 로깅 마스킹과 토스 fetch 타임아웃 추가`

> typecheck: 루트와 relay 각각. `npm run typecheck`(루트) + `cd relay && npm run typecheck`.

---

## Task 6: 클라이언트 분기 헬퍼

**Files:**
- Create: `lib/toss/relay-endpoint.ts`
- Test: `test/toss/relay-endpoint.test.ts`

- [ ] **Step 1: 실패 테스트** — `test/toss/relay-endpoint.test.ts`

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { tossEndpoint } from "@/lib/toss/relay-endpoint";

afterEach(() => { vi.unstubAllEnvs(); });

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
```

> Next의 `NEXT_PUBLIC_*`는 빌드 타임 인라인이라 테스트에선 `vi.stubEnv`로 대체. 구현은 `process.env.NEXT_PUBLIC_RELAY_URL`을 직접 읽는다.

- [ ] **Step 2: 실패 확인** `npx vitest run test/toss/relay-endpoint.test.ts`

- [ ] **Step 3: 구현** — `lib/toss/relay-endpoint.ts`

```ts
export function tossEndpoint(path: string): { url: string; headers: Record<string, string> } {
  const base = process.env.NEXT_PUBLIC_RELAY_URL;
  const secret = process.env.NEXT_PUBLIC_RELAY_SECRET;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (base && secret) {
    headers["X-Relay-Secret"] = secret;
  }
  return {
    url: base ? `${base}${path}` : `/api/toss${path}`,
    headers,
  };
}
```

- [ ] **Step 4: 통과 확인 → 커밋** `feat: 토스 호출 릴레이 분기 헬퍼 추가`

---

## Task 7: 호출 지점에 분기 헬퍼 적용

**Files:**
- Modify: `lib/toss/toss-token.ts` (`/api/toss/token` fetch)
- Modify: `lib/sync/refresh.ts` (`proxyPost`, `proxyPostWithTokenRetry`)

> `toss-token.ts`와 `refresh.ts`는 fetch 패턴이 달라 **각각** 수정한다. 401 재시도 계약(`proxyPostWithTokenRetry`)은 릴레이가 라우트와 동일하게 401을 전파하므로 그대로 보존된다.

- [ ] **Step 1: `toss-token.ts` 수정** — `fetch("/api/toss/token", ...)` → `const { url, headers } = tossEndpoint("/token"); fetch(url, { method: "POST", headers, body })`. 경로에서 `/api/toss` 접두 제거(`/token`).

- [ ] **Step 2: `refresh.ts` 수정** — `proxyPost`/`proxyPostWithTokenRetry`의 `path` 인자를 릴레이 경로(`/accounts` 등)로 바꾸고, 두 함수 내부 `fetch(path, ...)`를 `tossEndpoint(path)` 기반으로. 호출처 4곳의 경로 문자열에서 `/api/toss` 접두 제거.

- [ ] **Step 3: 기존 테스트 회귀 확인** — `npm test`(루트). refresh 관련 테스트가 깨지지 않는지. fetch 모킹이 경로를 기대하면 업데이트.

- [ ] **Step 4: typecheck·lint·test 통과 → 커밋** `refactor: 토스 호출을 릴레이 분기 헬퍼로 통일`

Run: `npm run typecheck && npm run lint && npm test`

---

## Task 8: dev end-to-end 연결 검증 (수동)

코드가 아닌 검증 절차. 통과 전 인프라(Task 9+)로 넘어가지 않는다.

- [ ] **Step 1: 릴레이 로컬 실행** — `cd relay && cp .env.example .env` 후 `RELAY_SECRET` 설정, `ALLOWED_ORIGINS=http://localhost:3000`. `npm run dev` → `http://localhost:8787` 기동. `curl localhost:8787/healthz` → `{"ok":true}`.
- [ ] **Step 2: 프론트 `.env.local` 설정** — `NEXT_PUBLIC_RELAY_URL=http://localhost:8787`, `NEXT_PUBLIC_RELAY_SECRET=<위와 동일>`.
- [ ] **Step 3: `npm run dev`로 앱 기동 후 토스 동기화 수행** — 정상 흐름(토큰→보유→시세→환율) 확인.
- [ ] **Step 4: 음성 경로 확인** — 시크릿 헤더 제거 시 401, 잘못된 body 400, 과다 호출 429, 비허용 Origin 차단(브라우저 콘솔 CORS 에러).
- [ ] **Step 5: 검증 결과 기록** — spec/plan에 체크. 통과 시에만 다음 단계.

---

## Task 9: 인프라 셋업 런북 (Oracle VM — 사용자와 함께 진행)

코드가 아닌 운영 절차. 각 단계는 사용자와 함께 세세히 설명하며 실행. 산출물은 `infra/relay/`에 저장.

- [ ] **Step 1: Oracle Free Tier VM 생성** — 리전/shape는 Free Tier 한도 내 선택, Ubuntu LTS 권장. 고정 공인 IP(Reserved Public IP) 부여.
- [ ] **Step 2: Oracle NSG/Security List** — 인바운드 22(내 IP만)·80·443만 허용.
- [ ] **Step 3: OS 방화벽** — Ubuntu면 ufw(22/80/443). (Oracle Linux면 iptables 기본 차단 주의.)
- [ ] **Step 4: SSH 하드닝** — 키 인증만, `PasswordAuthentication no`, `PermitRootLogin no`. fail2ban 설치.
- [ ] **Step 5: 자동 보안 패치** — `unattended-upgrades` 활성화.
- [ ] **Step 6: Node 22 설치 + 전용 유저** — `relay` 저권한 유저 생성, 레포 클론 또는 `relay/` 산출물 배치, `npm ci`(relay).
- [ ] **Step 7: systemd 유닛** — `infra/relay/dotori-relay.service` 작성. `ExecStart=tsx src/server.ts`(또는 절대경로), `User=relay`, `EnvironmentFile=/etc/dotori-relay.env`. enable + start.
- [ ] **Step 8: Caddy 설치 + Caddyfile** — `infra/relay/Caddyfile`: `<IP를-대시로>.nip.io { reverse_proxy localhost:8787 }`. 자동 TLS.
- [ ] **Step 9: 기동 검증** — `https://<ip>.nip.io/healthz` 200 확인.

---

## Task 10: 토스 IP 등록 + Vercel 연결 + 프로덕션 검증

- [ ] **Step 1: 토스 콘솔에 VM 공인 IP 등록.**
- [ ] **Step 2: Vercel 환경변수 설정** — `NEXT_PUBLIC_RELAY_URL=https://<ip>.nip.io`, `NEXT_PUBLIC_RELAY_SECRET=<프로덕션 시크릿>`. 릴레이 `.env`의 `RELAY_SECRET`·`ALLOWED_ORIGINS`도 프로덕션 값으로.
- [ ] **Step 3: `.vercelignore`에 `relay/` 추가** — Vercel이 릴레이를 빌드/배포하지 않도록.
- [ ] **Step 4: main 머지 → 프로덕션 배포** (dtr-deploy 흐름, **푸시/머지 전 사용자 확인 필수**).
- [ ] **Step 5: 프로덕션에서 토스 동기화 end-to-end 검증.**

---

## 검증 게이트 (전 구간 공통)

코드 태스크 후: 루트 `npm run typecheck && npm run lint && npm test`, 릴레이 `cd relay && npm run typecheck && npm test` 모두 통과.

## CI 메모

`.github/workflows/ci.yml`는 루트 `npm test`만 돌린다. 릴레이 테스트도 CI에 포함하려면 워크플로에 `relay` 설치·테스트 잡을 추가하는 것을 별도로 검토(이번 범위에서 선택).
