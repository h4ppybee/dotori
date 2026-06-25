import { NextResponse } from "next/server";
import { exchangeToken, TossError } from "@/lib/toss/toss-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const { clientId, clientSecret } = await req.json();
    const t = await exchangeToken(clientId, clientSecret);
    return NextResponse.json(
      { accessToken: t.accessToken, expiresIn: t.expiresIn },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof TossError) {
      if (e.status === 400 || e.status === 401) {
        return NextResponse.json(
          { error: "invalid_credentials" },
          { status: e.status, headers: { "Cache-Control": "no-store" } },
        );
      }
      return NextResponse.json(
        { error: "token_exchange_failed" },
        { status: e.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: "bad_request" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
