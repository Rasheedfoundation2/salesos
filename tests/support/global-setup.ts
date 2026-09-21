import { execSync } from "node:child_process";

/** Resets the dedicated test database and applies all migrations before the suite. */
export default function setup() {
  const host = process.env.TEST_DB_HOST ?? "localhost:5432";
  const db = process.env.TEST_DATABASE_NAME ?? "salesos_test";
  const env = {
    ...process.env,
    DATABASE_ADMIN_URL: process.env.TEST_DATABASE_ADMIN_URL ?? `postgres://salesos_admin:admin_pw@${host}/${db}`,
    DATABASE_URL: process.env.TEST_DATABASE_URL ?? `postgres://salesos_app:app_pw_local@${host}/${db}`,
    DATABASE_SYSTEM_URL: process.env.TEST_DATABASE_SYSTEM_URL ?? `postgres://salesos_system:system_pw_local@${host}/${db}`,
    DOTENV_CONFIG_PATH: "/dev/null",
  };
  execSync("npx tsx scripts/migrate.ts --reset", { env, stdio: "inherit" });
}
