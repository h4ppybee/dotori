// 업비트 호출을 릴레이 서버로 보낼지(NEXT_PUBLIC_RELAY_URL 설정 시) 기존 Next 라우트(/api/upbit)로
// 보낼지 분기한다. 릴레이로 보낼 때만 X-Relay-Secret 헤더를 붙인다.
export function upbitEndpoint(path: string): { url: string; headers: Record<string, string> } {
  const base = process.env.NEXT_PUBLIC_RELAY_URL;
  const secret = process.env.NEXT_PUBLIC_RELAY_SECRET;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (base && secret) {
    headers["X-Relay-Secret"] = secret;
  }
  return {
    url: base ? `${base}/upbit${path}` : `/api/upbit${path}`,
    headers,
  };
}

/**
 * 업비트 허용 IP 안내용 — 릴레이의 공인 IP.
 * NEXT_PUBLIC_RELAY_URL(예: https://138.2.52.151.nip.io)의 호스트에서 nip.io를 떼어 IP만 반환한다.
 * 릴레이 미설정(로컬 개발)이거나 파싱 불가면 null(안내 문구 숨김).
 */
export function relayIpForDisplay(): string | null {
  const base = process.env.NEXT_PUBLIC_RELAY_URL;
  if (!base) {
    return null;
  }
  try {
    const host = new URL(base).hostname;
    return host.replace(/\.nip\.io$/, "");
  } catch {
    return null;
  }
}
