import { NextResponse } from "next/server";
import { fetchHoldings, TossError } from "@/lib/toss/toss-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const { token, accountSeq } = await req.json();
    const holdings = await fetchHoldings(token, accountSeq);
    return NextResponse.json(
      { holdings },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof TossError) {
      return NextResponse.json(
        { error: "holdings_fetch_failed" },
        { status: e.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: "bad_request" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
