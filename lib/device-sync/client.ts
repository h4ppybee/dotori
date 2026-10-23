import { postAppsScript, type AppsScriptReply } from "@/lib/apps-script/request";
import { isSyncEnvelope, type SyncEnvelope } from "@/lib/device-sync/envelope";
import { DEVICE_SYNC_MESSAGES } from "@/lib/device-sync/messages";
import type { SyncRemoteMeta } from "@/lib/types";

/**
 * Apps Script sync.* 클라이언트. 시트 내보내기와 같은 웹앱 URL·비밀키(DOTORI_SECRET)를 쓴다.
 * 계약: docs/external-api.md "기기 동기화". 어떤 실패도 throw하지 않고 { status: "error", message }로 돌려준다.
 */

// Apps Script 쪽 본문 상한(sheet-export.gs MAX_BODY_CHARS)과 같다.
export const SYNC_MAX_BODY_CHARS = 5 * 1024 * 1024;

export interface SyncConn {
  url: string;
  secret: string;
  fetchImpl?: typeof fetch;
}

export type SyncMeta = { empty: true } | ({ empty: false; keyId: string } & SyncRemoteMeta);

export interface SyncCallError {
  status: "error";
  message: string;
}

export interface SyncPutInput {
  baseRevision: number;
  keyId: string;
  deviceName: string;
  blob: SyncEnvelope;
  force?: boolean;
  reset?: boolean;
}

const fail = (message: string): SyncCallError => ({ status: "error", message });

function transportFailure(reply: Exclude<AppsScriptReply, { kind: "json" }>): SyncCallError {
  return fail(reply.kind === "network" ? DEVICE_SYNC_MESSAGES.network : DEVICE_SYNC_MESSAGES.badResponse);
}

function scriptFailure(json: Record<string, unknown>): SyncCallError {
  if (json.error === "UNAUTHORIZED") {
    return fail(DEVICE_SYNC_MESSAGES.unauthorized);
  }
  if (json.error === "BUSY") {
    return fail(DEVICE_SYNC_MESSAGES.busy);
  }
  if (json.error === "KEY_MISMATCH") {
    return fail(DEVICE_SYNC_MESSAGES.keyMismatch);
  }
  // sync.get: 메타가 가리키는 버전 파일이 드라이브에 없다(폴더를 지웠거나 옮김). 저장 실패 문구와 구분한다.
  if (json.error === "SYNC_FILE_MISSING") {
    return fail(DEVICE_SYNC_MESSAGES.fileMissing);
  }
  // 예전 스크립트(sync.* 없음)는 isValidBody_에서 BAD_REQUEST를 돌려준다 → 재배포 안내 메시지.
  if (json.error === "BAD_REQUEST" || typeof json.error !== "string") {
    return fail(DEVICE_SYNC_MESSAGES.badResponse);
  }
  return fail(`${DEVICE_SYNC_MESSAGES.scriptError} ${json.error}`);
}

function toRemoteMeta(x: unknown): SyncRemoteMeta | null {
  if (x === null || typeof x !== "object") {
    return null;
  }
  const r = x as Record<string, unknown>;
  if (typeof r.revision !== "number" || typeof r.savedAt !== "string" || typeof r.deviceName !== "string") {
    return null;
  }
  return { revision: r.revision, savedAt: r.savedAt, deviceName: r.deviceName };
}

export async function syncMeta(conn: SyncConn): Promise<{ status: "ok"; meta: SyncMeta } | SyncCallError> {
  const reply = await postAppsScript(conn.url, { action: "sync.meta", secret: conn.secret }, { fetchImpl: conn.fetchImpl });
  if (reply.kind !== "json") {
    return transportFailure(reply);
  }
  const json = reply.json;
  if (json.ok !== true) {
    return scriptFailure(json);
  }
  if (json.empty === true) {
    return { status: "ok", meta: { empty: true } };
  }
  const remote = toRemoteMeta(json);
  if (!remote || typeof json.keyId !== "string") {
    return fail(DEVICE_SYNC_MESSAGES.badResponse);
  }
  return { status: "ok", meta: { empty: false, keyId: json.keyId, ...remote } };
}

export async function syncGet(
  conn: SyncConn,
): Promise<{ status: "ok"; remote: SyncRemoteMeta; keyId: string; blob: SyncEnvelope } | { status: "empty" } | SyncCallError> {
  const reply = await postAppsScript(conn.url, { action: "sync.get", secret: conn.secret }, { fetchImpl: conn.fetchImpl });
  if (reply.kind !== "json") {
    return transportFailure(reply);
  }
  const json = reply.json;
  if (json.ok !== true) {
    return scriptFailure(json);
  }
  if (json.empty === true) {
    return { status: "empty" };
  }
  const remote = toRemoteMeta(json);
  if (!remote || typeof json.keyId !== "string" || !isSyncEnvelope(json.blob)) {
    return fail(DEVICE_SYNC_MESSAGES.badResponse);
  }
  return { status: "ok", remote, keyId: json.keyId, blob: json.blob };
}

export async function syncPut(
  conn: SyncConn,
  input: SyncPutInput,
): Promise<
  | { status: "ok"; revision: number; savedAt: string }
  | { status: "conflict"; remote: SyncRemoteMeta }
  | SyncCallError
> {
  const body = { action: "sync.put", secret: conn.secret, ...input };
  if (JSON.stringify(body).length > SYNC_MAX_BODY_CHARS) {
    return fail(DEVICE_SYNC_MESSAGES.tooLarge);
  }
  const reply = await postAppsScript(conn.url, body, { fetchImpl: conn.fetchImpl });
  if (reply.kind !== "json") {
    return transportFailure(reply);
  }
  const json = reply.json;
  if (json.ok === true && typeof json.revision === "number" && typeof json.savedAt === "string") {
    return { status: "ok", revision: json.revision, savedAt: json.savedAt };
  }
  if (json.error === "CONFLICT") {
    const remote = toRemoteMeta(json.remote);
    if (remote) {
      return { status: "conflict", remote };
    }
    return fail(DEVICE_SYNC_MESSAGES.badResponse);
  }
  if (json.ok === true) {
    return fail(DEVICE_SYNC_MESSAGES.badResponse);
  }
  return scriptFailure(json);
}
