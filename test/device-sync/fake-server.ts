import { vi } from "vitest";
import { seal } from "@/lib/device-sync/envelope";
import { keyIdOf, type SyncKeyBytes } from "@/lib/device-sync/key";
import { encodeSyncPayload, type SyncData } from "@/lib/device-sync/collect";

interface StoredRecord {
  revision: number;
  savedAt: string;
  deviceName: string;
  keyId: string;
  blob: unknown;
}

/**
 * Apps Script sync.* 계약을 흉내 내는 메모리 서버. 규칙은 integrations/apps-script/sheet-export.gs와 같다.
 * hooks.afterMeta: meta 응답 직후 1회 실행(meta와 get 사이에 다른 기기가 올리는 상황).
 * hooks.beforeGet: get 응답 전에 기다릴 프로미스(느린 네트워크·보류 시나리오).
 */
export function createFakeSyncServer(secret: string) {
  const versions = new Map<number, StoredRecord>();
  let meta: Omit<StoredRecord, "blob"> | null = null;
  let clock = 0;
  const calls: string[] = [];
  const hooks: { afterMeta?: () => Promise<void>; beforeGet?: () => Promise<void> } = {};

  function handle(body: Record<string, unknown>): Record<string, unknown> {
    if (body.secret !== secret) {
      return { ok: false, error: "UNAUTHORIZED" };
    }
    if (body.action === "sync.meta") {
      return meta ? { ok: true, ...meta } : { ok: true, empty: true };
    }
    if (body.action === "sync.get") {
      if (!meta) {
        return { ok: true, empty: true };
      }
      return { ok: true, ...versions.get(meta.revision)! };
    }
    if (body.action !== "sync.put") {
      return { ok: false, error: "BAD_REQUEST" };
    }
    const current = meta?.revision ?? 0;
    if (meta && meta.keyId !== body.keyId && body.reset !== true) {
      return { ok: false, error: "KEY_MISMATCH" };
    }
    if (meta && body.force !== true && body.reset !== true && body.baseRevision !== current) {
      return { ok: false, error: "CONFLICT", remote: { revision: meta.revision, savedAt: meta.savedAt, deviceName: meta.deviceName } };
    }
    clock += 1;
    const rec: StoredRecord = {
      revision: current + 1,
      savedAt: `2026-01-01T00:00:${String(clock).padStart(2, "0")}.000Z`,
      deviceName: String(body.deviceName),
      keyId: String(body.keyId),
      blob: body.blob,
    };
    versions.set(rec.revision, rec);
    meta = { revision: rec.revision, savedAt: rec.savedAt, deviceName: rec.deviceName, keyId: rec.keyId };
    return { ok: true, revision: rec.revision, savedAt: rec.savedAt };
  }

  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const action = String(body.action ?? "sheet.export");
    calls.push(action);
    if (action === "sync.get" && hooks.beforeGet) {
      await hooks.beforeGet();
    }
    const out = handle(body);
    if (action === "sync.meta" && hooks.afterMeta) {
      const hook = hooks.afterMeta;
      hooks.afterMeta = undefined;
      await hook();
    }
    return { ok: true, text: async () => JSON.stringify(out) } as unknown as Response;
  });

  /** 다른 기기가 올린 것처럼 서버에 직접 저장한다(현재 revision 기준, keyId는 key에서 계산). */
  async function remotePut(key: SyncKeyBytes, data: SyncData, deviceName = "다른 기기"): Promise<void> {
    const blob = await seal(key, encodeSyncPayload(data, 1));
    const res = handle({
      action: "sync.put", secret, baseRevision: meta?.revision ?? 0, keyId: await keyIdOf(key), deviceName, blob,
    });
    if (res.ok !== true) {
      throw new Error(`remotePut 실패: ${String(res.error)}`);
    }
  }

  return {
    fetch: fetchImpl,
    calls,
    hooks,
    remotePut,
    revision: () => meta?.revision ?? 0,
    keyId: () => meta?.keyId ?? null,
  };
}
