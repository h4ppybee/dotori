/**
 * dotori Apps Script 웹앱 — 구글 시트 내보내기 + 기기 동기화 저장소.
 * - 시트 내보내기(action 없음 또는 "sheet.export"): { version: 1, secret, tabs: [{ name, rows }] }를 받아
 *   dotori_* 탭을 통째로 덮어쓴다(기존 동작 그대로 — 하위 호환).
 * - 기기 동기화(action "sync.meta" | "sync.get" | "sync.put"): 앱이 암호화한 봉투(blob)를 배포자 드라이브
 *   dotori-sync/ 폴더에 current.json + 최근 10개 버전(v-<revision>.json)으로 보관한다.
 *   스크립트는 봉투를 해독하지 못한다(키는 기기에만 있다). 메타(revision·저장 시각·기기 이름·keyId·버전 파일 id)는
 *   스크립트 속성.
 * 배포: 웹앱 / 실행: 나 / 액세스: 모든 사용자. 비밀키는 스크립트 속성 DOTORI_SECRET.
 * 원본: dotori 저장소 integrations/apps-script/sheet-export.gs — 시트에서 직접 고치지 말고 여기서 고친 뒤 붙여넣는다.
 * 앱 쪽 계약: docs/external-api.md, 테스트용 가짜 서버: test/device-sync/fake-server.ts(규칙을 함께 고친다).
 */

const SECRET_PROP = "DOTORI_SECRET";
const TAB_PREFIX = "dotori_";
const TEXT_FORMAT = "@";
const NUMBER_FORMAT = "General";
const LOCK_WAIT_MS = 5000;

const MAX_BODY_CHARS = 5 * 1024 * 1024;
const SYNC_FOLDER_NAME = "dotori-sync";
const SYNC_FOLDER_PROP = "DOTORI_SYNC_FOLDER_ID";
const SYNC_META_PROP = "DOTORI_SYNC_META";
const SYNC_CURRENT_FILE = "current.json";
const SYNC_KEEP_VERSIONS = 10;
const SYNC_VERSION_FILE_RE = /^v-(\d+)\.json$/;
const KEY_ID_RE = /^[0-9a-f]{16}$/;
const JSON_MIME = "application/json";

function doPost(e) {
  const contents = e && e.postData ? e.postData.contents : "";
  if (typeof contents !== "string" || contents.length > MAX_BODY_CHARS) {
    return json_({ ok: false, error: "BAD_REQUEST" });
  }
  let body;
  try {
    body = JSON.parse(contents);
  } catch (err) {
    return json_({ ok: false, error: "BAD_REQUEST" });
  }
  // JSON.parse("null")·JSON.parse("42")처럼 파싱은 성공해도 객체가 아니면, 뒤에서
  // body.secret 등을 읽다가 예외가 날 수 있다(특히 null). 여기서 바로 걸러낸다.
  if (!body || typeof body !== "object") {
    return json_({ ok: false, error: "BAD_REQUEST" });
  }

  const secret = PropertiesService.getScriptProperties().getProperty(SECRET_PROP);
  if (!secret || body.secret !== secret) {
    return json_({ ok: false, error: "UNAUTHORIZED" });
  }

  // 순서: JSON 파싱 → 객체 검사 → 비밀키 → action 분기 → 액션별 본문 검증.
  const action = body.action;
  if (action === undefined || action === "sheet.export") {
    return handleSheetExport_(body);
  }
  if (action === "sync.meta") {
    return handleSyncMeta_();
  }
  if (action === "sync.get") {
    return handleSyncGet_();
  }
  if (action === "sync.put") {
    return handleSyncPut_(body);
  }
  return json_({ ok: false, error: "BAD_REQUEST" });
}

// ── 시트 내보내기 ────────────────────────────────────────────────────────
function handleSheetExport_(body) {
  if (!isValidBody_(body)) {
    return json_({ ok: false, error: "BAD_REQUEST" });
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) {
    return json_({ ok: false, error: "BUSY" });
  }
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    body.tabs.forEach(function (tab) {
      writeTab_(ss, tab);
    });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true, writtenAt: new Date().toISOString() });
}

function isValidBody_(body) {
  if (body.version !== 1 || !Array.isArray(body.tabs)) {
    return false;
  }
  return body.tabs.every(function (tab) {
    return typeof tab.name === "string" &&
      tab.name.indexOf(TAB_PREFIX) === 0 &&
      Array.isArray(tab.rows) &&
      tab.rows.every(function (row) {
        return Array.isArray(row) && row.every(function (c) {
          return typeof c === "string" || typeof c === "number";
        });
      });
  });
}

/** 탭이 없으면 만들고, 내용만 지운 뒤 다시 쓴다. 문자열은 텍스트 서식으로 써서 "005930"·"=..."가 해석되지 않게 한다. */
function writeTab_(ss, tab) {
  const sheet = ss.getSheetByName(tab.name) || ss.insertSheet(tab.name);
  sheet.clearContents();
  if (tab.rows.length === 0) {
    return;
  }
  const width = tab.rows.reduce(function (m, r) { return Math.max(m, r.length); }, 1);
  const values = tab.rows.map(function (r) {
    const row = r.slice();
    while (row.length < width) {
      row.push("");
    }
    return row;
  });
  const formats = values.map(function (r) {
    return r.map(function (v) { return typeof v === "number" ? NUMBER_FORMAT : TEXT_FORMAT; });
  });
  const range = sheet.getRange(1, 1, values.length, width);
  range.setNumberFormats(formats);
  range.setValues(values);
}

// ── 기기 동기화 ──────────────────────────────────────────────────────────
function handleSyncMeta_() {
  const meta = readSyncMeta_();
  if (!meta) {
    return json_({ ok: true, empty: true });
  }
  return json_({
    ok: true, revision: meta.revision, savedAt: meta.savedAt, deviceName: meta.deviceName, keyId: meta.keyId,
  });
}

function handleSyncGet_() {
  const meta = readSyncMeta_();
  if (!meta) {
    return json_({ ok: true, empty: true });
  }
  // 메타는 파일을 다 쓴 뒤 마지막에 갱신하므로, 메타가 가리키는 버전 파일은 항상 있다 → 락 없이 읽는다.
  // 파일 id로 읽는다(같은 이름 파일이 여럿이어도 메타가 가리키는 바로 그 파일). fileId가 없는 예전 메타만 이름으로 찾는다.
  const file = readVersionFile_(meta);
  if (!file) {
    return json_({ ok: false, error: "SYNC_FILE_MISSING" });
  }
  const record = JSON.parse(file.getBlob().getDataAsString());
  return json_({
    ok: true, revision: record.revision, savedAt: record.savedAt, deviceName: record.deviceName,
    keyId: record.keyId, blob: record.blob,
  });
}

function handleSyncPut_(body) {
  if (!isValidSyncPut_(body)) {
    return json_({ ok: false, error: "BAD_REQUEST" });
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) {
    return json_({ ok: false, error: "BUSY" });
  }
  try {
    const meta = readSyncMeta_();
    const current = meta ? meta.revision : 0;
    // 빈 서버(메타 없음): 첫 put — keyId를 그대로 저장하고 baseRevision은 검사하지 않는다.
    // reset: "새 키로 다시 시작" — keyId 교체 + revision 검사 생략(이 기기 내용으로 새 출발).
    if (meta && meta.keyId !== body.keyId && body.reset !== true) {
      return json_({ ok: false, error: "KEY_MISMATCH" });
    }
    if (meta && body.force !== true && body.reset !== true && body.baseRevision !== current) {
      return json_({
        ok: false, error: "CONFLICT",
        remote: { revision: meta.revision, savedAt: meta.savedAt, deviceName: meta.deviceName },
      });
    }
    const record = {
      revision: current + 1,
      savedAt: new Date().toISOString(),
      deviceName: body.deviceName,
      keyId: body.keyId,
      blob: body.blob,
    };
    const text = JSON.stringify(record);
    const folder = getSyncFolder_();
    // 저장 순서: (같은 이름 옛 파일 휴지통) → 새 버전 파일 → current.json → 오래된 버전 정리 → 마지막에 메타.
    // 메타가 가리키는 revision의 파일은 항상 존재한다(중간에 실패하면 메타는 이전 revision 그대로).
    const name = versionFileName_(record.revision);
    trashFilesNamed_(folder, name);
    const created = folder.createFile(name, text, JSON_MIME);
    writeCurrent_(folder, text);
    pruneVersions_(folder, created.getId());
    PropertiesService.getScriptProperties().setProperty(SYNC_META_PROP, JSON.stringify({
      revision: record.revision, savedAt: record.savedAt, deviceName: record.deviceName, keyId: record.keyId,
      fileId: created.getId(),
    }));
    return json_({ ok: true, revision: record.revision, savedAt: record.savedAt });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function isValidSyncPut_(body) {
  const blob = body.blob;
  return typeof body.baseRevision === "number" && body.baseRevision >= 0 &&
    Math.floor(body.baseRevision) === body.baseRevision &&
    typeof body.keyId === "string" && KEY_ID_RE.test(body.keyId) &&
    typeof body.deviceName === "string" && body.deviceName.length > 0 && body.deviceName.length <= 60 &&
    (body.force === undefined || typeof body.force === "boolean") &&
    (body.reset === undefined || typeof body.reset === "boolean") &&
    !!blob && typeof blob === "object" && blob.v === 1 && blob.alg === "A256GCM" &&
    typeof blob.iv === "string" && typeof blob.ct === "string" && blob.keyId === body.keyId;
}

function readSyncMeta_() {
  const raw = PropertiesService.getScriptProperties().getProperty(SYNC_META_PROP);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function getSyncFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(SYNC_FOLDER_PROP);
  if (id) {
    try {
      const saved = DriveApp.getFolderById(id);
      if (!saved.isTrashed()) {
        return saved;
      }
    } catch (err) {
      // 폴더가 지워졌거나 접근할 수 없으면 아래에서 다시 찾거나 만든다.
    }
  }
  const folder = findFolder_(SYNC_FOLDER_NAME) || DriveApp.createFolder(SYNC_FOLDER_NAME);
  props.setProperty(SYNC_FOLDER_PROP, folder.getId());
  return folder;
}

/** 이름으로 폴더를 찾는다. 휴지통에 있는 폴더는 건너뛴다(지운 폴더에 계속 쓰지 않게). */
function findFolder_(name) {
  const it = DriveApp.getFoldersByName(name);
  while (it.hasNext()) {
    const folder = it.next();
    if (!folder.isTrashed()) {
      return folder;
    }
  }
  return null;
}

/**
 * 메타가 가리키는 버전 파일. fileId가 있으면 id로 읽고(지워졌거나 휴지통이면 없음으로 본다),
 * fileId가 없는 예전 메타만 이름(v-<revision>.json)으로 찾는다.
 */
function readVersionFile_(meta) {
  if (typeof meta.fileId === "string" && meta.fileId !== "") {
    try {
      const file = DriveApp.getFileById(meta.fileId);
      return file.isTrashed() ? null : file;
    } catch (err) {
      return null;
    }
  }
  return findFile_(getSyncFolder_(), versionFileName_(meta.revision));
}

/**
 * 같은 이름의 휴지통 밖 파일을 모두 휴지통으로 옮긴다(방어용). 예전 실패로 남은 v-<revision>.json이 있어도
 * 이름 조회가 새 파일 대신 옛 파일을 집지 않게 한다. 휴지통에서 30일간 복구할 수 있다.
 */
function trashFilesNamed_(folder, name) {
  const it = folder.getFilesByName(name);
  while (it.hasNext()) {
    const file = it.next();
    if (!file.isTrashed()) {
      file.setTrashed(true);
    }
  }
}

/**
 * 이름으로 파일을 찾는다. 휴지통에 있는 파일은 건너뛴다 — 정리된 옛 버전을 다시 처리하거나,
 * 메타가 초기화된 뒤 새 v-1.json 대신 휴지통의 옛 v-1.json을 읽는 일을 막는다.
 */
function findFile_(folder, name) {
  const it = folder.getFilesByName(name);
  while (it.hasNext()) {
    const file = it.next();
    if (!file.isTrashed()) {
      return file;
    }
  }
  return null;
}

function writeCurrent_(folder, text) {
  const file = findFile_(folder, SYNC_CURRENT_FILE);
  if (file) {
    file.setContent(text);
    return;
  }
  folder.createFile(SYNC_CURRENT_FILE, text, JSON_MIME);
}

/**
 * v-<revision>.json 중 최신 10개만 남기고 휴지통으로 옮긴다(드라이브 휴지통에서 30일간 복구 가능).
 * keepId(방금 만든 버전 파일)는 번호가 더 큰 옛 파일이 남아 있어도 옮기지 않는다 — 메타가 가리킬 파일이다.
 * 그 파일도 10개에 포함하므로 나머지는 최신 9개만 남긴다.
 */
function pruneVersions_(folder, keepId) {
  const versions = [];
  const it = folder.getFiles();
  while (it.hasNext()) {
    const file = it.next();
    if (file.isTrashed() || file.getId() === keepId) {
      continue; // 이미 정리된 버전은 다시 세거나 옮기지 않고, 방금 만든 버전은 남긴다
    }
    const match = SYNC_VERSION_FILE_RE.exec(file.getName());
    if (match) {
      versions.push({ file: file, revision: Number(match[1]) });
    }
  }
  versions.sort(function (a, b) { return b.revision - a.revision; });
  const keepOthers = keepId ? SYNC_KEEP_VERSIONS - 1 : SYNC_KEEP_VERSIONS;
  versions.slice(keepOthers).forEach(function (v) { v.file.setTrashed(true); });
}

function versionFileName_(revision) {
  return "v-" + revision + ".json";
}

/** 편집기에서 한 번 실행해 드라이브 권한을 승인하고 dotori-sync 폴더를 만든다(새 버전 배포 전). */
function authorizeDotoriSync() {
  getSyncFolder_();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
