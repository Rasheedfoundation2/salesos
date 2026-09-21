import type { NextRequest } from "next/server";
import { handleError, sessionRoute } from "@/lib/http";
import { exportCsv } from "@/lib/services/exports";

export async function GET(req: NextRequest, ctxRoute: RouteContext<"/api/export/[entity]">) {
  const { ctx, res } = await sessionRoute(req); if (res) return res;
  try {
    const { entity } = await ctxRoute.params;
    const sp = req.nextUrl.searchParams;
    const g = (k: string) => sp.get(k) ?? undefined;
    const out = await exportCsv(ctx, entity, { q: g("q"), status: sp.getAll("status").filter(Boolean), owner: g("owner"), source: g("source"), priority: g("priority"), category: g("category"), followUp: g("follow_up"), tag: g("tag"), campaign: g("campaign"), archived: g("archived") });
    return new Response(out.csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${out.filename}"`, "Cache-Control": "no-store" } });
  } catch (e) { return handleError(e); }
}
