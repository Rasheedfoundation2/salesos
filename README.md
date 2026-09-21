# DigiFalx SalesOS — Phase 1

Multi-tenant sales CRM for agencies, service businesses, real-estate, events and B2B teams.
Next.js 16 · React 19 · TypeScript · Tailwind v4 · PostgreSQL (Supabase-compatible) with row-level security.

Pre-build architecture pack (product architecture, role matrix, ERD, workflow, navigation, automation-event model, API, security, milestones): **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## What Phase 1 delivers (all functional, database-backed)

| Area | Included |
|---|---|
| Auth | Register organisation, sign in/out, password reset (token, 60 min), invitation acceptance, forced password change for admin-created accounts, session list & revoke, login history, 10-attempt lockout |
| Multi-tenancy | `org_id` on every tenant row; `FORCE ROW LEVEL SECURITY`; runtime role cannot bypass RLS; role resolved inside the DB; org switcher; create extra organisations; plan limits (users, pipelines) |
| Users & roles | Owner, Admin, Sales Manager, Sales Rep, Marketing, Finance, Viewer + Platform Super Admin. **Admins add many users at once** (form rows or pasted list/CSV) — direct accounts with one-time temporary passwords, or 7-day invitation links. Roles, teams, targets, discount limits, territories, assignment weights, deactivate/reactivate |
| Leads | CRUD, inline edit with autosave, 10 statuses, duplicate detection (email/phone/domain/similar name) with warning, merge, E.164 phone validation, assignment (round robin, weighted, country, workload, manual), first-contact task, notification, response-time SLA, explainable 0–100 score, bulk assign/status/tag/archive, conversion to contact + company + opportunity |
| Contacts & companies | CRUD, linking, parent/subsidiary, lifetime value, client status/health, 360° pages |
| Opportunities & pipeline | Multiple pipelines, drag-and-drop Kanban + table, stage path, probability → weighted value, required fields per stage, restricted stages per role, max-days/stuck detection, mandatory lost reason, manager-only reopen, stage history, discount approval limits, high-value alerts |
| Closed Won | Value locked, handover record, 4 onboarding tasks, delivery owner notified, company → active client |
| Activities & tasks | Call, email, WhatsApp, meeting, video, note, site visit, proposal; outcomes; follow-up scheduling; @mentions; tasks with priority, reminder, recurrence, views (mine/today/overdue/next 7 days/team/unowned/completed) |
| Dashboards & reports | Executive, manager, rep, marketing, finance variants from live SQL; multi-currency via org FX; period/owner/team/pipeline/source filters; saved report views; drill-down links; CSV export; print-to-PDF |
| Search & productivity | Universal search (⌘K or `/`) across leads, contacts, companies, deals, tasks, activities; command palette; quick-create; recent records; saved & shared list views |
| Import / export | CSV + Excel (.xlsx), header auto-mapping, preview, validation dry-run, dedupe (skip/update/create), owner column or round robin across chosen agents, tags, source, error report, **undo import**; filtered CSV export with formula-injection protection |
| Audit | Append-only `audit_logs` (DB trigger blocks update/delete/truncate); automatic field-level change history on core tables; explicit entries for login, export, transfer, permission change, import, discount, settings, API keys |
| API | `GET/POST /api/v1/leads`, `GET/PATCH /api/v1/leads/{id}`, API keys (hashed), idempotency keys, pagination/filter/sort, structured errors, rate limit, OpenAPI at `/api/v1/openapi.json` |
| Settings | Organisation, terminology (Lead → Enquiry…), assignment method, SLA, rep visibility (own/team, enforced by RLS), pipelines & stages, sources, campaigns, lost reasons, products, scoring model, FX rates, API keys, plan usage, audit log, login history, email outbox |

Phase 2/3 modules (Inbox, Calendar, Proposals, Automations, AI Research, Knowledge Base) appear in the navigation as clearly labelled **planned** pages — no fake data and no dead buttons.

---

## Project structure

```
db/migrations/        0001_core.sql (schema) · 0002_rls.sql (tenancy, RLS, audit triggers) · 0003_plans.sql
scripts/              migrate.ts · seed.ts (DigiFalx demo data via the real service layer)
src/proxy.ts          coarse session gate + security headers (Next 16 "proxy", formerly middleware)
src/lib/
  db.ts               pools; withTenant() sets app.org_id/app.user_id/timezone per transaction; withSystem()
  auth/               bcrypt, hashed session tokens, cookie session, request context
  rbac.ts             role → module/action/scope matrix, field redaction, errors
  validation/         Zod schemas + phone normalisation
  scoring.ts · nba.ts explainable lead score · next-best-action rules
  services/           business logic: leads, assignment, opportunities, accounts, activities, imports,
                      exports, dashboard, search, team, settings, auth, provision, journal (timeline/audit/events)
src/app/
  (auth)/             login, register, reset, invite
  (app)/              home, leads, contacts, companies, opportunities, pipeline, activities, tasks, reports,
                      team, settings, campaigns, products, integrations, account, help, planned modules
  platform/           super-admin console
  actions/            server actions (auth, crm, admin, shell)
  api/                v1 REST, import preview/commit, export, health
src/components/       ui primitives (Radix), shell (sidebar, top bar, ⌘K), crm (forms, tables, record tabs, inline edit, stage move), charts
tests/unit            scoring, RBAC, validation, parsing, formatting
tests/integration     tenant isolation, RLS, audit immutability, lead workflow, pipeline rules, import, bulk users, reporting, API keys
tests/e2e             Playwright journeys (desktop + mobile)
```

## Database schema (summary)

Global: `plans`, `organisations`, `users`, `sessions`, `password_resets`, `login_history`, `email_outbox`.
Tenant (all carry `org_id`, all under RLS): `teams`, `memberships`, `invitations`, `lead_sources`, `campaigns`, `products`, `lost_reasons`, `fx_rates`, `import_batches`, `companies`, `contacts`, `pipelines`, `pipeline_stages`, `leads`, `opportunities`, `opportunity_stage_history`, `handovers`, `activities`, `tasks`, `timeline_events`, `audit_logs`, `events` (outbox for Phase 2 automations), `notifications`, `saved_views`, `recent_records`, `api_keys`, `idempotency_keys`, `assignment_state`.
Search: generated `tsvector` columns + GIN, trigram index on company names. Full DDL in `db/migrations`.

---

## Local setup

Requirements: Node 20.9+ (22 recommended), PostgreSQL 15+.

```bash
npm install
cp .env.example .env            # fill in the three database URLs + SESSION_SECRET
createdb salesos                # or use a Supabase project (see Deployment)
npm run db:setup                # = db:reset (drop & migrate) + db:seed
npm run dev                     # http://localhost:3000
```

Migrations only (non-destructive): `npm run db:migrate`. The migration runner also sets the passwords of the `salesos_app` and `salesos_system` roles from `DATABASE_URL` / `DATABASE_SYSTEM_URL`.

### Demo logins (seed) — password `DigiFalx@2026`

| Role | Email |
|---|---|
| Organisation Owner | rasheed@digifalx.com |
| Sales Manager | aisha@digifalx.com |
| Sales Rep (UAE/GCC) | omar@digifalx.com |
| Sales Rep (India/UK) | priya@digifalx.com |
| Marketing | sara@digifalx.com |
| Finance | daniel@digifalx.com |
| Platform Super Admin | platform@salesos.app |
| Second tenant (isolation check) | admin@acmerealty.test |

Seed contents: 6 users, 25 leads, 15 contacts, 10 companies, 13 opportunities (incl. one from a conversion) across 2 pipelines, activities, 50+ tasks, 3 handovers, 4 campaigns, 8 products — UAE, UK and Indian companies in AED, GBP and INR.

**Change or remove the demo users before going live** (`npm run db:reset` without seeding gives an empty database; then register your organisation at `/register`).

---

## Onboarding your sales team and lead data

1. **Team → Add users** → *Paste a list*: one per line `email, full name, role, team` (e.g. `omar@digifalx.com, Omar Farooq, Sales Rep, Sales`).
   Choose **Create accounts now** (temporary passwords shown once — each agent sets their own at first sign-in) or **Send invitations** (links; queued in Settings → Email outbox until an email provider is connected).
2. Open each rep (Manage) to set territory countries, monthly target, assignment weight and discount limit.
3. **Leads → Import**: upload CSV/Excel → check the auto-mapping → *Assign leads to*: **Round robin across selected agents** (or map an "Owner email" column to assign row-by-row) → **Validate** → **Import**. Agents are notified, get first-contact tasks, and the 15-minute response SLA starts. Undo is available from the import history.

---

## Deployment (Vercel + Supabase)

1. Create a Supabase project. From *Project Settings → Database* copy the **direct** (or session-pooler) connection string for the `postgres` user → `DATABASE_ADMIN_URL`.
2. Choose strong passwords and set `DATABASE_URL` (user `salesos_app`) and `DATABASE_SYSTEM_URL` (user `salesos_system`) against the same host. With Supavisor pooling the username format is `salesos_app.<project-ref>`. Set `DB_SSL=true`.
3. Run once from your machine/CI: `npm run db:migrate` (creates roles, schema, RLS, sets role passwords). Optionally `npm run db:seed`.
4. Import the repo into Vercel; add `DATABASE_URL`, `DATABASE_SYSTEM_URL`, `DB_SSL`, `APP_URL` (your https URL), `SESSION_SECRET`. **Do not** add `DATABASE_ADMIN_URL` to the runtime environment.
5. Deploy. Health check: `GET /api/health`.

Any Node host works (`npm run build && npm start`); Postgres can be any managed 15+ instance.

## Testing

```bash
createdb salesos_test                      # once; the suite resets it on every run
npm run typecheck
npm test                                   # Vitest: 46 unit + integration tests (real Postgres, RLS enforced)
npm run db:setup && npm run build && npm start &
npm run test:e2e                           # Playwright: 12 journeys (desktop + mobile)
```
CI workflow: `.github/workflows/ci.yml` (Postgres service, typecheck, unit/integration, build, E2E).

---

## Known limitations (Phase 1)

- **Auth is built-in, not Supabase Auth.** Chosen so tenant isolation and every journey are testable end-to-end; RLS does not depend on it. MFA (TOTP) is modelled but not enforced yet. No SSO/OAuth sign-in.
- **Email delivery is not connected.** Invitations and password resets are written to `email_outbox` (visible in Settings → Email outbox; reset links are also logged to the server console in development). Use "Create accounts now" when onboarding before email is set up.
- **Verified on PostgreSQL 16 locally**, not yet run against a live Supabase project. If your Supabase `postgres` role cannot create a `BYPASSRLS` role, point `DATABASE_SYSTEM_URL` at a role that already has it (e.g. `postgres`).
- API rate limiting is in-memory per server instance; use Redis/Upstash for multi-instance deployments. Only the **leads** API is implemented; other `/api/v1` resources are specified for Phase 2.
- Import supports **leads** (CSV/XLSX up to 10,000 rows / 10 MB, processed synchronously). Contact/company import, background jobs and progress streaming are Phase 2.
- File attachments/documents (storage), custom-field builder UI, record layouts, territory rules beyond country lists, field-level permission UI, holidays/working-hours calendars and data anonymisation/export requests are not built yet (data model has `custom jsonb`, `consent_status`, archive).
- PDF export uses the browser's print-to-PDF. Billing is a plan/usage page only (Stripe in Phase 2).
- Multi-language: UK English only; strings are not yet extracted for i18n.
- Automations: built-in rules only (assignment, SLA, first task, high-value alert, handover). Every mutation already writes to the `events` outbox for the Phase 2 engine.

## Recommended Phase 2 tasks

1. Background worker (e.g. pg-boss/Inngest) consuming `events`: automation builder + the 15 recipes, SLA-breach and inactivity scans, retries/idempotency/logs.
2. Email provider (Resend/Postmark/SES) for invitations, resets and notification emails; Gmail/Outlook sync.
3. WhatsApp Cloud API + unified inbox (templates, 24-hour window, STOP detection).
4. Proposal builder (products → line items → PDF → public link → accept → Closed Won).
5. Calendar + Google/Outlook sync; Supabase Storage for attachments.
6. Remaining `/api/v1` resources, outgoing signed webhooks, Meta Lead Ads / Google Sheets / Zapier connectors.
7. Custom-field builder, MFA enforcement, SSO, Stripe billing, i18n.
