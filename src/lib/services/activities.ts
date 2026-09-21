import "server-only";
import { withTenant } from "../db";
import type { Ctx } from "../types";
import { assertCan, NotFoundError, ValidationError } from "../rbac";
import { activitySchema, taskSchema } from "../validation";
import { ACTIVITY_LABELS } from "../constants";
import { notify, timeline } from "./journal";

export type RelatedKey = "lead_id" | "contact_id" | "company_id" | "opportunity_id";
export const ENTITY_KEY: Record<string, RelatedKey> = { lead: "lead_id", contact: "contact_id", company: "company_id", opportunity: "opportunity_id" };

export interface ActivityRow { id: string; type: string; subject: string; body: string | null; outcome: string | null; direction: string | null; duration_min: number | null; occurred_at: string; owner_name: string | null; lead_id: string | null; contact_id: string | null; company_id: string | null; opportunity_id: string | null; related_label: string | null; next_action: string | null }

export async function listActivities(ctx: Ctx, f: { entity?: string; id?: string; owner?: string; type?: string; from?: string; to?: string; limit?: number }) {
  assertCan(ctx.role, "activities", "view");
  const w = ["a.org_id = $1"]; const p: unknown[] = [ctx.orgId];
  const add = (sql: string, v: unknown) => { p.push(v); w.push(sql.replaceAll("?", `$${p.length}`)); };
  if (f.entity && f.id) add(`a.${ENTITY_KEY[f.entity]} = ?`, f.id);
  if (f.owner === "me") add("a.owner_id = ?", ctx.userId); else if (f.owner) add("a.owner_id = ?", f.owner);
  if (f.type) add("a.type = ?", f.type);
  if (f.from) add("a.occurred_at >= ?::date", f.from);
  if (f.to) add("a.occurred_at < ?::date + 1", f.to);
  return withTenant(ctx, (db) => db.many<ActivityRow>(
    `select a.id, a.type, a.subject, a.body, a.outcome, a.direction, a.duration_min, a.occurred_at, u.name owner_name, a.lead_id, a.contact_id, a.company_id, a.opportunity_id, a.next_action,
            coalesce(o.name, l.full_name, ct.full_name, c.name) related_label
       from activities a left join users u on u.id = a.owner_id left join opportunities o on o.id = a.opportunity_id left join leads l on l.id = a.lead_id
       left join contacts ct on ct.id = a.contact_id left join companies c on c.id = a.company_id
      where ${w.join(" and ")} order by a.occurred_at desc limit ${Math.min(f.limit ?? 100, 500)}`, p));
}

/** Logs a call/email/WhatsApp/meeting/note, stamps SLA + last-contacted, and optionally schedules the next follow-up. */
export async function logActivity(ctx: Ctx, raw: Record<string, unknown>) {
  assertCan(ctx.role, "activities", "create");
  const v = activitySchema.parse(raw);
  if (!v.lead_id && !v.contact_id && !v.company_id && !v.opportunity_id) throw new ValidationError("Link the activity to a record.");
  return withTenant(ctx, async (db) => {
    let { company_id, contact_id } = v;
    if (v.opportunity_id && (!company_id || !contact_id)) {
      const o = await db.one<{ company_id: string | null; contact_id: string | null }>("select company_id, contact_id from opportunities where id = $1", [v.opportunity_id]);
      if (!o) throw new NotFoundError();
      company_id ??= o.company_id; contact_id ??= o.contact_id;
    }
    if (contact_id && !company_id) company_id = (await db.one<{ company_id: string | null }>("select company_id from contacts where id = $1", [contact_id]))?.company_id ?? null;
    const a = await db.one<{ id: string; occurred_at: string }>(`insert into activities(org_id, type, subject, body, outcome, direction, duration_min, occurred_at, owner_id, lead_id, contact_id, company_id, opportunity_id, next_action)
        values ($1,$2,$3,$4,$5,$6,$7, coalesce($8::timestamptz, now()), $9,$10,$11,$12,$13,$14) returning id, occurred_at`,
      [ctx.orgId, v.type, v.subject, v.body, v.outcome, v.direction ?? null, v.duration_min, v.occurred_at ?? null, ctx.userId, v.lead_id, contact_id, company_id, v.opportunity_id, v.next_action]);
    const label = `${ACTIVITY_LABELS[v.type]}: ${v.subject}`;
    const touch = ["call", "email", "whatsapp", "meeting", "video_call", "site_visit"].includes(v.type);
    if (v.lead_id) {
      await timeline(db, ctx, "lead", v.lead_id, "activity", label, { activity_id: a!.id, type: v.type });
      if (touch) {
        await db.exec(`update leads set last_contacted_at = greatest(coalesce(last_contacted_at, $2::timestamptz), $2::timestamptz),
            first_contacted_at = coalesce(first_contacted_at, $2::timestamptz),
            status = case when status in ('new','unassigned','researching') then (case when $3 = 'inbound' or $4 then 'contacted' else 'attempting_contact' end) else status end
          where id = $1`, [v.lead_id, a!.occurred_at, v.direction ?? "outbound", /connected|interested|meeting|replied|answered|positive/i.test(v.outcome ?? "")]);
      }
      if (v.follow_up_at) await db.exec("update leads set next_follow_up_at = $2 where id = $1", [v.lead_id, v.follow_up_at]);
      // Close the auto-created first-contact task once a real touch is logged.
      if (touch) await db.exec("update tasks set status = 'completed', completed_at = now(), outcome = 'Logged ' || $2 where lead_id = $1 and title like 'First contact:%' and status in ('todo','in_progress')", [v.lead_id, v.type]);
    }
    if (v.opportunity_id) {
      await db.exec("update opportunities set last_activity_at = greatest(coalesce(last_activity_at, $2::timestamptz), $2::timestamptz), next_action = coalesce($3, next_action) where id = $1", [v.opportunity_id, a!.occurred_at, v.next_action]);
      await timeline(db, ctx, "opportunity", v.opportunity_id, "activity", label, { activity_id: a!.id, type: v.type });
    }
    if (contact_id) await timeline(db, ctx, "contact", contact_id, "activity", label, { activity_id: a!.id, type: v.type });
    if (company_id) await timeline(db, ctx, "company", company_id, "activity", label, { activity_id: a!.id, type: v.type });
    if (v.follow_up_at) {
      await db.exec("insert into tasks(org_id, title, owner_id, priority, due_at, lead_id, contact_id, company_id, opportunity_id, created_by) values ($1,$2,$3,'medium',$4,$5,$6,$7,$8,$3)",
        [ctx.orgId, v.next_action || `Follow up: ${v.subject}`, ctx.userId, v.follow_up_at, v.lead_id, contact_id, company_id, v.opportunity_id]);
    }
    for (const m of (v.body ?? "").matchAll(/@\[([^\]]+)\]\(([0-9a-f-]{36})\)/g)) {
      await notify(db, ctx, m[2], "mention", `${ctx.user.name} mentioned you`, v.subject, v.lead_id ? `/leads/${v.lead_id}` : v.opportunity_id ? `/opportunities/${v.opportunity_id}` : null);
    }
    return a!.id;
  });
}

// ───── Tasks ─────
export interface TaskRow { id: string; title: string; description: string | null; owner_id: string | null; owner_name: string | null; priority: string; due_at: string | null; status: string; outcome: string | null; lead_id: string | null; contact_id: string | null; company_id: string | null; opportunity_id: string | null; related_label: string | null; related_type: string | null; completed_at: string | null; created_at: string; overdue: boolean }

export async function listTasks(ctx: Ctx, f: { view?: string; owner?: string; entity?: string; id?: string; status?: string; q?: string; limit?: number }) {
  assertCan(ctx.role, "tasks", "view");
  const w = ["t.org_id = $1"]; const p: unknown[] = [ctx.orgId];
  const add = (sql: string, v: unknown) => { p.push(v); w.push(sql.replaceAll("?", `$${p.length}`)); };
  const open = "t.status in ('todo','in_progress','waiting')";
  switch (f.view ?? "mine") {
    case "mine": add("t.owner_id = ?", ctx.userId); w.push(open); break;
    case "today": add("t.owner_id = ?", ctx.userId); w.push(open, "t.due_at < ((now() at time zone 'Asia/Dubai')::date + 1) at time zone 'Asia/Dubai'"); break;
    case "overdue": w.push(open, "t.due_at < now()"); break;
    case "upcoming": w.push(open, "t.due_at between now() and now() + interval '7 days'"); break;
    case "unowned": w.push(open, "t.owner_id is null"); break;
    case "team": w.push(open); break;
    case "completed": w.push("t.status = 'completed'"); break;
    case "all": break;
  }
  if (f.owner) add("t.owner_id = ?", f.owner);
  if (f.entity && f.id) add(`t.${ENTITY_KEY[f.entity]} = ?`, f.id);
  if (f.status) add("t.status = ?", f.status);
  if (f.q) add("t.title ilike '%' || ? || '%'", f.q);
  return withTenant(ctx, (db) => db.many<TaskRow>(
    `select t.id, t.title, t.description, t.owner_id, u.name owner_name, t.priority, t.due_at, t.status, t.outcome, t.lead_id, t.contact_id, t.company_id, t.opportunity_id, t.completed_at, t.created_at,
            (t.status in ('todo','in_progress','waiting') and t.due_at < now()) overdue,
            coalesce(o.name, l.full_name, ct.full_name, c.name) related_label,
            case when t.opportunity_id is not null then 'opportunity' when t.lead_id is not null then 'lead' when t.contact_id is not null then 'contact' when t.company_id is not null then 'company' end related_type
       from tasks t left join users u on u.id = t.owner_id left join opportunities o on o.id = t.opportunity_id left join leads l on l.id = t.lead_id
       left join contacts ct on ct.id = t.contact_id left join companies c on c.id = t.company_id
      where ${w.join(" and ")} order by (t.status = 'completed'), t.due_at nulls last, t.created_at desc limit ${Math.min(f.limit ?? 200, 500)}`, p));
}

export async function saveTask(ctx: Ctx, id: string | null, raw: Record<string, unknown>) {
  assertCan(ctx.role, "tasks", id ? "edit" : "create");
  return withTenant(ctx, async (db) => {
    if (!id) {
      const v = taskSchema.parse(raw);
      let owner = v.owner_id ?? ctx.userId;
      if (owner !== ctx.userId && !["owner", "admin", "manager"].includes(ctx.role)) owner = ctx.userId;
      const t = await db.one<{ id: string }>(`insert into tasks(org_id, title, description, owner_id, priority, due_at, reminder_at, recurrence, lead_id, contact_id, company_id, opportunity_id, created_by)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
        [ctx.orgId, v.title, v.description, owner, v.priority, v.due_at, v.reminder_at, v.recurrence ?? null, v.lead_id, v.contact_id, v.company_id, v.opportunity_id, ctx.userId]);
      for (const [entity, key] of Object.entries(ENTITY_KEY)) if (v[key]) await timeline(db, ctx, entity as "lead", v[key]!, "task_created", `Task: ${v.title}`, { task_id: t!.id });
      if (v.lead_id && v.due_at) await db.exec("update leads set next_follow_up_at = least(coalesce(next_follow_up_at, $2::timestamptz), $2::timestamptz) where id = $1 and (next_follow_up_at is null or next_follow_up_at < now() or next_follow_up_at > $2::timestamptz)", [v.lead_id, v.due_at]);
      if (v.opportunity_id) await db.exec("update opportunities set next_action = coalesce(next_action, $2), next_action_date = coalesce(next_action_date, $3::date) where id = $1", [v.opportunity_id, v.title, v.due_at ? v.due_at.slice(0, 10) : null]);
      if (owner !== ctx.userId) await notify(db, ctx, owner, "task", `Task assigned: ${v.title}`, null, "/tasks");
      return t!.id;
    }
    const cur = await db.one<{ status: string; title: string; recurrence: string | null; due_at: string | null; lead_id: string | null; opportunity_id: string | null; owner_id: string | null }>("select * from tasks where id = $1", [id]);
    if (!cur) throw new NotFoundError();
    const v = taskSchema.partial().parse(raw);
    const keys = Object.keys(raw).filter((k) => k in taskSchema.shape && k !== "owner_id");
    if (keys.length) await db.exec(`update tasks set ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} where id = $1`, [id, ...keys.map((k) => (v as Record<string, unknown>)[k] ?? null)]);
    if ("outcome" in raw) await db.exec("update tasks set outcome = $2 where id = $1", [id, raw.outcome || null]);
    if ("owner_id" in raw && ["owner", "admin", "manager"].includes(ctx.role)) {
      await db.exec("update tasks set owner_id = $2 where id = $1", [id, raw.owner_id || null]);
      if (raw.owner_id && raw.owner_id !== ctx.userId) await notify(db, ctx, String(raw.owner_id), "task", `Task assigned: ${cur.title}`, null, "/tasks");
    }
    if (v.status === "completed" && cur.status !== "completed") {
      await db.exec("update tasks set completed_at = now() where id = $1", [id]);
      if (cur.lead_id) await timeline(db, ctx, "lead", cur.lead_id, "task_completed", `Completed: ${cur.title}`);
      if (cur.opportunity_id) await timeline(db, ctx, "opportunity", cur.opportunity_id, "task_completed", `Completed: ${cur.title}`);
      if (cur.recurrence && cur.due_at) {
        const step = cur.recurrence === "daily" ? "1 day" : cur.recurrence === "weekly" ? "7 days" : "1 month";
        await db.exec(`insert into tasks(org_id, title, description, owner_id, priority, due_at, recurrence, lead_id, contact_id, company_id, opportunity_id, created_by)
                       select org_id, title, description, owner_id, priority, due_at + interval '${step}', recurrence, lead_id, contact_id, company_id, opportunity_id, $2 from tasks where id = $1`, [id, ctx.userId]);
      }
    } else if (v.status && v.status !== "completed") await db.exec("update tasks set completed_at = null where id = $1", [id]);
    return id;
  });
}

// ───── Timeline & audit history ─────
export async function getTimeline(ctx: Ctx, entity: string, id: string) {
  return withTenant(ctx, (db) => db.many<{ id: number; event_type: string; summary: string; data: Record<string, unknown>; actor_name: string | null; at: string }>(
    `select e.id, e.event_type, e.summary, e.data, u.name actor_name, e.at from timeline_events e left join users u on u.id = e.actor_id
      where e.org_id = $1 and e.entity_type = $2 and e.entity_id = $3 order by e.at desc, e.id desc limit 300`, [ctx.orgId, entity, id]));
}

export async function getAuditHistory(ctx: Ctx, table: string, id: string) {
  if (!["owner", "admin"].includes(ctx.role)) return [];
  return withTenant(ctx, (db) => db.many<{ id: number; action: string; changes: Record<string, [unknown, unknown]>; actor_name: string | null; at: string }>(
    `select a.id, a.action, a.changes, u.name actor_name, a.at from audit_logs a left join users u on u.id = a.actor_id
      where a.org_id = $1 and a.entity_type = $2 and a.entity_id = $3 order by a.at desc limit 200`, [ctx.orgId, table, id]));
}
