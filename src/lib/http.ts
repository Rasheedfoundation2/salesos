import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getCtx } from "./auth/context";
import { ForbiddenError, NotFoundError, ValidationError } from "./rbac";
import { z } from "zod";
import { fieldErrors } from "./validation";

export function apiError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });
}

/** Cookie-authenticated route with CSRF (same-origin) protection for mutations. */
export async function sessionRoute(req: NextRequest) {
  if (req.method !== "GET") {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (!origin || new URL(origin).host !== host) return { res: apiError(403, "csrf", "Cross-site request blocked") };
  }
  const ctx = await getCtx();
  if (!ctx) return { res: apiError(401, "unauthenticated", "Sign in required") };
  return { ctx };
}

export function handleError(e: unknown) {
  if (e instanceof z.ZodError) return apiError(422, "validation_error", "Invalid request", fieldErrors(e));
  if (e instanceof ValidationError) return apiError(422, "validation_error", e.message, e.fieldErrors);
  if (e instanceof ForbiddenError) return apiError(403, "forbidden", e.message);
  if (e instanceof NotFoundError) return apiError(404, "not_found", e.message);
  if ((e as { code?: string })?.code === "42501") return apiError(403, "forbidden", "Not permitted");
  console.error("[api-error]", e);
  return apiError(500, "internal_error", "Unexpected error");
}
