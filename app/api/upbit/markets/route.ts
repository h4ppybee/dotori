import { NextResponse } from "next/server";
import { fetchUpbitMarketNames, UpbitError } from "@/lib/upbit/upbit-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  try {
    const names = await fetchUpbitMarketNames();
    return NextResponse.json(
      { names },
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
