import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { handleError, sessionRoute, apiError } from "@/lib/http";
import { runLeadImport } from "@/lib/services/imports";

export const maxDuration = 300;
const opts = z.object({
  mapping: z.record(z.string(), z.string()),
  duplicateMode: z.enum(["skip", "create", "update"]),
  ownerMode: z.enum(["column", "user", "round_robin", "rule", "none"]),
  ownerId: z.string().nullable().optional(),
  roundRobinUsers: z.array(z.string()).optional(),
  sourceId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  createTasks: z.boolean(),
  dryRun: z.boolean(),
});

export async function POST(req: NextRequest) {
  const { ctx, res } = await sessionRoute(req); if (res) return res;
  try {
    const form = await req.formData(); const file = form.get("file");
    if (!(file instanceof File)) return apiError(422, "validation_error", "Attach a file.");
    if (file.size > 10 * 1024 * 1024) return apiError(413, "too_large", "Files must be under 10 MB.");
    const o = opts.parse(JSON.parse(String(form.get("options") ?? "{}")));
    const report = await runLeadImport(ctx, { name: file.name, buf: Buffer.from(await file.arrayBuffer()) }, o);
    if (!o.dryRun) { revalidatePath("/leads"); revalidatePath("/home"); }
    return NextResponse.json(report);
  } catch (e) { return handleError(e); }
}
