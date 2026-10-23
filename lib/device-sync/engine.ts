import type { QueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { decrypt } from "@/lib/crypto/crypto";
import { getSheetExportConfig, getSyncConfig, updateSyncState } from "@/lib/db/local-store";
import { parseSyncKey, type SyncKeyBytes } from "@/lib/device-sync/key";
import { seal, open, SyncKeyError } from "@/lib/device-sync/envelope";
import {
  collectSyncData, canonicalize, hashCanonical, encodeSyncPayload, decodeSyncPayload, SyncVersionError,
  type SyncData,
} from "@/lib/device-sync/collect";
import { applySyncPayload, ConflictDuringApply } from "@/lib/device-sync/apply";
import { syncMeta, syncGet, syncPut, type SyncConn } from "@/lib/device-sync/client";
import { decideAfterMeta, decideAfterGet, decidePush } from "@/lib/device-sync/decide";
import { DEVICE_SYNC_MESSAGES } from "@/lib/device-sync/messages";
import type { SyncRemoteMeta } from "@/lib/types";

/**
 * 기기 동기화 엔진(1단계: 잠금 해제 시 받기 · "지금 동기화" · 통합 갱신 후 올리기 · 충돌 해소).
 * - 어떤 공개 함수도 throw하지 않는다. 결과는 SyncOutcome으로 돌려주고 app-store.lastDeviceSync에 기록한다.
 * - 모든 작업은 모듈 큐(exclusive)로 한 번에 하나씩 실행한다. 받기·올리기가 이미 진행 중이면
 *   그 프로미스를 그대로 돌려준다(탭 내 single-flight. 탭 간은 2단계 navigator.locks).
 * - 판단은 lib/device-sync/decide(순수), 적용은 lib/device-sync/apply(단일 트랜잭션).
 * 흐름·규칙: docs/device-sync.md
 */

export const PENDING_PULL_TIMEOUT_MS = 10_000;

export type SyncOutcome =
  | { status: "skipped" }                               // 꺼짐·잠금·시트 미연결
  | { status: "noop"; remote?: SyncRemoteMeta }         // 받을 것·올릴 것 없음
  | { status: "applied"; remote: SyncRemoteMeta }
  | { status: "autoResolved"; remote: SyncRemoteMeta }
  | { status: "pushed"; remote: SyncRemoteMeta }
  | { status: "conflict"; remote: SyncRemoteMeta }
  | { status: "deferred" }                              // 갱신 대기 타임아웃 → 적용하지 않고 다음 트리거로
  | { status: "error"; message: string };

interface SyncContext {
  conn: SyncConn;
  key: SyncKeyBytes;
  keyId: string;
  deviceName: string;
  lastRevision: number;
  lastSyncedHash: string | null;
}

type ContextResult = { ok: true; ctx: SyncContext } | { ok: false; outcome: SyncOutcome };

type QueryInvalidator = Pick<QueryClient, "invalidateQueries">;

let queryClientRef: QueryInvalidator | null = null;

/** 적용 후 무효화할 QueryClient. startDeviceSync가 등록한다(테스트에서 직접 주입 가능). */
export function setDeviceSyncQueryClient(client: QueryInvalidator | null): void {
  queryClientRef = client;
}

// ── 실행 큐·single-flight ────────────────────────────────────────────────
let queue: Promise<unknown> = Promise.resolve();
let pull: { promise: Promise<SyncOutcome>; flag: { deferred: boolean } } | null = null;
let push: Promise<SyncOutcome> | null = null;

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) {
    return `${DEVICE_SYNC_MESSAGES.unexpected} ${err.message}`;
  }
  return DEVICE_SYNC_MESSAGES.unexpected;
}

/** 결과를 app-store에 기록한다. skipped·deferred는 기록하지 않는다(아무 일도 일어나지 않았으므로). */
function record(outcome: SyncOutcome): SyncOutcome {
  const store = useAppStore.getState();
  const at = Date.now();
  if (outcome.status === "skipped" || outcome.status === "deferred") {
    return outcome;
  }
  if (outcome.status === "error") {
    store.setLastDeviceSync({ at, status: "error", message: outcome.message, remote: store.lastDeviceSync?.remote });
    return outcome;
  }
  if (outcome.status === "conflict") {
    store.setLastDeviceSync({ at, status: "conflict", remote: outcome.remote });
    store.setSyncConflict({ remote: outcome.remote });
    return outcome;
  }
  store.setLastDeviceSync({ at, status: "ok", remote: outcome.remote ?? store.lastDeviceSync?.remote });
  store.setSyncConflict(null);
  return outcome;
}

/** 큐에 넣어 하나씩 실행한다. 예외는 error 결과로 바꾸고 결과를 기록한다 — 반환 프로미스는 reject되지 않는다. */
function exclusive(task: () => Promise<SyncOutcome>): Promise<SyncOutcome> {
  const run = queue
    .then(task)
    .catch((err): SyncOutcome => ({ status: "error", message: errorMessage(err) }))
    .then(record);
  queue = run;
  return run;
}

async function loadContext(): Promise<ContextResult> {
  const sessionKey = useAppStore.getState().sessionKey;
  if (sessionKey === null) {
    return { ok: false, outcome: { status: "skipped" } };
  }
  const [config, sheet] = await Promise.all([getSyncConfig(), getSheetExportConfig()]);
  if (!config || !sheet) {
    return { ok: false, outcome: { status: "skipped" } };
  }
  let secret: string;
  let keyText: string;
  try {
    [secret, keyText] = await Promise.all([
      decrypt(sessionKey, sheet.secretEnc),
      decrypt(sessionKey, config.syncKeyEnc),
    ]);
  } catch {
    return { ok: false, outcome: { status: "error", message: DEVICE_SYNC_MESSAGES.localDecrypt } };
  }
  const key = parseSyncKey(keyText);
  if (!key) {
    return { ok: false, outcome: { status: "error", message: DEVICE_SYNC_MESSAGES.localDecrypt } };
  }
  return {
    ok: true,
    ctx: {
      conn: { url: sheet.webAppUrl, secret },
      key,
      keyId: config.keyId,
      deviceName: config.deviceName,
      lastRevision: config.lastRevision,
      lastSyncedHash: config.lastSyncedHash,
    },
  };
}

function withContext(task: (ctx: SyncContext) => Promise<SyncOutcome>): Promise<SyncOutcome> {
  return exclusive(async () => {
    const loaded = await loadContext();
    if (!loaded.ok) {
      return loaded.outcome;
    }
    return task(loaded.ctx);
  });
}

// ── 받기 ────────────────────────────────────────────────────────────────
type RemoteFetch =
  | { ok: true; remote: SyncRemoteMeta; data: SyncData; remoteHash: string }
  | { ok: false; outcome: SyncOutcome };

/** sync.get → 봉투 열기 → 평문 해석 → 원격 해시. 이후 revision은 항상 get 응답 값을 쓴다. */
async function fetchRemote(ctx: SyncContext): Promise<RemoteFetch> {
  const got = await syncGet(ctx.conn);
  if (got.status === "error") {
    return { ok: false, outcome: { status: "error", message: got.message } };
  }
  if (got.status === "empty") {
    return { ok: false, outcome: { status: "noop" } };
  }
  if (got.keyId !== ctx.keyId) {
    return { ok: false, outcome: { status: "error", message: DEVICE_SYNC_MESSAGES.keyMismatch } };
  }
  let data: SyncData;
  try {
    data = decodeSyncPayload(await open(ctx.key, got.blob)).data;
  } catch (err) {
    if (err instanceof SyncVersionError) {
      return { ok: false, outcome: { status: "error", message: DEVICE_SYNC_MESSAGES.newerVersion } };
    }
    if (err instanceof SyncKeyError) {
      return { ok: false, outcome: { status: "error", message: DEVICE_SYNC_MESSAGES.keyMismatch } };
    }
    return { ok: false, outcome: { status: "error", message: DEVICE_SYNC_MESSAGES.badPayload } };
  }
  return { ok: true, remote: got.remote, data, remoteHash: await hashCanonical(canonicalize(data)) };
}

async function pullCore(ctx: SyncContext, flag: { deferred: boolean }): Promise<SyncOutcome> {
  const metaRes = await syncMeta(ctx.conn);
  if (metaRes.status === "error") {
    return { status: "error", message: metaRes.message };
  }
  const meta = metaRes.meta;
  const first = decideAfterMeta({ meta, lastRevision: ctx.lastRevision, keyId: ctx.keyId });
  if (first.kind === "error") {
    return { status: "error", message: first.message };
  }
  if (first.kind === "noop") {
    return meta.empty
      ? { status: "noop" }
      : { status: "noop", remote: { revision: meta.revision, savedAt: meta.savedAt, deviceName: meta.deviceName } };
  }

  const canonicalBefore = canonicalize(await collectSyncData());
  const localHash = await hashCanonical(canonicalBefore);
  const fetched = await fetchRemote(ctx);
  if (!fetched.ok) {
    return fetched.outcome;
  }
  const remote = fetched.remote;

  const second = decideAfterGet({ remoteHash: fetched.remoteHash, localHash, lastSyncedHash: ctx.lastSyncedHash });
  if (second.kind === "autoResolve") {
    // 내용이 같으므로 로컬 해시로 기록한다(멤버 병합 때문에 원격 해시와 다를 수 있음).
    await updateSyncState({ lastRevision: remote.revision, lastSyncedHash: localHash });
    return { status: "autoResolved", remote };
  }
  if (second.kind === "conflict") {
    return { status: "conflict", remote };
  }
  if (flag.deferred) {
    // 갱신이 기다리다 포기한 받기 — 진행 중인 갱신의 읽기-쓰기 사이에 끼지 않게 적용하지 않는다.
    return { status: "deferred" };
  }

  let canonicalAfter: string;
  try {
    ({ canonicalAfter } = await applySyncPayload(fetched.data, { expectedCanonical: canonicalBefore }));
  } catch (err) {
    if (err instanceof ConflictDuringApply) {
      return { status: "conflict", remote };
    }
    throw err;
  }
  await updateSyncState({ lastRevision: remote.revision, lastSyncedHash: await hashCanonical(canonicalAfter) });
  void queryClientRef?.invalidateQueries();
  return { status: "applied", remote };
}

/** 충돌 선택 "다른 기기 내용 받기"·다른 기기에서 연결: 기대값 비교 없이 원격으로 교체한다. */
async function receiveRemote(ctx: SyncContext): Promise<SyncOutcome> {
  const fetched = await fetchRemote(ctx);
  if (!fetched.ok) {
    return fetched.outcome;
  }
  const { canonicalAfter } = await applySyncPayload(fetched.data);
  await updateSyncState({ lastRevision: fetched.remote.revision, lastSyncedHash: await hashCanonical(canonicalAfter) });
  void queryClientRef?.invalidateQueries();
  return { status: "applied", remote: fetched.remote };
}

// ── 올리기 ──────────────────────────────────────────────────────────────
/** 같은 수집 결과로 봉인·전송하고, 성공하면 그 결과의 해시를 기록한다(보낸 내용 = 기록한 해시). */
async function putLocal(
  ctx: SyncContext,
  local: SyncData,
  localHash: string,
  opts: { baseRevision: number; force?: boolean; reset?: boolean },
): Promise<SyncOutcome> {
  const blob = await seal(ctx.key, encodeSyncPayload(local, Date.now()));
  const res = await syncPut(ctx.conn, {
    baseRevision: opts.baseRevision,
    keyId: ctx.keyId,
    deviceName: ctx.deviceName,
    blob,
    force: opts.force,
    reset: opts.reset,
  });
  if (res.status === "error") {
    return { status: "error", message: res.message };
  }
  if (res.status === "conflict") {
    // 다른 기기가 먼저 올렸다 → 받기 경로로(내용이 같으면 자동 해소, 아니면 다이얼로그).
    return pullCore(ctx, { deferred: false });
  }
  await updateSyncState({ lastRevision: res.revision, lastSyncedHash: localHash });
  return { status: "pushed", remote: { revision: res.revision, savedAt: res.savedAt, deviceName: ctx.deviceName } };
}

async function pushCore(ctx: SyncContext): Promise<SyncOutcome> {
  const local = await collectSyncData();
  const localHash = await hashCanonical(canonicalize(local));
  if (decidePush({ localHash, lastSyncedHash: ctx.lastSyncedHash }).kind === "noop") {
    return { status: "noop" };
  }
  return putLocal(ctx, local, localHash, { baseRevision: ctx.lastRevision });
}

// ── 공개 API ────────────────────────────────────────────────────────────
export function pullIfNewer(): Promise<SyncOutcome> {
  if (pull) {
    return pull.promise;
  }
  const flag = { deferred: false };
  const promise = withContext((ctx) => pullCore(ctx, flag));
  const entry = { promise, flag };
  pull = entry;
  void promise.finally(() => {
    if (pull === entry) {
      pull = null;
    }
  });
  return promise;
}

/** 진행 중인 받기(없으면 null). 테스트·디버깅용. */
export function pendingPullPromise(): Promise<SyncOutcome> | null {
  return pull?.promise ?? null;
}

/**
 * 통합 갱신·주식 갱신 mutationFn 맨 앞에서 부른다. 진행 중인 받기가 끝날 때까지 최대 timeoutMs 기다린다.
 * 타임아웃이 나면 그 받기를 보류로 표시해 적용 단계로 가지 않게 하고, 갱신은 그대로 진행한다.
 */
export async function awaitPendingPull(timeoutMs = PENDING_PULL_TIMEOUT_MS): Promise<void> {
  const entry = pull;
  if (!entry) {
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = await Promise.race([
    entry.promise.then(() => false),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(true), timeoutMs);
    }),
  ]);
  clearTimeout(timer);
  if (timedOut) {
    entry.flag.deferred = true;
  }
}

export function pushIfChanged(): Promise<SyncOutcome> {
  if (push) {
    return push;
  }
  const promise = withContext(pushCore);
  push = promise;
  void promise.finally(() => {
    if (push === promise) {
      push = null;
    }
  });
  return promise;
}

/** 설정의 "지금 동기화": 받기 → (충돌·오류·보류·꺼짐이 아니면) 올리기. */
export async function syncNow(): Promise<SyncOutcome> {
  const pulled = await pullIfNewer();
  if (pulled.status !== "noop" && pulled.status !== "applied" && pulled.status !== "autoResolved") {
    return pulled;
  }
  const pushed = await pushIfChanged();
  return pushed.status === "noop" ? pulled : pushed;
}

/** 충돌 다이얼로그 선택. "local" = 이 기기 내용으로 덮기(force), "remote" = 다른 기기 내용 받기. */
export function resolveConflict(choice: "local" | "remote"): Promise<SyncOutcome> {
  const remote = useAppStore.getState().syncConflict?.remote;
  return withContext(async (ctx) => {
    if (choice === "remote") {
      return receiveRemote(ctx);
    }
    const local = await collectSyncData();
    const localHash = await hashCanonical(canonicalize(local));
    return putLocal(ctx, local, localHash, { baseRevision: remote?.revision ?? ctx.lastRevision, force: true });
  });
}

/** 충돌 다이얼로그 닫기 = 보류(다음 트리거에서 다시 판단한다 — lastRevision을 바꾸지 않았으므로). */
export function dismissConflict(): void {
  useAppStore.getState().setSyncConflict(null);
}

/**
 * 앱 루트(QueryProvider)에서 1회 등록. 세션 키가 null → 값으로 바뀌는 순간(PIN·비밀번호·setup·세션 복원
 * 네 경로 모두 unlock()을 거친다) 받기를 **동기적으로** 시작한다 — zustand 구독 콜백은 set 안에서
 * 바로 실행되므로, 같은 틱에 마운트되는 자산 화면의 갱신 effect보다 먼저 pendingPull이 잡힌다.
 * 등록 시점에 이미 잠금 해제 상태면 즉시 시작한다(QueryProvider가 LockGate의 부모라 effect 순서에 기대지 않는다).
 * 반환값은 구독 해제 함수(React effect 정리용).
 */
export function startDeviceSync(client: QueryInvalidator): () => void {
  setDeviceSyncQueryClient(client);
  const unsubscribe = useAppStore.subscribe((state, prev) => {
    if (prev.sessionKey === null && state.sessionKey !== null) {
      void pullIfNewer();
    }
  });
  if (useAppStore.getState().sessionKey !== null) {
    void pullIfNewer();
  }
  return () => {
    unsubscribe();
    if (queryClientRef === client) {
      queryClientRef = null;
    }
  };
}
