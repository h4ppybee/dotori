import { NextResponse } from "next/server";
import { fetchUpbitAccounts, UpbitError } from "@/lib/upbit/upbit-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const { accessKey, secretKey } = await req.json();
    const rows = await fetchUpbitAccounts(accessKey, secretKey);
    return NextResponse.json(
      { rows },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof UpbitError) {
      return NextResponse.json(
        { error: "upbit_error" },
        { status: e.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: "upbit_error" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
