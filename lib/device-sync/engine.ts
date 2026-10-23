import type { QueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { decrypt } from "@/lib/crypto/crypto";
import {
  getSheetExportConfig, getSyncConfig, saveSyncConfig, clearSyncConfig, updateSyncState, restoreSyncConfig,
} from "@/lib/db/local-store";
import { parseSyncKey, generateSyncKey, formatSyncKey, keyIdOf, type SyncKeyBytes } from "@/lib/device-sync/key";
import { seal, open, SyncKeyError } from "@/lib/device-sync/envelope";
import {
  collectSyncData, canonicalize, hashCanonical, encodeSyncPayload, decodeSyncPayload, SyncVersionError,
  isEffectivelyEmpty,
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
 * - 모든 작업은 모듈 큐(enqueue)로 한 번에 하나씩 실행한다. 받기·올리기가 이미 진행 중이면
 *   그 프로미스를 그대로 돌려준다(탭 내 single-flight. 탭 간은 2단계 navigator.locks).
 *   syncConfig를 바꾸는 설정 흐름(처음 시작·연결·새 키·끄기)도 같은 큐에서 실행한다 — 진행 중인 받기가
 *   끈 뒤에 적용되거나, 설정 저장 전에 시작된 올리기 결과를 첫 올리기로 착각하지 않게.
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

/**
 * 결과를 app-store에 기록한다. skipped·deferred는 기록하지 않는다(아무 일도 일어나지 않았으므로).
 * 충돌은 다이얼로그를 띄우되, 잠긴 상태이거나 사용자가 이미 닫은(보류한) revision이면 기록만 남긴다.
 */
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
    if (store.sessionKey === null) {
      return outcome; // 받는 도중 잠겼다 — 잠금 화면 위에 다이얼로그를 띄우지 않는다(다음 잠금 해제 받기에서 다시 판단)
    }
    if (store.dismissedConflictRevision === outcome.remote.revision) {
      return outcome;
    }
    store.setDismissedConflictRevision(null);
    store.setSyncConflict({ remote: outcome.remote });
    return outcome;
  }
  store.setLastDeviceSync({ at, status: "ok", remote: outcome.remote ?? store.lastDeviceSync?.remote });
  store.setSyncConflict(null);
  store.setDismissedConflictRevision(null);
  return outcome;
}

/** 모듈 큐에 넣어 하나씩 실행한다. task의 reject는 반환 프로미스로만 전달하고 큐는 끊기지 않는다. */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
}

/** 예외를 error 결과로 바꾼다(기록하지 않음). 큐 안에서 다른 동기화 작업을 직접 실행할 때 쓴다. */
async function settle(task: () => Promise<SyncOutcome>): Promise<SyncOutcome> {
  try {
    return await task();
  } catch (err) {
    return { status: "error", message: errorMessage(err) };
  }
}

/** 큐에 넣어 실행하고 결과를 기록한다 — 반환 프로미스는 reject되지 않는다. */
function exclusive(task: () => Promise<SyncOutcome>): Promise<SyncOutcome> {
  return enqueue(async () => record(await settle(task)));
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

/** 지금 저장된 설정으로 컨텍스트를 읽어 task를 실행한다(큐에 넣지 않는다 — 큐 안에서 부른다). */
async function inContext(task: (ctx: SyncContext) => Promise<SyncOutcome>): Promise<SyncOutcome> {
  const loaded = await loadContext();
  if (!loaded.ok) {
    return loaded.outcome;
  }
  return task(loaded.ctx);
}

function withContext(task: (ctx: SyncContext) => Promise<SyncOutcome>): Promise<SyncOutcome> {
  return exclusive(() => inContext(task));
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
  if (!meta.empty && meta.revision === useAppStore.getState().dismissedConflictRevision) {
    // 사용자가 이미 닫은(보류한) 충돌의 revision — sync.get·복호화 없이 충돌 기록만 유지한다.
    // "지금 동기화하기"(reopenDismissedConflict)는 받기 전에 이 값을 비우므로 여기로 오지 않는다.
    return { status: "conflict", remote: { revision: meta.revision, savedAt: meta.savedAt, deviceName: meta.deviceName } };
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

/**
 * "지금 동기화"·통합 갱신 후: 받기 → (충돌·오류·보류·꺼짐이 아니면) 올리기. 받기가 먼저라 보류(deferred)된 받기도 다시 시도한다.
 * reopenDismissedConflict: 사용자가 직접 누른 "지금 동기화하기" — 닫아 둔 충돌도 다시 묻는다.
 */
export async function syncNow(opts: { reopenDismissedConflict?: boolean } = {}): Promise<SyncOutcome> {
  if (opts.reopenDismissedConflict) {
    useAppStore.getState().setDismissedConflictRevision(null);
  }
  let pulled = await pullIfNewer();
  if (pulled.status === "deferred") {
    // 갱신 대기 타임아웃으로 보류된 받기에 합류했다 — 그 받기는 이미 정리됐으니 새 받기로 한 번 더 시도한다.
    pulled = await pullIfNewer();
  }
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

/**
 * 충돌 다이얼로그 닫기 = 보류. lastRevision을 바꾸지 않으므로 다음 트리거에서 다시 판단하지만,
 * 같은 원격 revision이면 자동 동기화에서는 다시 띄우지 않는다(새 revision이 오거나 "지금 동기화하기"를 누르면 다시 묻는다).
 */
export function dismissConflict(): void {
  const store = useAppStore.getState();
  store.setDismissedConflictRevision(store.syncConflict?.remote.revision ?? null);
  store.setSyncConflict(null);
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

// ── 설정 흐름(설정 패널) ──────────────────────────────────────────────────
export type SetupResult =
  | { status: "ok"; keyText: string }
  | { status: "alreadyStarted" }
  | { status: "error"; message: string };

export type PrepareConnectResult =
  | { status: "ready"; hasLocalData: boolean }
  | { status: "error"; message: string };

type ConnectionResult = { ok: true; sessionKey: CryptoKey; conn: SyncConn } | { ok: false; message: string };

/** 동기화 설정 없이 시트 연결(URL·비밀키)만으로 서버에 접근한다(처음 시작·연결 전 확인용). */
async function loadConnection(): Promise<ConnectionResult> {
  const sessionKey = useAppStore.getState().sessionKey;
  if (sessionKey === null) {
    return { ok: false, message: DEVICE_SYNC_MESSAGES.locked };
  }
  const sheet = await getSheetExportConfig();
  if (!sheet) {
    return { ok: false, message: DEVICE_SYNC_MESSAGES.sheetRequired };
  }
  try {
    return { ok: true, sessionKey, conn: { url: sheet.webAppUrl, secret: await decrypt(sessionKey, sheet.secretEnc) } };
  } catch {
    return { ok: false, message: DEVICE_SYNC_MESSAGES.localDecrypt };
  }
}

/**
 * 올리기 결과가 pushed가 아니어도, 서버 meta의 keyId가 방금 만든 키면 서버에는 저장된 것이다(응답만 유실).
 * 이때는 설정을 지우거나 되돌리지 않는다 — lastSyncedHash가 비어 있어 다음 받기에서 내용 비교로 자동 해소된다.
 */
async function serverHasKey(conn: SyncConn, keyId: string): Promise<boolean> {
  const meta = await syncMeta(conn);
  return meta.status === "ok" && !meta.meta.empty && meta.meta.keyId === keyId;
}

/** 설정 흐름의 실패 결과. 오류면 그 문구, 그 밖(충돌·noop 등 올리지 못함)은 일반 안내. */
function setupFailure(outcome: SyncOutcome): { status: "error"; message: string } {
  if (outcome.status === "error") {
    return { status: "error", message: outcome.message };
  }
  return { status: "error", message: DEVICE_SYNC_MESSAGES.setupPushFailed };
}

/**
 * "이 기기에서 처음 시작": 빈 서버일 때만 키를 만들고 첫 올리기를 한다.
 * 큐 안에서 설정 저장 → 올리기를 직접 실행한다 — 설정이 생기기 전에 시작된 올리기(skipped)를 재사용하지 않는다.
 * 첫 올리기가 "pushed"가 아니면(다른 기기가 먼저 시작해 KEY_MISMATCH·네트워크 오류 등) 설정을 지우고 오류를 돌려준다.
 */
export function startFirstDevice(input: { deviceName: string }): Promise<SetupResult> {
  return enqueue(async (): Promise<SetupResult> => {
    try {
      const c = await loadConnection();
      if (!c.ok) {
        return { status: "error", message: c.message };
      }
      const meta = await syncMeta(c.conn);
      if (meta.status === "error") {
        return { status: "error", message: meta.message };
      }
      if (!meta.meta.empty) {
        return { status: "alreadyStarted" };
      }
      const key = generateSyncKey();
      const keyText = formatSyncKey(key);
      const keyId = await keyIdOf(key);
      await saveSyncConfig(c.sessionKey, {
        syncKeyText: keyText, keyId, deviceName: input.deviceName,
        lastRevision: 0, lastSyncedHash: null,
      });
      const outcome = await settle(() => inContext(pushCore));
      if (outcome.status !== "pushed") {
        if (await serverHasKey(c.conn, keyId)) {
          return { status: "ok", keyText };
        }
        await clearSyncConfig();
        return setupFailure(outcome);
      }
      record(outcome);
      return { status: "ok", keyText };
    } catch (err) {
      return { status: "error", message: errorMessage(err) };
    }
  });
}

/** "다른 기기에서 연결" 1단계: 키 형식·서버 시작 여부·keyId를 확인하고, 이 기기에 수동 데이터가 있는지 알려준다. */
export async function prepareConnect(keyText: string): Promise<PrepareConnectResult> {
  try {
    const key = parseSyncKey(keyText);
    if (!key) {
      return { status: "error", message: DEVICE_SYNC_MESSAGES.invalidKey };
    }
    const c = await loadConnection();
    if (!c.ok) {
      return { status: "error", message: c.message };
    }
    const meta = await syncMeta(c.conn);
    if (meta.status === "error") {
      return { status: "error", message: meta.message };
    }
    if (meta.meta.empty) {
      return { status: "error", message: DEVICE_SYNC_MESSAGES.notStarted };
    }
    if (meta.meta.keyId !== (await keyIdOf(key))) {
      return { status: "error", message: DEVICE_SYNC_MESSAGES.keyMismatch };
    }
    return { status: "ready", hasLocalData: !isEffectivelyEmpty(await collectSyncData()) };
  } catch (err) {
    return { status: "error", message: errorMessage(err) };
  }
}

/** "다른 기기에서 연결" 2단계: 큐 안에서 설정을 저장하고 원격으로 교체한다. 받지 못하면 설정을 지운다. throw하지 않는다. */
export function connectExistingDevice(input: { keyText: string; deviceName: string }): Promise<SyncOutcome> {
  return enqueue(async (): Promise<SyncOutcome> => {
    try {
      const key = parseSyncKey(input.keyText);
      if (!key) {
        return { status: "error", message: DEVICE_SYNC_MESSAGES.invalidKey };
      }
      const c = await loadConnection();
      if (!c.ok) {
        return { status: "error", message: c.message };
      }
      await saveSyncConfig(c.sessionKey, {
        syncKeyText: formatSyncKey(key), keyId: await keyIdOf(key), deviceName: input.deviceName,
        lastRevision: 0, lastSyncedHash: null,
      });
      const outcome = await settle(() => inContext(receiveRemote));
      if (outcome.status === "applied") {
        return record(outcome);
      }
      // 반쯤 연결된 상태(lastSyncedHash 없음)로 남으면 다음 받기가 곧바로 충돌이 된다 → 처음 상태로 되돌린다.
      await clearSyncConfig();
      useAppStore.getState().clearLastDeviceSync();
      return outcome;
    } catch (err) {
      return { status: "error", message: errorMessage(err) };
    }
  });
}

/**
 * "새 키로 다시 시작": 새 키 + reset put(서버 revision은 이어가고 keyId만 교체, 이전 버전 파일은 보관 규칙대로).
 * reset put이 "pushed"가 아니면 이전 설정(키·revision·해시)을 그대로 되돌린다 — 서버 keyId도 그대로라 이어서 동기화된다.
 */
export function restartWithNewKey(): Promise<SetupResult> {
  return enqueue(async (): Promise<SetupResult> => {
    try {
      const c = await loadConnection();
      if (!c.ok) {
        return { status: "error", message: c.message };
      }
      const prev = await getSyncConfig();
      if (!prev) {
        return { status: "error", message: DEVICE_SYNC_MESSAGES.notEnabled };
      }
      const meta = await syncMeta(c.conn);
      if (meta.status === "error") {
        return { status: "error", message: meta.message };
      }
      const baseRevision = meta.meta.empty ? 0 : meta.meta.revision;
      const key = generateSyncKey();
      const keyText = formatSyncKey(key);
      const keyId = await keyIdOf(key);
      await saveSyncConfig(c.sessionKey, {
        syncKeyText: keyText, keyId, deviceName: prev.deviceName,
        lastRevision: baseRevision, lastSyncedHash: null,
      });
      const outcome = await settle(() => inContext(async (ctx) => {
        const local = await collectSyncData();
        const localHash = await hashCanonical(canonicalize(local));
        return putLocal(ctx, local, localHash, { baseRevision, reset: true });
      }));
      if (outcome.status !== "pushed") {
        if (await serverHasKey(c.conn, keyId)) {
          return { status: "ok", keyText };
        }
        await restoreSyncConfig(prev);
        return setupFailure(outcome);
      }
      record(outcome);
      return { status: "ok", keyText };
    } catch (err) {
      return { status: "error", message: errorMessage(err) };
    }
  });
}

export type DisableResult = { status: "ok" } | { status: "error"; message: string };

/** "끄기": 이 기기의 동기화 설정과 기록만 지운다(서버 파일·다른 기기는 그대로). 진행 중인 작업이 끝난 뒤 실행하고, throw하지 않는다. */
export function disableDeviceSync(): Promise<DisableResult> {
  return enqueue(async (): Promise<DisableResult> => {
    try {
      await clearSyncConfig();
      const store = useAppStore.getState();
      store.clearLastDeviceSync();
      store.setSyncConflict(null);
      store.setDismissedConflictRevision(null);
      return { status: "ok" };
    } catch (err) {
      return { status: "error", message: errorMessage(err) };
    }
  });
}

/** "다른 기기 연결 정보 보기": 웹앱 URL·비밀키·동기화 키를 복호화해 보여준다. 꺼져 있으면 null. */
export async function revealConnectionInfo(): Promise<{ webAppUrl: string; secret: string; keyText: string } | null> {
  const sessionKey = useAppStore.getState().sessionKey;
  if (sessionKey === null) {
    return null;
  }
  const [config, sheet] = await Promise.all([getSyncConfig(), getSheetExportConfig()]);
  if (!config || !sheet) {
    return null;
  }
  const [secret, keyText] = await Promise.all([
    decrypt(sessionKey, sheet.secretEnc),
    decrypt(sessionKey, config.syncKeyEnc),
  ]);
  return { webAppUrl: sheet.webAppUrl, secret, keyText };
}
