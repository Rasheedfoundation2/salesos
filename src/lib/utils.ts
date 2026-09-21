import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const symbols: Record<string, string> = { AED: "AED", INR: "₹", GBP: "£", USD: "$", EUR: "€" };
// Formatting is implemented without locale-dependent Intl output so server and browser render identical text (no hydration drift).
const group = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
function compactNum(n: number) {
  const a = Math.abs(n);
  const f = (v: number, u: string) => `${(Math.round(v * 10) / 10).toString()}${u}`;
  if (a >= 1e9) return f(n / 1e9, "B"); if (a >= 1e6) return f(n / 1e6, "M"); if (a >= 1e3) return f(n / 1e3, "K");
  return group(n);
}
export function money(value: number | string | null | undefined, currency = "AED", compact = false) {
  const n = Number(value ?? 0);
  const body = compact ? compactNum(n) : group(n);
  const sym = symbols[currency] ?? currency;
  return sym.length > 1 ? `${sym} ${body}` : `${n < 0 ? "-" : ""}${sym}${body.replace("-", "")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
function parts(d: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: String(Number(p.hour) % 24).padStart(2, "0"), min: String(p.minute).padStart(2, "0") };
}
/** "21 Sept 2026" (dates without time are not timezone-shifted). */
export function fmtDate(d: string | Date | null | undefined, opts: { day?: unknown; month?: unknown; year?: unknown } = { day: 1, month: 1, year: 1 }, tz = "Asia/Dubai") {
  if (!d) return "—";
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) { const [y, m, dd] = d.split("-").map(Number); return [String(dd).padStart(2, "0"), MONTHS[m! - 1], opts.year ? y : null].filter(Boolean).join(" "); }
  const p = parts(new Date(d), tz);
  return [String(p.d).padStart(2, "0"), MONTHS[p.m - 1], opts.year ? p.y : null].filter(Boolean).join(" ");
}
export function fmtDateTime(d: string | Date | null | undefined, tz = "Asia/Dubai") {
  if (!d) return "—";
  const p = parts(new Date(d), tz);
  return `${String(p.d).padStart(2, "0")} ${MONTHS[p.m - 1]}, ${p.h}:${p.min}`;
}
export function relTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  const diff = (new Date(d).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff); const fut = diff > 0;
  const say = (n: number, u: string) => { const t = `${n} ${u}${n === 1 ? "" : "s"}`; return fut ? `in ${t}` : `${t} ago`; };
  if (abs < 90) return "just now";
  if (abs < 3600) return say(Math.round(abs / 60), "minute");
  if (abs < 86400) return say(Math.round(abs / 3600), "hour");
  const days = Math.round(abs / 86400);
  if (days === 1) return fut ? "tomorrow" : "yesterday";
  if (days < 30) return say(days, "day");
  return fmtDate(d);
}
export function titleCase(s: string | null | undefined) {
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}
export function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "org";
}
