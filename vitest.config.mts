import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const TEST_DB = process.env.TEST_DATABASE_NAME ?? "salesos_test";
const host = process.env.TEST_DB_HOST ?? "localhost:5432";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)), "server-only": fileURLToPath(new URL("./tests/support/empty.ts", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    globalSetup: ["tests/support/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    env: {
      DATABASE_ADMIN_URL: process.env.TEST_DATABASE_ADMIN_URL ?? `postgres://salesos_admin:admin_pw@${host}/${TEST_DB}`,
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? `postgres://salesos_app:app_pw_local@${host}/${TEST_DB}`,
      DATABASE_SYSTEM_URL: process.env.TEST_DATABASE_SYSTEM_URL ?? `postgres://salesos_system:system_pw_local@${host}/${TEST_DB}`,
      APP_URL: "http://localhost:3000",
      SESSION_SECRET: "test-secret-0123456789abcdef0123456789abcdef",
    },
  },
});
