import { NextResponse, type NextRequest } from "next/server";
import { handleError, sessionRoute, apiError } from "@/lib/http";
import { assertCan } from "@/lib/rbac";
import { LEAD_IMPORT_FIELDS, parseFile, suggestMapping } from "@/lib/services/imports";

export async function POST(req: NextRequest) {
  const { ctx, res } = await sessionRoute(req); if (res) return res;
  try {
    assertCan(ctx.role, "import", "import");
    const form = await req.formData(); const file = form.get("file");
    if (!(file instanceof File)) return apiError(422, "validation_error", "Attach a file.");
    if (file.size > 10 * 1024 * 1024) return apiError(413, "too_large", "Files must be under 10 MB.");
    const { headers, rows } = await parseFile(Buffer.from(await file.arrayBuffer()), file.name);
    return NextResponse.json({ headers, sample: rows.slice(0, 8), total: rows.length, mapping: suggestMapping(headers), fields: LEAD_IMPORT_FIELDS.map((f) => ({ key: f.key, label: f.label })) });
  } catch (e) { return handleError(e); }
}
