"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/action";
import { loginSchema, registerSchema, formToObject } from "@/lib/validation";
import * as auth from "@/lib/services/auth";
import { destroySession } from "@/lib/auth/session";
import { getSessionUser } from "@/lib/auth/context";
import { withSystem } from "@/lib/db";
import { ValidationError } from "@/lib/rbac";
import type { ActionResult } from "@/lib/types";

const safeNext = (n: unknown) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : "/home");

export async function loginAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const raw = formToObject(fd);
  const res = await run(async () => {
    const v = loginSchema.parse(raw);
    const r = await auth.login(v.email, v.password);
    if (!r.ok) throw new ValidationError(r.error);
  });
  if (!res.ok) return res;
  redirect(safeNext(raw.next));
}

export async function registerAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const res = await run(async () => { await auth.register(registerSchema.parse(formToObject(fd))); });
  if (!res.ok) return res;
  redirect("/home?welcome=1");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function requestResetAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const email = String(fd.get("email") ?? "").trim().toLowerCase();
    if (!email.includes("@")) throw new ValidationError("Enter a valid email.", { email: ["Invalid email"] });
    await auth.requestPasswordReset(email);
  }, "If an account exists for that email, a reset link has been sent.");
}

export async function resetPasswordAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const res = await run(async () => {
    if (fd.get("password") !== fd.get("confirm")) throw new ValidationError("Passwords do not match.", { confirm: ["Does not match"] });
    await auth.resetPassword(String(fd.get("token")), String(fd.get("password")));
  });
  if (!res.ok) return res;
  redirect("/login?reset=1");
}

export async function acceptInviteAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const res = await run(() => auth.acceptInvitation(String(fd.get("token")), { name: String(fd.get("name") ?? ""), password: String(fd.get("password") ?? "") }));
  if (!res.ok) return res;
  redirect("/home?welcome=1");
}

export async function changePasswordAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const su = await getSessionUser();
  if (!su) redirect("/login");
  const res = await run(async () => {
    if (fd.get("password") !== fd.get("confirm")) throw new ValidationError("Passwords do not match.", { confirm: ["Does not match"] });
    await auth.changePassword(su.user_id, String(fd.get("current") ?? ""), String(fd.get("password")), !su.must_change_password);
  }, "Password updated.");
  if (res.ok && su.must_change_password) redirect("/home");
  return res;
}

export async function switchOrgAction(orgId: string) {
  const su = await getSessionUser();
  if (!su) redirect("/login");
  const res = await run(() => auth.switchOrganisation(su.session_id, su.user_id, orgId));
  if (res.ok) { revalidatePath("/", "layout"); redirect("/home"); }
  return res;
}

export async function createOrgAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const su = await getSessionUser();
  if (!su) redirect("/login");
  const res = await run(async () => {
    const name = String(fd.get("name") ?? "").trim();
    if (name.length < 2) throw new ValidationError("Organisation name is required.", { name: ["Required"] });
    const id = await withSystem((db) => auth.createOrganisation(db, su.user_id, name, String(fd.get("currency") || "AED")));
    await auth.switchOrganisation(su.session_id, su.user_id, id);
  });
  if (!res.ok) return res;
  revalidatePath("/", "layout");
  redirect("/home?welcome=1");
}

export async function revokeSessionAction(sessionId: string) {
  const su = await getSessionUser();
  if (!su) redirect("/login");
  await withSystem((db) => db.exec("update sessions set revoked_at = now() where id = $1 and user_id = $2", [sessionId, su.user_id]));
  revalidatePath("/account");
}
