import { NextResponse } from "next/server";
import { withSystem } from "@/lib/db";

export async function GET() {
  try { await withSystem((db) => db.one("select 1")); return NextResponse.json({ status: "ok", time: new Date().toISOString() }); }
  catch { return NextResponse.json({ status: "degraded" }, { status: 503 }); }
}
