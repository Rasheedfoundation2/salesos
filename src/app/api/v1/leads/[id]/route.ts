import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/api-auth";
import { apiError, handleError } from "@/lib/http";
import { getLead, updateLead } from "@/lib/services/leads";

export async function GET(req: NextRequest, r: RouteContext<"/api/v1/leads/[id]">) {
  const a = await apiContext(req); if (a.res) return a.res;
  try { const { id } = await r.params; const l = await getLead(a.ctx, id); delete (l as Record<string, unknown>).search; return NextResponse.json({ data: l }); } catch (e) { return handleError(e); }
}
export async function PATCH(req: NextRequest, r: RouteContext<"/api/v1/leads/[id]">) {
  const a = await apiContext(req); if (a.res) return a.res;
  try {
    const { id } = await r.params;
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return apiError(400, "invalid_json", "Body must be JSON"); }
    await updateLead(a.ctx, id, body);
    const l = await getLead(a.ctx, id); delete (l as Record<string, unknown>).search;
    return NextResponse.json({ data: l });
  } catch (e) { return handleError(e); }
}
