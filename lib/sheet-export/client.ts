import { postAppsScript, APPS_SCRIPT_TIMEOUT_MS } from "@/lib/apps-script/request";
import type { SheetTab } from "@/lib/sheet-export/build-payload";

/**
 * Apps Script 웹앱 클라이언트. 브라우저에서 직접 POST한다.
 * Content-Type을 text/plain으로 보내 CORS preflight를 피한다(Apps Script는 OPTIONS를 처리하지 못한다).
 * Apps Script는 HTTP 상태 코드를 지정할 수 없어 본문 { ok, ... }으로 성공 여부를 판정한다.
 * 전송·파싱은 lib/apps-script/request.ts.
 */

// 타임아웃 근거는 lib/apps-script/request.ts(락 대기 5초 + 쓰기 여유).
export const SHEET_EXPORT_TIMEOUT_MS = APPS_SCRIPT_TIMEOUT_MS;

export const SHEET_EXPORT_MESSAGES = {
  network: "시트에 연결하지 못했어요.",
  unauthorized: "비밀키가 스크립트 설정과 달라요.",
  badResponse: "시트 스크립트 응답을 읽지 못했어요. 스크립트를 최신 버전으로 배포했는지 확인해 주세요.",
  busy: "다른 내보내기가 진행 중이에요. 잠시 후 다시 시도해 주세요.",
  scriptError: "시트에 쓰지 못했어요.",
  noSourceTab: "시트에 '통장쪼개기' 탭이 없어요.",
} as const;

const WEB_APP_URL_RE = /^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[\w-]+\/exec$/;

export function isValidWebAppUrl(url: string): boolean {
  return WEB_APP_URL_RE.test(url);
}

export interface SheetExportBody {
  version: 1;
  secret: string;
  tabs: SheetTab[];
}

export type SheetExportResult =
  | { status: "ok"; writtenAt: string }
  | { status: "error"; message: string };

/** 통장쪼개기 원본 탭 읽기 요청(같은 웹앱·비밀키). */
export interface SheetReadBody {
  version: 1;
  secret: string;
  action: "readEnvelope";
}

export type SheetReadResult =
  | { status: "ok"; values: unknown[][] }
  | { status: "error"; message: string };

type WebAppOpts = { fetchImpl?: typeof fetch; timeoutMs?: number };
type WebAppJson = { ok?: unknown; error?: unknown; [k: string]: unknown };

/**
 * 웹앱 POST 공통부: 전송·타임아웃·JSON 파싱(lib/apps-script/request.ts)과 ok:false 오류 매핑까지.
 * ok:true면 json을 돌려주고, 성공 응답의 모양 검증은 호출부가 한다.
 */
async function postWebApp(
  url: string,
  body: SheetExportBody | SheetReadBody,
  opts: WebAppOpts,
): Promise<{ kind: "ok"; json: WebAppJson } | { kind: "error"; message: string }> {
  const reply = await postAppsScript(url, body, {
    fetchImpl: opts.fetchImpl,
    timeoutMs: opts.timeoutMs ?? SHEET_EXPORT_TIMEOUT_MS,
  });
  if (reply.kind === "network") {
    return { kind: "error", message: SHEET_EXPORT_MESSAGES.network };
  }
  if (reply.kind === "badResponse") {
    return { kind: "error", message: SHEET_EXPORT_MESSAGES.badResponse };
  }

  const json: WebAppJson = reply.json;
  if (json.ok === true) {
    return { kind: "ok", json };
  }
  if (json.error === "UNAUTHORIZED") {
    return { kind: "error", message: SHEET_EXPORT_MESSAGES.unauthorized };
  }
  if (json.error === "BUSY") {
    return { kind: "error", message: SHEET_EXPORT_MESSAGES.busy };
  }
  if (json.error === "NO_SOURCE_TAB") {
    return { kind: "error", message: SHEET_EXPORT_MESSAGES.noSourceTab };
  }
  if (json.error === "BAD_REQUEST" || typeof json.error !== "string") {
    return { kind: "error", message: SHEET_EXPORT_MESSAGES.badResponse };
  }
  return { kind: "error", message: `${SHEET_EXPORT_MESSAGES.scriptError} ${json.error}` };
}

export async function postSheetExport(
  url: string,
  body: SheetExportBody,
  opts: WebAppOpts = {},
): Promise<SheetExportResult> {
  const r = await postWebApp(url, body, opts);
  if (r.kind === "error") {
    return { status: "error", message: r.message };
  }
  if (typeof r.json.writtenAt !== "string") {
    return { status: "error", message: SHEET_EXPORT_MESSAGES.badResponse };
  }
  return { status: "ok", writtenAt: r.json.writtenAt };
}

/** 통장쪼개기 원본 탭 값을 읽는다. 예전 스크립트(읽기 미지원)는 BAD_REQUEST → badResponse. */
export async function postSheetRead(
  url: string,
  body: SheetReadBody,
  opts: WebAppOpts = {},
): Promise<SheetReadResult> {
  const r = await postWebApp(url, body, opts);
  if (r.kind === "error") {
    return { status: "error", message: r.message };
  }
  const values = r.json.values;
  if (!Array.isArray(values) || !values.every(Array.isArray)) {
    return { status: "error", message: SHEET_EXPORT_MESSAGES.badResponse };
  }
  return { status: "ok", values: values as unknown[][] };
}
