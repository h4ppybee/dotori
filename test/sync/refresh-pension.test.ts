import { describe, it, expect, vi, afterEach } from "vitest";
import { db } from "@/lib/db/schema";
import * as store from "@/lib/db/local-store";
import { deriveKey, encrypt, makeSalt } from "@/lib/crypto/crypto";
import { refreshPensionPrices } from "@/lib/sync/refresh";
import type { PensionAccount } from "@/lib/types";

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await db.delete();
  await db.open();
});

const pensionRow: PensionAccount = {
  id: "p1", category: "PERSONAL", name: "연금ETF", symbol: "000002", quantity: 10,
  buyPrice: 10_000, currentPrice: 10_000, sortOrder: 0, updatedAt: 1,
};

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

/** 토스 토큰·시세 프록시를 흉내 낸다. onPrices는 시세 응답 직전에 실행한다(응답을 기다리는 사이의 변경). */
function stubTossPrices(lastPrice: number, onPrices?: () => Promise<void>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/api/toss/token")) {
      return json({ accessToken: "T", expiresIn: 3600 });
    }
    if (url.includes("/api/toss/prices")) {
      if (onPrices) {
        await onPrices();
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as { symbols: { symbol: string }[] };
      return json({ prices: body.symbols.map((s) => ({ symbol: s.symbol, currency: "KRW", lastPrice })) });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }));
}

async function seed() {
  const key = await deriveKey("pp", makeSalt());
  await store.upsertConnection({
    memberId: "m1", type: "TOSS_API", label: "토스", clientId: "id", clientSecretEnc: await encrypt(key, "secret"),
  });
  await db.pension.put(pensionRow);
  return key;
}

describe("refreshPensionPrices — 시세 필드만 갱신", () => {
  it("현재가만 바꾸고 나머지 필드는 그대로 둔다", async () => {
    const key = await seed();
    stubTossPrices(12_000);

    expect(await refreshPensionPrices({ key })).toEqual({ updated: 1, failures: [] });

    const row = await db.pension.get("p1");
    expect(row).toMatchObject({ ...pensionRow, currentPrice: 12_000, updatedAt: expect.any(Number) });
    expect(row?.updatedAt).not.toBe(1);
  });

  it("시세를 기다리는 사이 바뀐 다른 필드(기기 동기화 적용·편집)를 덮지 않는다", async () => {
    const key = await seed();
    stubTossPrices(12_000, async () => {
      await db.pension.update("p1", { quantity: 20, name: "연금ETF 수정" });
    });

    await refreshPensionPrices({ key });

    expect(await db.pension.get("p1")).toMatchObject({ quantity: 20, name: "연금ETF 수정", currentPrice: 12_000 });
  });

  it("시세를 기다리는 사이 지워진 행을 되살리지 않는다", async () => {
    const key = await seed();
    stubTossPrices(12_000, async () => {
      await db.pension.delete("p1");
    });

    await refreshPensionPrices({ key });

    expect(await db.pension.count()).toBe(0);
  });
});
