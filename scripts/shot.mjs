// Dev helper: node scripts/shot.mjs <email> <path1> [path2...]  → screenshots in /tmp/shots
import { chromium } from "@playwright/test";
const [email, ...paths] = process.argv.slice(2);
const base = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 1440), height: Number(process.env.H ?? 900) } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
await page.goto(base + "/login");
await page.fill("#email", email); await page.fill("#password", process.env.PW ?? "DigiFalx@2026");
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }), page.click("button[type=submit]")]);
for (const p of paths) {
  await page.goto(base + p, { waitUntil: "networkidle", timeout: 90000 });
  const name = p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root";
  await page.screenshot({ path: `/tmp/shots/${name}.png`, fullPage: process.env.FULL === "1" });
  console.log("shot", p, "→", page.url());
}
if (errors.length) console.log(errors.join("\n"));
await browser.close();
