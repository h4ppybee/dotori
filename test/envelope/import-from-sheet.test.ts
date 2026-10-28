import { describe, it, expect, vi, afterEach } from "vitest";
import { db } from "@/lib/db/schema";
import { deriveKey, makeSalt } from "@/lib/crypto/crypto";
import { saveSheetExportConfig, listEnvelopeItems } from "@/lib/db/local-store";
import {
  importEnvelopeFromSheet, SHEET_NOT_CONNECTED_MESSAGE,
} from "@/lib/envelope/import-from-sheet";
import { SHEET_TABLE_NOT_FOUND } from "@/lib/envelope/sheet-import";
import { SHEET_EXPORT_MESSAGES } from "@/lib/sheet-export/client";
import { SHEET_SECRET_DECRYPT_MESSAGE } from "@/lib/sheet-export/export";

afterEach(async () => { await db.delete(); await db.open(); });

const WEB_APP_URL = "https://script.google.com/macros/s/abc/exec";
const jsonRes = (body: unknown) =>
  ({ ok: true, text: async () => JSON.stringify(body) }) as unknown as Response;

// 가상 예시 그리드
const values = [
  ["태그", "은행", "항목", "금액"],
  ["저축", "은행A", "청년도약적금", 50],
  ["생활비", "은행B", "용돈", 20],
  ["태그", "위치", "항목", "금액"],
  ["투자", "본인", "적립식", 30],
];

async function connectedKey() {
  const key = await deriveKey("pp", makeSalt());
  await saveSheetExportConfig(key, { webAppUrl: WEB_APP_URL, secret: "s3cret" });
  return key;
}

describe("importEnvelopeFromSheet", () => {
  it("시트 연결이 없으면 안내 메시지, fetch하지 않는다", async () => {
    const key = await deriveKey("pp", makeSalt());
    const fetchImpl = vi.fn();
    expect(await importEnvelopeFromSheet({ key, fetchImpl }))
      .toEqual({ status: "error", message: SHEET_NOT_CONNECTED_MESSAGE });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("비밀키로 읽어 파싱 결과와 프로필별 개수를 돌려주고 DB는 건드리지 않는다", async () => {
    const key = await connectedKey();
    const fetchImpl = vi.fn().mockResolvedValue(jsonRes({ ok: true, values }));

    const r = await importEnvelopeFromSheet({ key, fetchImpl });

    expect(r.status).toBe("ok");
    if (r.status !== "ok") {
      return;
    }
    expect(r.counts).toEqual({ wife: 2, husband: 1 });
    expect(r.items.map((i) => i.name)).toEqual(["청년도약적금", "용돈", "적립식"]);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body))
      .toEqual({ version: 1, secret: "s3cret", action: "readEnvelope" });
    expect(await listEnvelopeItems()).toEqual([]);
  });

  it("표를 못 찾거나 읽기 실패면 그 메시지를 돌려준다", async () => {
    const key = await connectedKey();
    const notTable = vi.fn().mockResolvedValue(jsonRes({ ok: true, values: [["메모"]] }));
    expect(await importEnvelopeFromSheet({ key, fetchImpl: notTable }))
      .toEqual({ status: "error", message: SHEET_TABLE_NOT_FOUND });
    const offline = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await importEnvelopeFromSheet({ key, fetchImpl: offline }))
      .toEqual({ status: "error", message: SHEET_EXPORT_MESSAGES.network });
  });

  it("다른 키로는 복호화 실패 메시지를 돌려주고 throw하지 않는다", async () => {
    await connectedKey();
    const other = await deriveKey("other", makeSalt());
    expect(await importEnvelopeFromSheet({ key: other, fetchImpl: vi.fn() }))
      .toEqual({ status: "error", message: SHEET_SECRET_DECRYPT_MESSAGE });
  });
});
