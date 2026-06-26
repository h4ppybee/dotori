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
