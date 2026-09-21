import "server-only";
import type { Db } from "../db";
import type { Ctx } from "../types";

export type EntityType = "lead" | "contact" | "company" | "opportunity" | "task" | "activity" | "handover" | "member" | "settings" | "import" | "export" | "api_key" | "session";

/** Writes a record timeline event and a domain event (outbox) in the caller's transaction. */
export async function timeline(db: Db, ctx: Pick<Ctx, "orgId" | "userId">, entityType: EntityType, entityId: string, eventType: string, summary: string, data: Record<string, unknown> = {}) {
  await db.exec(
    "insert into timeline_events(org_id, entity_type, entity_id, event_type, summary, data, actor_id) values ($1,$2,$3,$4,$5,$6,$7)",
    [ctx.orgId, entityType, entityId, eventType, summary, data, ctx.userId],
  );
  await db.exec(
    "insert into events(org_id, type, entity_type, entity_id, actor_id, payload) values ($1,$2,$3,$4,$5,$6)",
    [ctx.orgId, `${entityType}.${eventType}`, entityType, entityId, ctx.userId, data],
  );
}

/** Explicit audit entry for sensitive actions (login, export, permission change, transfer, import, settings). */
export async function audit(db: Db, ctx: Pick<Ctx, "orgId" | "userId">, action: string, entityType: EntityType | null, entityId: string | null, changes: Record<string, unknown> = {}) {
  await db.exec("insert into audit_logs(org_id, actor_id, action, entity_type, entity_id, changes) values ($1,$2,$3,$4,$5,$6)",
    [ctx.orgId, ctx.userId, action, entityType, entityId, changes]);
}

export async function notify(db: Db, ctx: Pick<Ctx, "orgId" | "userId">, userId: string | null | undefined, type: string, title: string, body: string | null, link: string | null) {
  if (!userId) return;
  await db.exec("insert into notifications(org_id, user_id, type, title, body, link) values ($1,$2,$3,$4,$5,$6)", [ctx.orgId, userId, type, title, body, link]);
}
