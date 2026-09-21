/* Applies db/migrations/*.sql in order. Usage: tsx scripts/migrate.ts [--reset] */
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

async function main() {
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) throw new Error("DATABASE_ADMIN_URL is required for migrations");
  const client = new Client({ connectionString: url });
  await client.connect();
  if (process.argv.includes("--reset")) {
    console.log("Resetting database schema…");
    await client.query("drop schema if exists public cascade; drop schema if exists app cascade; create schema public;");
  }
  await client.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz default now())");
  const dir = join(process.cwd(), "db", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const done = new Set((await client.query("select name from schema_migrations")).rows.map((r) => r.name));
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = readFileSync(join(dir, f), "utf8");
    process.stdout.write(`Applying ${f}… `);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into schema_migrations(name) values ($1)", [f]);
      await client.query("commit");
      console.log("done");
    } catch (e) {
      await client.query("rollback");
      console.error("FAILED");
      throw e;
    }
  }
  // Runtime role passwords come from the environment so they never live in migrations.
  for (const [role, env] of [["salesos_app", "DATABASE_URL"], ["salesos_system", "DATABASE_SYSTEM_URL"]] as const) {
    const u = process.env[env];
    if (!u) continue;
    const pw = decodeURIComponent(new URL(u).password);
    if (pw) await client.query(`alter role ${role} password '${pw.replace(/'/g, "''")}'`);
  }
  await client.end();
  console.log("Migrations complete.");
}
main().catch((e) => { console.error(e); process.exit(1); });
