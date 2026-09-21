"use server";
import { revalidatePath } from "next/cache";
import { requireCtx } from "@/lib/auth/context";
import { universalSearch } from "@/lib/services/search";
import { listNotifications, markNotifications } from "@/lib/services/settings";

export async function searchAction(q: string) {
  const ctx = await requireCtx();
  return universalSearch(ctx, q.slice(0, 100));
}
export async function notificationsAction() {
  const ctx = await requireCtx();
  return listNotifications(ctx);
}
export async function markReadAction(id?: string) {
  const ctx = await requireCtx();
  await markNotifications(ctx, id);
  revalidatePath("/", "layout");
}
