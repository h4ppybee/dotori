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
