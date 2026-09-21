import "server-only";
import { Pool, types, type PoolClient } from "pg";
import { env } from "./env";
import type { Ctx } from "./types";

// Timestamps → ISO strings, dates → YYYY-MM-DD (no timezone shifting), bigint counts → number.
const toIso = (v: string) => {
  let s = v.replace(" ", "T");
  if (/[+-]\d\d$/.test(s)) s += ":00";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? v : d.toISOString();
};
types.setTypeParser(1184, toIso);
types.setTypeParser(1114, (v: string) => new Date(v + "Z").toISOString());
types.setTypeParser(1082, (v: string) => v);
types.setTypeParser(20, (v: string) => Number(v));

type G = typeof globalThis & { __salesosPools?: { app: Pool; system: Pool } };
function pools() {
  const g = globalThis as G;
  if (!g.__salesosPools) {
    const e = env();
    const ssl = e.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined;
    g.__salesosPools = {
      app: new Pool({ connectionString: e.DATABASE_URL, max: 10, ssl }),
      system: new Pool({ connectionString: e.DATABASE_SYSTEM_URL, max: 5, ssl }),
    };
  }
  return g.__salesosPools;
}

export class Db {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(public client: PoolClient) {}
  /** Serialises queries on the transaction's single connection (safe to use with Promise.all). */
  private q(sql: string, params: unknown[]) {
    const run = this.queue.then(() => this.client.query(sql, params));
    this.queue = run.catch(() => undefined);
    return run;
  }
  async many<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.q(sql, params)).rows as T[];
  }
  async one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
    return ((await this.q(sql, params)).rows[0] as T) ?? null;
  }
  async exec(sql: string, params: unknown[] = []): Promise<number> {
    return (await this.q(sql, params)).rowCount ?? 0;
  }
}

async function tx<T>(pool: Pool, setup: (c: PoolClient) => Promise<void>, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await setup(client);
    const result = await fn(new Db(client));
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Runs fn inside a transaction as the RLS-restricted app role, scoped to the caller's organisation. */
export function withTenant<T>(ctx: Pick<Ctx, "orgId" | "userId"> & { org?: { timezone?: string } }, fn: (db: Db) => Promise<T>): Promise<T> {
  return tx(pools().app, async (c) => {
    // Naive date-times from forms are interpreted in the organisation's timezone.
    await c.query("select set_config('app.org_id', $1, true), set_config('app.user_id', $2, true), set_config('timezone', $3, true)",
      [ctx.orgId, ctx.userId, ctx.org?.timezone ?? "Asia/Dubai"]);
  }, fn);
}

/** Privileged access (bypasses RLS). Only for authentication, invitations, API-key resolution and platform administration. */
export function withSystem<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  return tx(pools().system, async () => {}, fn);
}
