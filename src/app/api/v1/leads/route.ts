import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/api-auth";
import { apiError, handleError } from "@/lib/http";
import { createLead, listLeads } from "@/lib/services/leads";
import { withTenant } from "@/lib/db";



export async function GET(req: NextRequest) {
  const a = await apiContext(req); if (a.res) return a.res;
  try {
    const sp = req.nextUrl.searchParams;
    const per = Math.min(Number(sp.get("per_page") ?? 25) || 25, 100); const page = Math.max(Number(sp.get("page") ?? 1) || 1, 1);
    const sortMap: Record<string, string> = { created_at: "created", score: "score", name: "name", updated_at: "updated" };
    const sortRaw = sp.get("sort") ?? "-created_at"; const dir = sortRaw.startsWith("-") ? "desc" : "asc";
    const r = await listLeads(a.ctx, { q: sp.get("q") ?? undefined, status: sp.getAll("status").filter(Boolean), owner: sp.get("owner") ?? undefined, source: sp.get("source_id") ?? undefined,
      created_from: sp.get("created_from") ?? undefined, created_to: sp.get("created_to") ?? undefined, sort: sortMap[sortRaw.replace(/^-/, "")] ?? "created", dir, page, per });
    return NextResponse.json({ data: r.rows, meta: { page, per_page: per, total: r.total, total_pages: Math.ceil(r.total / per) } });
  } catch (e) { return handleError(e); }
}

export async function POST(req: NextRequest) {
  const a = await apiContext(req); if (a.res) return a.res;
  const idem = req.headers.get("idempotency-key");
  try {
    if (idem) {
      const prior = await withTenant(a.ctx, (db) => db.one<{ response: unknown; status: number }>("select response, status from idempotency_keys where org_id = $1 and key = $2 and created_at > now() - interval '24 hours'", [a.ctx.orgId, idem]));
      if (prior) return NextResponse.json(prior.response, { status: prior.status, headers: { "Idempotent-Replayed": "true" } });
    }
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return apiError(400, "invalid_json", "Body must be JSON"); }
    if (typeof body.source === "string" && !body.source_id) {
      const s = await withTenant(a.ctx, (db) => db.one<{ id: string }>("select id from lead_sources where org_id = $1 and lower(name) = lower($2)", [a.ctx.orgId, body.source]));
      body.source_id = s?.id ?? null;
    }
    const r = await createLead(a.ctx, body, { allowDuplicate: body.allow_duplicate === true, sourceName: "API" });
    const [status, payload] = r.duplicates ? [409, { error: { code: "duplicate", message: "Possible duplicate records exist", details: r.duplicates } }] : [201, { data: { id: r.id, owner_id: r.owner_id } }];
    if (idem) await withTenant(a.ctx, (db) => db.exec("insert into idempotency_keys(org_id, key, response, status) values ($1,$2,$3,$4) on conflict do nothing", [a.ctx.orgId, idem, payload, status]));
    return NextResponse.json(payload, { status });
  } catch (e) { return handleError(e); }
}
