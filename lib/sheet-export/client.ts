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

export async function postSheetExport(
  url: string,
  body: SheetExportBody,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<SheetExportResult> {
  const reply = await postAppsScript(url, body, {
    fetchImpl: opts.fetchImpl,
    timeoutMs: opts.timeoutMs ?? SHEET_EXPORT_TIMEOUT_MS,
  });
  if (reply.kind === "network") {
    return { status: "error", message: SHEET_EXPORT_MESSAGES.network };
  }
  if (reply.kind === "badResponse") {
    return { status: "error", message: SHEET_EXPORT_MESSAGES.badResponse };
  }

  const json = reply.json;
  if (json.ok === true && typeof json.writtenAt === "string") {
    return { status: "ok", writtenAt: json.writtenAt };
  }
  if (json.error === "UNAUTHORIZED") {
    return { status: "error", message: SHEET_EXPORT_MESSAGES.unauthorized };
  }
  if (json.error === "BUSY") {
    return { status: "error", message: SHEET_EXPORT_MESSAGES.busy };
  }
  if (json.error === "BAD_REQUEST" || typeof json.error !== "string") {
    return { status: "error", message: SHEET_EXPORT_MESSAGES.badResponse };
  }
  return { status: "error", message: `${SHEET_EXPORT_MESSAGES.scriptError} ${json.error}` };
}
