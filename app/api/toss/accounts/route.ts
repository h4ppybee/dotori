import { NextResponse } from "next/server";
import { fetchAccounts, TossError } from "@/lib/toss/toss-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const { token } = await req.json();
    const accounts = await fetchAccounts(token);
    return NextResponse.json(
      { accounts },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof TossError) {
      return NextResponse.json(
        { error: "accounts_fetch_failed" },
        { status: e.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: "bad_request" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
