/**
 * Apps Script 웹앱 공용 POST. 구글 시트 내보내기(lib/sheet-export)와 기기 동기화(lib/device-sync)가 같이 쓴다.
 * - Content-Type을 text/plain으로 보내 CORS preflight를 피한다(Apps Script는 OPTIONS를 처리하지 못한다).
 * - Apps Script는 HTTP 상태 코드를 지정할 수 없어 본문 { ok, ... }으로 성공 여부를 판정한다.
 *   여기서는 전송·파싱 실패만 정규화하고, ok·error 해석은 호출부(도메인 클라이언트)가 한다.
 */

// 스크립트의 LockService.tryLock은 5초다. 클라이언트 타임아웃이 그보다 짧으면 락을 기다리던
// 스크립트가 응답하기 전에 우리가 먼저 포기해 성공한 쓰기를 네트워크 실패로 오인할 수 있다.
// 락 대기(5s) + 실제 쓰기 여유를 넉넉히 둔 30초.
export const APPS_SCRIPT_TIMEOUT_MS = 30_000;

export type AppsScriptReply =
  | { kind: "network" }       // fetch 실패·타임아웃
  | { kind: "badResponse" }   // HTTP 비정상, JSON 아님, 객체가 아닌 JSON
  | { kind: "json"; json: Record<string, unknown> };

export async function postAppsScript(
  url: string,
  body: unknown,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<AppsScriptReply> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? APPS_SCRIPT_TIMEOUT_MS);

  let text: string;
  let httpOk: boolean;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      redirect: "follow",
      signal: controller.signal,
    });
    httpOk = res.ok;
    text = await res.text();
  } catch {
    return { kind: "network" };
  } finally {
    clearTimeout(timer);
  }

  if (!httpOk) {
    return { kind: "badResponse" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: "badResponse" };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { kind: "badResponse" };
  }
  return { kind: "json", json: parsed as Record<string, unknown> };
}
