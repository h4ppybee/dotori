import { NextResponse } from "next/server";
import { fetchUpbitTickers, UpbitError } from "@/lib/upbit/upbit-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const { markets } = await req.json();
    const prices = await fetchUpbitTickers(markets);
    return NextResponse.json(
      { prices },
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
