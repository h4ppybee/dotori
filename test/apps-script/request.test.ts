import { describe, it, expect, vi } from "vitest";
import { postAppsScript } from "@/lib/apps-script/request";

const WEB_APP_URL = "https://script.google.com/macros/s/test-deployment/exec";
const res = (text: string, ok = true) => ({ ok, text: async () => text }) as unknown as Response;

describe("postAppsScript", () => {
  it("text/plain으로 POST하고 객체 JSON이면 json으로 돌려준다", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(JSON.stringify({ ok: true, n: 1 })));
    const reply = await postAppsScript(WEB_APP_URL, { action: "sync.meta", secret: "test-secret" }, { fetchImpl });
    expect(reply).toEqual({ kind: "json", json: { ok: true, n: 1 } });
    const [calledUrl, init] = fetchImpl.mock.calls[0];
    expect(calledUrl).toBe(WEB_APP_URL);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("follow");
    expect(init.headers["Content-Type"]).toBe("text/plain;charset=utf-8");
    expect(JSON.parse(init.body)).toEqual({ action: "sync.meta", secret: "test-secret" });
  });

  it("HTTP 오류·JSON 아님·객체가 아닌 JSON → badResponse", async () => {
    for (const r of [res("{}", false), res("<html>"), res("null"), res("42"), res("[1]")]) {
      const fetchImpl = vi.fn().mockResolvedValue(r);
      expect(await postAppsScript(WEB_APP_URL, {}, { fetchImpl })).toEqual({ kind: "badResponse" });
    }
  });

  it("fetch 실패 → network", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await postAppsScript(WEB_APP_URL, {}, { fetchImpl })).toEqual({ kind: "network" });
  });

  it("타임아웃 → network", async () => {
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => {
      init.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    expect(await postAppsScript(WEB_APP_URL, {}, {
      fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 10,
    })).toEqual({ kind: "network" });
  });
});
