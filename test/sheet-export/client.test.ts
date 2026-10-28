import { describe, it, expect, vi } from "vitest";
import {
  postSheetExport, postSheetRead, isValidWebAppUrl, SHEET_EXPORT_MESSAGES,
} from "@/lib/sheet-export/client";

const WEB_APP_URL = "https://script.google.com/macros/s/AKfy-abc_123/exec";
const body = { version: 1 as const, secret: "s", tabs: [] };
const res = (text: string, ok = true) => ({ ok, text: async () => text }) as unknown as Response;

describe("isValidWebAppUrl", () => {
  it("…/macros/s/<id>/exec 형식만 허용", () => {
    expect(isValidWebAppUrl(WEB_APP_URL)).toBe(true);
    expect(isValidWebAppUrl("https://script.google.com/a/example.com/macros/s/abc/exec")).toBe(true);
    expect(isValidWebAppUrl("https://script.google.com/macros/s/abc/dev")).toBe(false);
    expect(isValidWebAppUrl("https://docs.google.com/spreadsheets/d/abc/edit")).toBe(false);
    expect(isValidWebAppUrl("http://script.google.com/macros/s/abc/exec")).toBe(false);
  });
});

describe("postSheetExport", () => {
  it("text/plain POST로 본문을 보내고 ok 응답을 정규화한다", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(JSON.stringify({ ok: true, writtenAt: "2026-10-21T00:00:00Z" })));
    const result = await postSheetExport(WEB_APP_URL, body, { fetchImpl });
    expect(result).toEqual({ status: "ok", writtenAt: "2026-10-21T00:00:00Z" });
    const [calledUrl, init] = fetchImpl.mock.calls[0];
    expect(calledUrl).toBe(WEB_APP_URL);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("text/plain;charset=utf-8");
    expect(JSON.parse(init.body)).toEqual(body);
  });

  it("UNAUTHORIZED → 비밀키 불일치 메시지", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(JSON.stringify({ ok: false, error: "UNAUTHORIZED" })));
    expect(await postSheetExport(WEB_APP_URL, body, { fetchImpl }))
      .toEqual({ status: "error", message: SHEET_EXPORT_MESSAGES.unauthorized });
  });

  it("BUSY → 진행 중 메시지", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(JSON.stringify({ ok: false, error: "BUSY" })));
    expect(await postSheetExport(WEB_APP_URL, body, { fetchImpl }))
      .toEqual({ status: "error", message: SHEET_EXPORT_MESSAGES.busy });
  });

  it("BAD_REQUEST·JSON 아님·HTTP 오류 → 응답 해석 실패 메시지", async () => {
    for (const r of [res(JSON.stringify({ ok: false, error: "BAD_REQUEST" })), res("<html>"), res("{}", false)]) {
      const fetchImpl = vi.fn().mockResolvedValue(r);
      expect(await postSheetExport(WEB_APP_URL, body, { fetchImpl }))
        .toEqual({ status: "error", message: SHEET_EXPORT_MESSAGES.badResponse });
    }
  });

  it("그 밖의 스크립트 오류는 원문을 덧붙인다", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(JSON.stringify({ ok: false, error: "Exception: 권한 없음" })));
    expect(await postSheetExport(WEB_APP_URL, body, { fetchImpl }))
      .toEqual({ status: "error", message: `${SHEET_EXPORT_MESSAGES.scriptError} Exception: 권한 없음` });
  });

  it("네트워크 오류 → 연결 실패 메시지", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await postSheetExport(WEB_APP_URL, body, { fetchImpl }))
      .toEqual({ status: "error", message: SHEET_EXPORT_MESSAGES.network });
  });

  it("타임아웃 → 연결 실패 메시지", async () => {
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => {
      init.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    expect(await postSheetExport(WEB_APP_URL, body, { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 10 }))
      .toEqual({ status: "error", message: SHEET_EXPORT_MESSAGES.network });
  });
});

describe("postSheetRead", () => {
  const readBody = { version: 1 as const, secret: "s", action: "readEnvelope" as const };

  it("readEnvelope 본문을 보내고 values를 돌려준다", async () => {
    const values = [["태그", "금액"], ["저축", 70]];
    const fetchImpl = vi.fn().mockResolvedValue(res(JSON.stringify({ ok: true, values })));
    expect(await postSheetRead(WEB_APP_URL, readBody, { fetchImpl })).toEqual({ status: "ok", values });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual(readBody);
  });

  it("NO_SOURCE_TAB → 원본 탭 없음 메시지", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(JSON.stringify({ ok: false, error: "NO_SOURCE_TAB" })));
    expect(await postSheetRead(WEB_APP_URL, readBody, { fetchImpl }))
      .toEqual({ status: "error", message: SHEET_EXPORT_MESSAGES.noSourceTab });
  });

  it("예전 스크립트(BAD_REQUEST)·values 없음·JSON 아님 → 응답 해석 실패 메시지", async () => {
    for (const r of [
      res(JSON.stringify({ ok: false, error: "BAD_REQUEST" })),
      res(JSON.stringify({ ok: true })),
      res("<html>"),
    ]) {
      const fetchImpl = vi.fn().mockResolvedValue(r);
      expect(await postSheetRead(WEB_APP_URL, readBody, { fetchImpl }))
        .toEqual({ status: "error", message: SHEET_EXPORT_MESSAGES.badResponse });
    }
  });

  it("UNAUTHORIZED·네트워크 오류는 내보내기와 같은 메시지", async () => {
    const unauthorized = vi.fn().mockResolvedValue(res(JSON.stringify({ ok: false, error: "UNAUTHORIZED" })));
    expect(await postSheetRead(WEB_APP_URL, readBody, { fetchImpl: unauthorized }))
      .toEqual({ status: "error", message: SHEET_EXPORT_MESSAGES.unauthorized });
    const offline = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await postSheetRead(WEB_APP_URL, readBody, { fetchImpl: offline }))
      .toEqual({ status: "error", message: SHEET_EXPORT_MESSAGES.network });
  });
});
