/**
 * dotori → 구글 시트 내보내기 웹앱.
 * 앱이 보낸 { version: 1, secret, tabs: [{ name, rows }] }를 받아 dotori_* 탭을 통째로 덮어쓴다.
 * 배포: 웹앱 / 실행: 나 / 액세스: 모든 사용자. 비밀키는 스크립트 속성 DOTORI_SECRET.
 * 원본: dotori 저장소 integrations/apps-script/sheet-export.gs — 시트에서 직접 고치지 말고 여기서 고친 뒤 붙여넣는다.
 */

const SECRET_PROP = "DOTORI_SECRET";
const TAB_PREFIX = "dotori_";
const TEXT_FORMAT = "@";
const NUMBER_FORMAT = "General";

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: "BAD_REQUEST" });
  }

  const secret = PropertiesService.getScriptProperties().getProperty(SECRET_PROP);
  if (!secret || body.secret !== secret) {
    return json_({ ok: false, error: "UNAUTHORIZED" });
  }
  if (!isValidBody_(body)) {
    return json_({ ok: false, error: "BAD_REQUEST" });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
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

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
