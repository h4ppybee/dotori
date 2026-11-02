import { describe, it, expect, vi } from "vitest";
import { syncMeta, syncGet, syncPut, SYNC_MAX_BODY_CHARS, type SyncPutInput } from "@/lib/device-sync/client";
import { DEVICE_SYNC_MESSAGES } from "@/lib/device-sync/messages";

const res = (json: unknown) => ({ ok: true, text: async () => JSON.stringify(json) }) as unknown as Response;
const conn = (json: unknown) => ({
  url: "https://script.google.com/macros/s/test-deployment/exec",
  secret: "test-secret",
  fetchImpl: vi.fn().mockResolvedValue(res(json)),
});
const blob = { v: 1 as const, alg: "A256GCM" as const, iv: "aXY=", ct: "Y3Q=", keyId: "0011223344556677" };
const putInput: SyncPutInput = { baseRevision: 0, keyId: "0011223344556677", deviceName: "테스트 기기", blob };

describe("syncMeta", () => {
  it("action·secret을 보내고 빈 서버를 구분한다", async () => {
    const c = conn({ ok: true, empty: true });
    expect(await syncMeta(c)).toEqual({ status: "ok", meta: { empty: true } });
    expect(JSON.parse(c.fetchImpl.mock.calls[0][1].body)).toEqual({ action: "sync.meta", secret: "test-secret" });
  });

  it("메타를 정규화한다", async () => {
    const c = conn({ ok: true, revision: 3, savedAt: "2026-01-01T00:00:00.000Z", deviceName: "다른 기기", keyId: "aa" });
    expect(await syncMeta(c)).toEqual({
      status: "ok",
      meta: { empty: false, revision: 3, savedAt: "2026-01-01T00:00:00.000Z", deviceName: "다른 기기", keyId: "aa" },
    });
  });

  it("UNAUTHORIZED·BUSY·형식 오류(예전 스크립트의 BAD_REQUEST 포함)를 메시지로 바꾼다", async () => {
    expect(await syncMeta(conn({ ok: false, error: "UNAUTHORIZED" })))
      .toEqual({ status: "error", message: DEVICE_SYNC_MESSAGES.unauthorized });
    expect(await syncMeta(conn({ ok: false, error: "BUSY" })))
      .toEqual({ status: "error", message: DEVICE_SYNC_MESSAGES.busy });
    expect(await syncMeta(conn({ ok: false, error: "BAD_REQUEST" })))
      .toEqual({ status: "error", message: DEVICE_SYNC_MESSAGES.badResponse });
    expect(await syncMeta(conn({ ok: true, revision: "x" })))
      .toEqual({ status: "error", message: DEVICE_SYNC_MESSAGES.badResponse });
  });

  it("네트워크 실패 → network 메시지", async () => {
    const c = { ...conn({}), fetchImpl: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) };
    expect(await syncMeta(c)).toEqual({ status: "error", message: DEVICE_SYNC_MESSAGES.network });
  });
});

describe("syncGet", () => {
  it("revision·출처·봉투를 돌려준다", async () => {
    const c = conn({ ok: true, revision: 2, savedAt: "S", deviceName: "다른 기기", keyId: "0011223344556677", blob });
    expect(await syncGet(c)).toEqual({
      status: "ok", remote: { revision: 2, savedAt: "S", deviceName: "다른 기기" }, keyId: "0011223344556677", blob,
    });
  });

  it("SYNC_FILE_MISSING → 파일을 찾지 못했다는 메시지(저장 실패 문구와 구분)", async () => {
    expect(await syncGet(conn({ ok: false, error: "SYNC_FILE_MISSING" })))
      .toEqual({ status: "error", message: DEVICE_SYNC_MESSAGES.fileMissing });
  });

  it("빈 서버 → empty, 봉투 형식이 아니면 badResponse", async () => {
    expect(await syncGet(conn({ ok: true, empty: true }))).toEqual({ status: "empty" });
    expect(await syncGet(conn({ ok: true, revision: 2, savedAt: "S", deviceName: "d", keyId: "k", blob: { v: 9 } })))
      .toEqual({ status: "error", message: DEVICE_SYNC_MESSAGES.badResponse });
  });
});

describe("syncPut", () => {
  it("본문에 action·secret·입력을 담고 ok를 정규화한다", async () => {
    const c = conn({ ok: true, revision: 1, savedAt: "S" });
    expect(await syncPut(c, putInput)).toEqual({ status: "ok", revision: 1, savedAt: "S" });
    expect(JSON.parse(c.fetchImpl.mock.calls[0][1].body)).toEqual({ action: "sync.put", secret: "test-secret", ...putInput });
  });

  it("CONFLICT → 원격 메타, KEY_MISMATCH → 키 메시지", async () => {
    expect(await syncPut(conn({ ok: false, error: "CONFLICT", remote: { revision: 5, savedAt: "S", deviceName: "d" } }), putInput))
      .toEqual({ status: "conflict", remote: { revision: 5, savedAt: "S", deviceName: "d" } });
    expect(await syncPut(conn({ ok: false, error: "KEY_MISMATCH" }), putInput))
      .toEqual({ status: "error", message: DEVICE_SYNC_MESSAGES.keyMismatch });
  });

  it("그 밖의 스크립트 오류는 원문을 덧붙인다", async () => {
    expect(await syncPut(conn({ ok: false, error: "Exception: 권한 없음" }), putInput))
      .toEqual({ status: "error", message: `${DEVICE_SYNC_MESSAGES.scriptError} Exception: 권한 없음` });
  });

  it("본문이 5MB를 넘으면 보내지 않는다", async () => {
    const c = conn({ ok: true, revision: 1, savedAt: "S" });
    const big = { ...putInput, blob: { ...blob, ct: "A".repeat(SYNC_MAX_BODY_CHARS) } };
    expect(await syncPut(c, big)).toEqual({ status: "error", message: DEVICE_SYNC_MESSAGES.tooLarge });
    expect(c.fetchImpl).not.toHaveBeenCalled();
  });
});
