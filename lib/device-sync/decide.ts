import { DEVICE_SYNC_MESSAGES } from "@/lib/device-sync/messages";
import type { SyncMeta } from "@/lib/device-sync/client";

/**
 * 기기 동기화 판단(순수). 엔진은 네트워크·DB·암호화를 맡고, "무엇을 할지"는 여기서만 정한다.
 * 받기는 두 단계로 판단한다: meta만 보고(decideAfterMeta) → 봉투를 열어 해시를 비교(decideAfterGet).
 */

export type MetaDecision = { kind: "noop" } | { kind: "fetch" } | { kind: "error"; message: string };

export function decideAfterMeta(input: { meta: SyncMeta; lastRevision: number; keyId: string }): MetaDecision {
  if (input.meta.empty) {
    return { kind: "noop" };
  }
  if (input.meta.revision === input.lastRevision) {
    return { kind: "noop" };
  }
  if (input.meta.keyId !== input.keyId) {
    return { kind: "error", message: DEVICE_SYNC_MESSAGES.keyMismatch };
  }
  return { kind: "fetch" };
}

export type GetDecision = { kind: "autoResolve" } | { kind: "apply" } | { kind: "conflict" };

/**
 * - 원격 내용 == 로컬 내용 → 자동 해소(revision·해시만 기록, 다이얼로그 없음)
 * - 로컬이 마지막 동기화 이후 그대로 → 적용
 * - 둘 다 바뀜 → 사용자에게 묻는다
 */
export function decideAfterGet(input: {
  remoteHash: string;
  localHash: string;
  lastSyncedHash: string | null;
}): GetDecision {
  if (input.remoteHash === input.localHash) {
    return { kind: "autoResolve" };
  }
  if (input.localHash === input.lastSyncedHash) {
    return { kind: "apply" };
  }
  return { kind: "conflict" };
}

export function decidePush(input: { localHash: string; lastSyncedHash: string | null }): { kind: "noop" } | { kind: "put" } {
  if (input.localHash === input.lastSyncedHash) {
    return { kind: "noop" };
  }
  return { kind: "put" };
}
