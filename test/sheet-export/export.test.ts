import { describe, it, expect, vi, afterEach } from "vitest";
import { db } from "@/lib/db/schema";
import { deriveKey, makeSalt } from "@/lib/crypto/crypto";
import { saveSheetExportConfig } from "@/lib/db/local-store";
import { exportToSheet, SHEET_SECRET_DECRYPT_MESSAGE } from "@/lib/sheet-export/export";
import { SHEET_TABS } from "@/lib/sheet-export/build-payload";

afterEach(async () => { await db.delete(); await db.open(); });

const WEB_APP_URL = "https://script.google.com/macros/s/abc/exec";
const okRes = () =>
  ({ ok: true, text: async () => JSON.stringify({ ok: true, writtenAt: "W" }) }) as unknown as Response;
const NOW = new Date(2026, 9, 21, 9, 30).getTime();

describe("exportToSheet", () => {
  it("설정이 없으면 skipped, fetch를 호출하지 않는다", async () => {
    const key = await deriveKey("pp", makeSalt());
    const fetchImpl = vi.fn();
    expect(await exportToSheet({ key, now: NOW, fetchImpl })).toEqual({ status: "skipped" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("복호화한 비밀키와 DB 데이터로 페이로드를 보낸다", async () => {
    const key = await deriveKey("pp", makeSalt());
    await saveSheetExportConfig(key, { webAppUrl: WEB_APP_URL, secret: "s3cret" });
    await db.savings.put({
      id: "s1", category: "DEPOSIT", name: "청년도약", amount: 1_000_000,
      sortOrder: 0, updatedAt: 1, source: "MANUAL",
    });
    const fetchImpl = vi.fn().mockResolvedValue(okRes());

    expect(await exportToSheet({ key, now: NOW, fetchImpl })).toEqual({ status: "ok", writtenAt: "W" });

    const [calledUrl, init] = fetchImpl.mock.calls[0];
    expect(calledUrl).toBe(WEB_APP_URL);
    const sent = JSON.parse(init.body);
    expect(sent.version).toBe(1);
    expect(sent.secret).toBe("s3cret");
    const assets = sent.tabs.find((t: { name: string }) => t.name === SHEET_TABS.assets);
    expect(assets.rows[1][2]).toBe("청년도약");
    const meta = sent.tabs.find((t: { name: string }) => t.name === SHEET_TABS.meta);
    expect(meta.rows[1]).toEqual(["2026.10.21 09:30", 1_000_000, 0, 1_000_000]);
  });

  it("다른 키(잠금 직후·PIN 불일치)로는 복호화 실패를 error로 반환하고 throw하지 않는다", async () => {
    const key = await deriveKey("pp", makeSalt());
    const other = await deriveKey("other", makeSalt());
    await saveSheetExportConfig(key, { webAppUrl: WEB_APP_URL, secret: "s" });
    const fetchImpl = vi.fn();
    expect(await exportToSheet({ key: other, now: NOW, fetchImpl }))
      .toEqual({ status: "error", message: SHEET_SECRET_DECRYPT_MESSAGE });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("환율 없이 USD 주식이 있으면 빌더 예외 메시지를 error로 반환한다", async () => {
    const key = await deriveKey("pp", makeSalt());
    await saveSheetExportConfig(key, { webAppUrl: WEB_APP_URL, secret: "s" });
    await db.holdings.put({
      id: "h1", connectionId: "c1", market: "NASDAQ", symbol: "QQQM", name: "QQQM",
      sector: "미분류", currency: "USD", quantity: 1, avgBuyPrice: 100, source: "MANUAL", updatedAt: 1,
    });
    const result = await exportToSheet({ key, now: NOW, fetchImpl: vi.fn() });
    expect(result.status).toBe("error");
  });
});
