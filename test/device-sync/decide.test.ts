import { describe, it, expect } from "vitest";
import { decideAfterMeta, decideAfterGet, decidePush } from "@/lib/device-sync/decide";
import { DEVICE_SYNC_MESSAGES } from "@/lib/device-sync/messages";

const meta = (revision: number, keyId = "k1") =>
  ({ empty: false as const, revision, savedAt: "S", deviceName: "d", keyId });

describe("decideAfterMeta", () => {
  it("빈 서버 → noop", () => {
    expect(decideAfterMeta({ meta: { empty: true }, lastRevision: 0, keyId: "k1" })).toEqual({ kind: "noop" });
  });

  it("revision이 마지막과 같으면 noop", () => {
    expect(decideAfterMeta({ meta: meta(3), lastRevision: 3, keyId: "k1" })).toEqual({ kind: "noop" });
  });

  it("keyId가 다르면 오류", () => {
    expect(decideAfterMeta({ meta: meta(4, "k2"), lastRevision: 3, keyId: "k1" }))
      .toEqual({ kind: "error", message: DEVICE_SYNC_MESSAGES.keyMismatch });
  });

  it("revision이 다르면(앞서든 뒤든) 가져온다", () => {
    expect(decideAfterMeta({ meta: meta(4), lastRevision: 3, keyId: "k1" })).toEqual({ kind: "fetch" });
    expect(decideAfterMeta({ meta: meta(1), lastRevision: 3, keyId: "k1" })).toEqual({ kind: "fetch" });
  });
});

describe("decideAfterGet", () => {
  it("원격 해시 == 로컬 해시면 로컬 변경 여부와 무관하게 자동 해소", () => {
    expect(decideAfterGet({ remoteHash: "a", localHash: "a", lastSyncedHash: "z" })).toEqual({ kind: "autoResolve" });
    expect(decideAfterGet({ remoteHash: "a", localHash: "a", lastSyncedHash: "a" })).toEqual({ kind: "autoResolve" });
  });

  it("로컬이 마지막 동기화 이후 그대로면 적용", () => {
    expect(decideAfterGet({ remoteHash: "b", localHash: "a", lastSyncedHash: "a" })).toEqual({ kind: "apply" });
  });

  it("로컬도 바뀌었으면(또는 한 번도 동기화하지 않았으면) 충돌", () => {
    expect(decideAfterGet({ remoteHash: "b", localHash: "c", lastSyncedHash: "a" })).toEqual({ kind: "conflict" });
    expect(decideAfterGet({ remoteHash: "b", localHash: "c", lastSyncedHash: null })).toEqual({ kind: "conflict" });
  });
});

describe("decidePush", () => {
  it("해시가 같으면 noop, 다르거나 기록이 없으면 put", () => {
    expect(decidePush({ localHash: "a", lastSyncedHash: "a" })).toEqual({ kind: "noop" });
    expect(decidePush({ localHash: "a", lastSyncedHash: "b" })).toEqual({ kind: "put" });
    expect(decidePush({ localHash: "a", lastSyncedHash: null })).toEqual({ kind: "put" });
  });
});
