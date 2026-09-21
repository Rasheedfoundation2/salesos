# DigiFalx SalesOS — Architecture Pack (pre-build)

Version 1.0 · 21 Sep 2026 · Scope: full product; Phase 1 built in this repository.

---

## 1. Product architecture

```
┌──────────────────────────── Browser (desktop-first, responsive) ────────────────────────────┐
│ Next.js App Router UI · React 19 · Tailwind v4 · Radix primitives (shadcn-style components) │
│ Server Components render data · Client Components for Kanban, dialogs, import wizard, ⌘K   │
└───────────────────────────────▲─────────────────────────────────────────────────────────────┘
                                │ Server Actions (forms, mutations)  ·  Route Handlers (/api/v1, export)
┌───────────────────────────────┴──── Next.js server (Node runtime) ───────────────────────────┐
│ proxy.ts ─ session-cookie gate (coarse)                                                     │
│ lib/auth      sessions, passwords (bcrypt), invites, resets, login history                  │
│ lib/rbac      role → module/action/scope matrix, field restrictions (single source of truth)  │
│ lib/services  business logic: leads, assignment, conversion, pipeline moves, handover,      │
│               tasks, activities, import, search, dashboards, audit, notifications           │
│ lib/repos     SQL only; every call runs inside withTenant(ctx) → SET LOCAL app.* context    │
│ lib/validation Zod schemas shared by forms, actions and API                                 │
│ lib/events    domain events (lead.created, stage.changed …) → timeline + audit + notify;    │
│               Phase 2 automation engine subscribes here                                      │
└───────────────────────────────▲─────────────────────────────────────────────────────────────┘
                                │ two pools: APP role (RLS enforced) · SYSTEM role (auth + platform admin only)
┌───────────────────────────────┴──── PostgreSQL (Supabase-compatible) ───────────────────────┐
│ Tenant tables carry org_id · FORCE ROW LEVEL SECURITY · policies read app.org_id / app.user_id│
│ Role & membership resolved inside the DB (security-definer functions), not trusted from app │
│ Append-only audit_logs (trigger blocks UPDATE/DELETE) · tsvector + trigram search indexes   │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
Phase 2+: background worker (automations, email/WhatsApp, webhooks) · object storage · AI gateway
```

**Key decisions**

| Decision | Choice | Why |
|---|---|---|
| Tenancy | Shared DB, shared schema, `org_id` on every tenant row, Postgres RLS | Cheapest to operate, isolation enforced by the database, not the UI |
| DB | PostgreSQL 15+ (runs on Supabase Postgres unchanged) | Required stack; RLS; full-text search |
| Auth | Built-in auth (bcrypt, hashed opaque session tokens, httpOnly cookies) | Fully testable offline, no vendor lock; Supabase Auth adapter can replace `lib/auth` later without touching RLS |
| Data access | Raw SQL through a thin repository layer (`pg`) | RLS-friendly, explicit, no ORM magic around `SET LOCAL` |
| Mutations | Server Actions + Zod | Type-safe, CSRF-protected by Next.js origin checks |
| Money | `numeric(14,2)` + ISO currency per record; reports convert via org FX table | Multi-currency AED/INR/GBP/USD/EUR |
| Deletes | Soft archive (`archived_at`) | Recoverable, audit-friendly |

---

## 2. User-role matrix

Scope: **A** = all org records · **O** = own records (owner = me) · **R** = read-only · — = no access.

| Module / capability | Owner | Admin | Sales Manager | Sales Rep | Marketing | Finance | Viewer |
|---|---|---|---|---|---|---|---|
| Leads | A | A | A | O (create/edit own) | A (create/edit, import) | — | R |
| Contacts / Companies | A | A | A | R all, edit own | R | R | R |
| Opportunities | A | A | A + reopen lost | O | R (no financials) | R (financials) | R |
| Pipeline move | ✓ | ✓ | ✓ | own deals, not into restricted stages | — | — | — |
| Activities / Tasks | A | A | A | O + on own records | own | own | R |
| Assign / transfer | ✓ | ✓ | ✓ | — | — | — | — |
| Import | ✓ | ✓ | ✓ | — | ✓ (leads) | — | — |
| Export | ✓ | ✓ | ✓ | — | ✓ (leads) | ✓ | — |
| Archive (delete) | ✓ | ✓ | ✓ | — | — | — | — |
| Dashboards | Exec | Exec | Manager | Rep | Marketing view | Revenue view | Exec (R) |
| Team & users (invite many, roles, deactivate) | ✓ | ✓ (cannot touch Owner) | — | — | — | — | — |
| Settings (pipelines, sources, lost reasons, scoring) | ✓ | ✓ | — | — | sources only | — | — |
| Audit log | ✓ | ✓ | — | — | — | — | — |
| Billing / plan, transfer ownership | ✓ | — | — | — | — | — | — |
| Discount approval limit | ∞ | ∞ | configurable | configurable (default 10%) | — | — | — |
| Platform Super Admin | separate flag on user: all orgs, suspend/reactivate, usage, health |

Enforcement layers: (1) `lib/rbac` checks module/action on every server action and API route; (2) RLS enforces tenant + ownership scope + read-only roles in the DB; (3) serialisers strip restricted fields (e.g. deal values for Marketing).

---

## 3. Entity-relationship plan

```
organisations 1─* memberships *─1 users            organisations 1─* teams 1─* memberships
organisations 1─* invitations                     users 1─* sessions / password_resets / login_history
organisations 1─* lead_sources 1─* campaigns
organisations 1─* companies 1─* contacts          companies *─1 companies (parent)
leads ─(convert)→ contact + company + opportunity  leads *─1 lead_sources / campaigns / users(owner)
organisations 1─* pipelines 1─* pipeline_stages
opportunities *─1 pipeline, stage, company, contact, owner, lead(origin)
opportunities 1─* opportunity_stage_history       opportunities 1─0..1 handovers
activities  *─0..1 lead | contact | company | opportunity   (polymorphic via nullable FKs)
tasks       *─0..1 lead | contact | company | opportunity
timeline_events (entity_type, entity_id)  ·  audit_logs (append-only)
saved_views · import_batches · notifications · recent_records · api_keys · products
lost_reasons · fx_rates · plans (global) · email_outbox
```
Every tenant table: `id uuid pk, org_id uuid not null → organisations, created_at, updated_at`, most also `owner_id, archived_at, custom jsonb, tags text[]`. Full DDL: `db/migrations/*.sql`.

---

## 4. Complete sales workflow

| # | Stage | System behaviour |
|---|---|---|
| 1 | Capture | Manual, CSV/Excel import, `/api/v1/leads` (API key), later forms/Meta/WhatsApp. Validate email & phone (E.164), dedupe on email/phone/company domain, warn before creating duplicate |
| 2 | Assign | Rule: manual · round robin · weighted round robin · by country · by workload. Import can map an "owner email" column or round-robin across selected reps |
| 3 | First action | Auto-create "First contact" task (due +15 min in working hours), notify owner, start response SLA (`first_response_due_at`) |
| 4 | Research | Status *Researching*; Phase 3 AI research workspace |
| 5 | Qualify | Explainable score 0–100 (9 weighted dimensions, org-configurable) → Hot/Warm/Nurture/Low; BANT fields |
| 6 | Outreach | Log call/email/WhatsApp/meeting; first logged touch stamps `first_contacted_at` (SLA met/breached) |
| 7 | Convert | Lead → Contact + Company (reuse matches) + Opportunity in chosen pipeline; lead locked as *Converted* |
| 8 | Discovery → Proposal → Negotiation | Kanban moves; stage probability → weighted value; required fields per stage; restricted stages; history row + timeline + audit |
| 9 | Close | Won: lock value, won date, create Handover + onboarding tasks, notify delivery owner. Lost: lost reason mandatory |
| 10 | Handover | Services, deliverables, value, payment terms, stakeholders, risks, deadlines, delivery owner |
| 11 | Follow-up | Every open lead/deal must have a next action; "no next action" & overdue queues |
| 12 | Report | Dashboards from live data: pipeline, weighted, win rate, cycle, response time, source → revenue |

---

## 5. Page & navigation structure

Sidebar (collapsible): Home · Leads · Contacts · Companies · Opportunities · Pipeline · Inbox · Activities · Tasks · Calendar · Proposals · Products & Services · Campaigns · Automations · AI Research · Reports · Knowledge Base · Integrations · Team · Settings.
Phase 1 modules are fully functional; Phase 2/3 entries show a clear "Planned — Phase 2/3" page (no fake data, no dead buttons).

Top bar: universal search (⌘K command palette), quick-create, notifications, organisation switcher, recent records, help, profile menu.

Routes: `/login` `/register` `/invite/[token]` `/reset` `/reset/[token]` · `/(app)/home` · `/leads` `/leads/[id]` `/leads/import` · `/contacts` `/contacts/[id]` · `/companies` `/companies/[id]` · `/opportunities` `/opportunities/[id]` · `/pipeline` · `/activities` · `/tasks` · `/team` · `/settings/*` (organisation, pipelines, sources, lost reasons, scoring, API keys, audit log) · `/platform` (super admin) · `/api/v1/*` · `/api/export/[entity]`.

Record pages (360°): header with owner, status/stage, quick actions, next best action; tabs Overview · Timeline · Activities · Tasks · Related · Audit History.

---

## 6. Automation-event model

Every service mutation emits a domain event **inside the same DB transaction** (outbox pattern):

```
events(id, org_id, type, entity_type, entity_id, actor_id, payload jsonb, occurred_at, processed_at)
```
Types: `lead.created|updated|assigned|converted|score_changed`, `opportunity.created|stage_changed|won|lost`, `task.created|completed|overdue`, `activity.logged`, `import.completed`, `record.inactive` (scheduler), `webhook.received`, `proposal.viewed|accepted` (P2).

Phase 1: events write timeline + audit + in-app notifications synchronously.
Phase 2 engine: worker polls `events` → matches `automations(trigger, conditions jsonb, actions jsonb, version, status)` → writes `automation_runs(status, attempts, error, idempotency_key = automation_id+event_id)`; retries with exponential back-off; test mode = dry run; rate limits per org; failures notify owners. Scheduled triggers (SLA breach, inactivity, close date approaching) generated by a cron tick that emits synthetic events.

---

## 7. API structure

Versioned REST under `/api/v1`, JSON, API-key auth (`Authorization: Bearer sk_live_…`, stored hashed, scoped to one organisation), OAuth-ready (keys map to a principal + scopes).

| Resource | Endpoints |
|---|---|
| leads | `GET /leads?status=&owner=&q=&page=&per_page=&sort=` · `POST /leads` · `GET/PATCH /leads/{id}` |
| contacts, companies, opportunities, activities, tasks | same pattern (Phase 2 for non-lead resources) |
| proposals, webhooks | Phase 2 |

Conventions: pagination `page`/`per_page` (max 100) + `meta.total`; `Idempotency-Key` header on POST (24 h replay store); errors `{ "error": { "code", "message", "details" } }` with proper HTTP status; per-key rate limit (default 120 req/min); outgoing webhooks signed `X-SalesOS-Signature: t=…,v1=HMAC-SHA256`. OpenAPI spec at `/api/v1/openapi.json`.

---

## 8. Security approach

- **Tenant isolation in the DB**: tables use `FORCE ROW LEVEL SECURITY`; runtime connects as `salesos_app` (no BYPASSRLS, not table owner). Each request opens a transaction and `SET LOCAL app.org_id / app.user_id`; the DB itself resolves the user's role from `memberships` and rejects orgs the user doesn't belong to.
- **RBAC server-side**: `can(ctx, module, action)` guards every action/route; UI hiding is cosmetic only.
- **Auth**: bcrypt (cost 12), 256-bit random session tokens stored as SHA-256 hashes, httpOnly + SameSite=Lax + Secure cookies, 30-day sliding expiry, session list & revoke, login history, lockout after 10 failed attempts / 15 min, reset tokens single-use 60 min. MFA (TOTP) data model ready; enforcement Phase 2.
- **Input**: Zod on every boundary; parameterised SQL only; React escapes output (XSS); Server Actions origin-checked (CSRF); CSV formula-injection neutralised on export.
- **Audit**: append-only `audit_logs` (DB trigger blocks UPDATE/DELETE) for login, export, archive, permission change, transfer, import, settings, API key creation.
- **Secrets**: env only, validated at boot, never shipped to the client bundle (`server-only` imports).
- **Data lifecycle**: archive not delete, consent status per lead/contact, anonymisation & export-request tooling Phase 2, retention configurable Phase 2.

---

## 9. Implementation milestones

| Phase | Scope | Exit criteria |
|---|---|---|
| **1 — CRM foundation (this build)** | Auth, orgs, invites (bulk), roles, teams, leads, contacts, companies, opportunities, pipelines & stages, Kanban, activities, tasks, dashboards (exec/manager/rep), universal search, ⌘K, timelines, audit, CSV/Excel import & export, saved views, bulk actions, lead scoring (explainable), handover, `/api/v1/leads`, seed data, tests | Acceptance criteria §30 for Phase-1 items pass automated tests |
| **2 — Communication & automation** | Worker + automation builder & 15 recipes, unified inbox, Gmail/Outlook, WhatsApp Cloud API, calendar sync, proposal builder + PDF + public link, notifications email, outgoing webhooks, remaining v1 API resources, Stripe billing | Automations run with logs/retries; proposal accept → Closed Won |
| **3 — AI & advanced reporting** | AI gateway with org budgets, research workspace, summaries, drafts, RAG knowledge base, forecasting, advanced reports, next-best-action | AI outputs sourced, labelled, approval-gated, usage-logged |
