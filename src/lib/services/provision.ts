import "server-only";
import type { Db } from "../db";
import { DEFAULT_FX, DEFAULT_LOST_REASONS, DEFAULT_SOURCES, DEFAULT_STAGES } from "../constants";
import { DEFAULT_SCORING } from "../scoring";

export const DEFAULT_ORG_SETTINGS = {
  rep_visibility: "own",
  assignment: { method: "round_robin", country_rules: {} as Record<string, string> },
  sla_minutes: 15,
  working_hours: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] },
  scoring: DEFAULT_SCORING,
  auto_first_task: true,
};

/** Creates the default configuration for a new organisation. Must run with system privileges. */
export async function provisionOrg(db: Db, orgId: string, baseCurrency = "AED") {
  const p = await db.one<{ id: string }>("insert into pipelines(org_id, name, is_default) values ($1,'Sales Pipeline',true) returning id", [orgId]);
  let pos = 0;
  for (const s of DEFAULT_STAGES) {
    await db.exec("insert into pipeline_stages(org_id, pipeline_id, name, position, probability, color, kind, required_fields) values ($1,$2,$3,$4,$5,$6,$7,$8)",
      [orgId, p!.id, s.name, pos++, s.probability, s.color, s.kind, s.required_fields ?? []]);
  }
  for (const s of DEFAULT_SOURCES) await db.exec("insert into lead_sources(org_id, name, channel) values ($1,$2,$3)", [orgId, s.name, s.channel]);
  let i = 0;
  for (const r of DEFAULT_LOST_REASONS) await db.exec("insert into lost_reasons(org_id, name, position) values ($1,$2,$3)", [orgId, r, i++]);
  const base = DEFAULT_FX[baseCurrency] ?? 1;
  for (const [cur, aed] of Object.entries(DEFAULT_FX)) {
    await db.exec("insert into fx_rates(org_id, currency, rate_to_base) values ($1,$2,$3)", [orgId, cur, aed / base]);
  }
  await db.exec("insert into teams(org_id, name) values ($1,'Sales')", [orgId]);
  await db.exec("insert into assignment_state(org_id) values ($1)", [orgId]);
  return p!.id;
}
