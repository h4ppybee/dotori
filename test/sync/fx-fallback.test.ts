import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db/schema";
import { fetchPublicUsdKrw, ensureFxFallback } from "@/lib/sync/fx-fallback";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const okResponse = (rate: unknown) => ({
  ok: true,
  json: async () => ({ result: "success", rates: { KRW: rate } }),
});

beforeEach(() => {
  fetchMock.mockReset();
});
afterEach(async () => {
  await db.delete();
  await db.open();
});

describe("fetchPublicUsdKrw", () => {
  it("정상 응답에서 KRW 환율을 반환한다", async () => {
    fetchMock.mockResolvedValue(okResponse(1400.5));
    await expect(fetchPublicUsdKrw()).resolves.toBe(1400.5);
  });

  it("HTTP 실패면 예외를 던진다", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    await expect(fetchPublicUsdKrw()).rejects.toThrow("503");
  });

  it.each([undefined, 0, -1, NaN, "1400"])("rates.KRW가 %s면 예외를 던진다", async (bad) => {
    fetchMock.mockResolvedValue(okResponse(bad));
    await expect(fetchPublicUsdKrw()).rejects.toThrow();
  });
});

describe("ensureFxFallback", () => {
  const NOW = Date.UTC(2026, 6, 2, 9, 0); // 2026-07-02 UTC

  it("환율이 없으면 공개 API로 채운다", async () => {
    fetchMock.mockResolvedValue(okResponse(1391.2));
    await expect(ensureFxFallback(NOW)).resolves.toBe(true);
    const fx = await db.fxRates.get("USDKRW");
    expect(fx).toMatchObject({ pair: "USDKRW", rate: 1391.2, asOf: NOW });
  });

  it("오늘자 환율이 이미 있으면 호출하지 않고 스킵한다", async () => {
    await db.fxRates.put({ pair: "USDKRW", rate: 1380, asOf: NOW - 60_000 });
    await expect(ensureFxFallback(NOW)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await db.fxRates.get("USDKRW"))?.rate).toBe(1380);
  });

  it("어제자(스테일) 환율은 교체한다", async () => {
    await db.fxRates.put({ pair: "USDKRW", rate: 1380, asOf: NOW - 24 * 3600 * 1000 });
    fetchMock.mockResolvedValue(okResponse(1395));
    await expect(ensureFxFallback(NOW)).resolves.toBe(true);
    expect((await db.fxRates.get("USDKRW"))?.rate).toBe(1395);
  });

  it("공개 API 실패 시 조용히 기존 환율을 유지한다", async () => {
    await db.fxRates.put({ pair: "USDKRW", rate: 1380, asOf: NOW - 24 * 3600 * 1000 });
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(ensureFxFallback(NOW)).resolves.toBe(false);
    expect((await db.fxRates.get("USDKRW"))?.rate).toBe(1380);
  });
});
