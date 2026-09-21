import "server-only";
import { z } from "zod";
import { ForbiddenError, NotFoundError, ValidationError } from "./rbac";
import type { ActionResult } from "./types";
import { fieldErrors } from "./validation";

/** Normalises thrown errors into a serialisable ActionResult for the client. */
export async function run<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e; // redirect/notFound
    if (e instanceof z.ZodError) return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: fieldErrors(e) };
    if (e instanceof ValidationError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    if (e instanceof ForbiddenError || e instanceof NotFoundError) return { ok: false, error: e.message };
    const pgErr = e as { code?: string; message?: string };
    if (pgErr?.code === "42501") return { ok: false, error: "You do not have permission to perform this action." };
    if (pgErr?.code === "23505") return { ok: false, error: "A record with the same unique value already exists." };
    console.error("[action-error]", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
