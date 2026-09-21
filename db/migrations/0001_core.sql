-- DigiFalx SalesOS — core schema, tenancy and RLS
create extension if not exists citext;
create extension if not exists pg_trgm;

-- Runtime roles. salesos_app: all tenant traffic (RLS enforced). salesos_system: auth + platform admin (bypasses RLS).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'salesos_app') then create role salesos_app login; end if;
  if not exists (select 1 from pg_roles where rolname = 'salesos_system') then create role salesos_system login bypassrls; end if;
end $$;

create schema if not exists app;
grant usage on schema app to salesos_app, salesos_system;

-- ───────── Global (non-tenant) tables ─────────
create table plans (
  code text primary key,
  name text not null,
  limits jsonb not null default '{}',
  price_monthly numeric(10,2),
  stripe_price_id text
);

create table organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  plan_code text not null references plans(code) default 'trial',
  status text not null default 'active' check (status in ('active','suspended','cancelled')),
  trial_ends_at timestamptz,
  timezone text not null default 'Asia/Dubai',
  currency text not null default 'AED' check (currency in ('AED','INR','GBP','USD','EUR')),
  date_format text not null default 'dd/MM/yyyy',
  locale text not null default 'en-GB',
  fiscal_year_start int not null default 1,
  terminology jsonb not null default '{}',
  settings jsonb not null default '{}',
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  name text not null,
  password_hash text,
  is_platform_admin boolean not null default false,
  mfa_secret text,
  mfa_enabled boolean not null default false,
  disabled_at timestamptz,
  failed_logins int not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references users(id) on delete cascade,
  active_org_id uuid references organisations(id) on delete set null,
  ip text, user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index on sessions(user_id);

create table password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table login_history (
  id bigserial primary key,
  user_id uuid references users(id) on delete cascade,
  email citext,
  success boolean not null,
  reason text,
  ip text, user_agent text,
  at timestamptz not null default now()
);

create table email_outbox (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id) on delete cascade,
  to_email citext not null,
  subject text not null,
  body text not null,
  status text not null default 'queued',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- ───────── Tenant tables ─────────
create table teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('owner','admin','manager','rep','marketing','finance','viewer')),
  team_id uuid references teams(id) on delete set null,
  title text,
  status text not null default 'active' check (status in ('active','deactivated')),
  max_discount_pct numeric(5,2) not null default 10,
  monthly_target numeric(14,2),
  assignment_weight int not null default 1,
  accepts_leads boolean not null default true,
  countries text[] not null default '{}',
  languages text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index on memberships(user_id);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  email citext not null,
  name text,
  role text not null check (role in ('admin','manager','rep','marketing','finance','viewer')),
  team_id uuid references teams(id) on delete set null,
  token_hash text not null unique,
  invited_by uuid references users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index on invitations(org_id, email);

create table lead_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  channel text not null default 'other',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  source_id uuid references lead_sources(id) on delete set null,
  status text not null default 'active',
  budget numeric(14,2), currency text default 'AED',
  starts_on date, ends_on date,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  category text, description text, sku text,
  billing_type text not null default 'one_time' check (billing_type in ('one_time','monthly','quarterly','annual','custom')),
  unit_price numeric(14,2) not null default 0,
  tax_rate numeric(5,2) not null default 5,
  cost numeric(14,2),
  currency text not null default 'AED',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table lost_reasons (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  position int not null default 0,
  unique (org_id, name)
);

create table fx_rates (
  org_id uuid not null references organisations(id) on delete cascade,
  currency text not null,
  rate_to_base numeric(18,8) not null, -- 1 unit of currency = x base currency
  updated_at timestamptz not null default now(),
  primary key (org_id, currency)
);

create table import_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  entity text not null,
  filename text,
  status text not null default 'completed',
  total_rows int not null default 0,
  created_count int not null default 0,
  skipped_count int not null default 0,
  error_count int not null default 0,
  errors jsonb not null default '[]',
  created_by uuid references users(id),
  undone_at timestamptz,
  created_at timestamptz not null default now()
);

create table companies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  domain citext,
  website text, logo_url text, industry text, company_size text, revenue_range text,
  phone text, email citext, linkedin_url text, social jsonb not null default '{}',
  country text, city text, billing_address text,
  operating_markets text[] not null default '{}',
  owner_id uuid references users(id) on delete set null,
  parent_id uuid references companies(id) on delete set null,
  client_status text not null default 'prospect' check (client_status in ('prospect','active_client','former_client','partner')),
  health text check (health in ('healthy','watch','at_risk')),
  active_services text[] not null default '{}',
  notes text,
  tags text[] not null default '{}',
  custom jsonb not null default '{}',
  import_batch_id uuid references import_batches(id) on delete set null,
  archived_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('simple', coalesce(name,'')||' '||coalesce(domain::text,'')||' '||coalesce(industry,'')||' '||coalesce(city,'')||' '||coalesce(country,''))) stored
);
create index on companies(org_id, owner_id);
create index on companies using gin(search);
create index on companies using gin(name gin_trgm_ops);
create index on companies(org_id, domain);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  first_name text not null,
  last_name text,
  full_name text generated always as (trim(first_name || ' ' || coalesce(last_name,''))) stored,
  job_title text,
  email citext,
  emails jsonb not null default '[]',
  phone text, mobile text, whatsapp text,
  phones jsonb not null default '[]',
  preferred_channel text check (preferred_channel in ('email','phone','whatsapp','linkedin','meeting')),
  decision_role text check (decision_role in ('decision_maker','influencer','champion','user','gatekeeper','finance','other')),
  country text, city text, linkedin_url text,
  owner_id uuid references users(id) on delete set null,
  consent_status text not null default 'unknown' check (consent_status in ('unknown','granted','denied','unsubscribed')),
  marketing_opt_in boolean not null default false,
  notes text,
  tags text[] not null default '{}',
  custom jsonb not null default '{}',
  import_batch_id uuid references import_batches(id) on delete set null,
  archived_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('simple', coalesce(first_name,'')||' '||coalesce(last_name,'')||' '||coalesce(email::text,'')||' '||coalesce(phone,'')||' '||coalesce(job_title,''))) stored
);
create index on contacts(org_id, company_id);
create index on contacts(org_id, owner_id);
create index on contacts(org_id, email);
create index on contacts using gin(search);

create table pipelines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  name text not null,
  position int not null,
  probability int not null default 0 check (probability between 0 and 100),
  color text not null default '#64748b',
  kind text not null default 'open' check (kind in ('open','won','lost','nurture')),
  required_fields text[] not null default '{}',
  max_days int,
  restricted_roles text[] not null default '{}', -- roles NOT allowed to move deals into this stage
  entry_criteria text,
  exit_criteria text,
  created_at timestamptz not null default now()
);
create index on pipeline_stages(pipeline_id, position);

create table leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  first_name text,
  last_name text,
  full_name text not null,
  job_title text,
  company_name text,
  email citext,
  phone text,
  whatsapp text,
  country text, city text,
  website text, linkedin_url text,
  source_id uuid references lead_sources(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  industry text,
  company_size text,
  estimated_budget numeric(14,2),
  services text[] not null default '{}',
  owner_id uuid references users(id) on delete set null,
  team_id uuid references teams(id) on delete set null,
  status text not null default 'new' check (status in ('new','unassigned','researching','attempting_contact','contacted','qualified','unqualified','converted','nurturing','do_not_contact')),
  score int not null default 0 check (score between 0 and 100),
  score_breakdown jsonb not null default '[]',
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  expected_value numeric(14,2),
  currency text not null default 'AED',
  timeframe text,
  authority text,
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz,
  first_response_due_at timestamptz,
  first_contacted_at timestamptz,
  consent_status text not null default 'unknown' check (consent_status in ('unknown','granted','denied','unsubscribed')),
  tags text[] not null default '{}',
  custom jsonb not null default '{}',
  notes text,
  converted_at timestamptz,
  converted_contact_id uuid references contacts(id) on delete set null,
  converted_company_id uuid references companies(id) on delete set null,
  converted_opportunity_id uuid,
  import_batch_id uuid references import_batches(id) on delete set null,
  archived_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('simple', coalesce(full_name,'')||' '||coalesce(company_name,'')||' '||coalesce(email::text,'')||' '||coalesce(phone,'')||' '||coalesce(city,'')||' '||coalesce(country,''))) stored
);
create index on leads(org_id, owner_id);
create index on leads(org_id, status);
create index on leads(org_id, email);
create index on leads(org_id, phone);
create index on leads(org_id, created_at desc);
create index on leads using gin(search);
create index on leads using gin(tags);

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  company_id uuid references companies(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  owner_id uuid references users(id) on delete set null,
  pipeline_id uuid not null references pipelines(id),
  stage_id uuid not null references pipeline_stages(id),
  value numeric(14,2) not null default 0,
  currency text not null default 'AED',
  probability int not null default 0,
  weighted_value numeric(14,2) generated always as (round(value * probability / 100.0, 2)) stored,
  expected_close_date date,
  services text[] not null default '{}',
  source_id uuid references lead_sources(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  competitors text,
  decision_makers text,
  pain_points text,
  proposed_solution text,
  next_action text,
  next_action_date date,
  risk_level text not null default 'low' check (risk_level in ('low','medium','high')),
  forecast_category text not null default 'pipeline' check (forecast_category in ('pipeline','best_case','commit','closed_won','closed_lost')),
  status text not null default 'open' check (status in ('open','won','lost')),
  lost_reason text,
  lost_notes text,
  won_at timestamptz,
  closed_at timestamptz,
  value_locked boolean not null default false,
  discount_pct numeric(5,2) not null default 0,
  stage_entered_at timestamptz not null default now(),
  last_activity_at timestamptz,
  tags text[] not null default '{}',
  custom jsonb not null default '{}',
  archived_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('simple', coalesce(name,'')||' '||coalesce(next_action,''))) stored
);
alter table leads add constraint leads_converted_opp_fk foreign key (converted_opportunity_id) references opportunities(id) on delete set null;
create index on opportunities(org_id, owner_id);
create index on opportunities(org_id, pipeline_id, stage_id);
create index on opportunities(org_id, status);
create index on opportunities using gin(search);

create table opportunity_stage_history (
  id bigserial primary key,
  org_id uuid not null references organisations(id) on delete cascade,
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  from_stage_id uuid references pipeline_stages(id) on delete set null,
  to_stage_id uuid references pipeline_stages(id) on delete set null,
  from_probability int, to_probability int,
  user_id uuid references users(id),
  at timestamptz not null default now()
);
create index on opportunity_stage_history(opportunity_id);

create table handovers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  opportunity_id uuid not null unique references opportunities(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  services text[] not null default '{}',
  deliverables text,
  commercial_value numeric(14,2) not null,
  currency text not null,
  payment_terms text,
  client_expectations text,
  commitments text,
  assets text,
  stakeholders text,
  risks text,
  deadlines text,
  sales_notes text,
  delivery_owner_id uuid references users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','accepted','in_onboarding','complete')),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  type text not null check (type in ('call','email','whatsapp','meeting','video_call','note','follow_up','site_visit','proposal','status_change')),
  subject text not null,
  body text,
  outcome text,
  direction text check (direction in ('inbound','outbound')),
  duration_min int,
  occurred_at timestamptz not null default now(),
  owner_id uuid references users(id) on delete set null,
  participants jsonb not null default '[]',
  lead_id uuid references leads(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete cascade,
  next_action text,
  attachments jsonb not null default '[]',
  created_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('simple', coalesce(subject,'')||' '||coalesce(body,''))) stored
);
create index on activities(org_id, occurred_at desc);
create index on activities(lead_id); create index on activities(contact_id);
create index on activities(company_id); create index on activities(opportunity_id);
create index on activities using gin(search);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  title text not null,
  description text,
  owner_id uuid references users(id) on delete set null,
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  due_at timestamptz,
  reminder_at timestamptz,
  status text not null default 'todo' check (status in ('todo','in_progress','waiting','completed','cancelled')),
  outcome text,
  recurrence text check (recurrence in ('daily','weekly','monthly')),
  checklist jsonb not null default '[]',
  lead_id uuid references leads(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete cascade,
  handover_id uuid references handovers(id) on delete cascade,
  completed_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('simple', coalesce(title,'')||' '||coalesce(description,''))) stored
);
create index on tasks(org_id, owner_id, status);
create index on tasks(org_id, due_at);
create index on tasks using gin(search);

create table timeline_events (
  id bigserial primary key,
  org_id uuid not null references organisations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  event_type text not null,
  summary text not null,
  data jsonb not null default '{}',
  actor_id uuid references users(id) on delete set null,
  at timestamptz not null default now()
);
create index on timeline_events(org_id, entity_type, entity_id, at desc);

create table audit_logs (
  id bigserial primary key,
  org_id uuid references organisations(id) on delete cascade,
  actor_id uuid references users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  changes jsonb not null default '{}',
  ip text,
  at timestamptz not null default now()
);
create index on audit_logs(org_id, at desc);
create index on audit_logs(org_id, entity_type, entity_id);

create table events (
  id bigserial primary key,
  org_id uuid not null references organisations(id) on delete cascade,
  type text not null,
  entity_type text, entity_id uuid,
  actor_id uuid references users(id) on delete set null,
  payload jsonb not null default '{}',
  occurred_at timestamptz not null default now(),
  processed_at timestamptz
);
create index on events(processed_at) where processed_at is null;

create table notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications(user_id, read_at, created_at desc);

create table saved_views (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  entity text not null,
  name text not null,
  filters jsonb not null default '{}',
  is_shared boolean not null default false,
  created_at timestamptz not null default now()
);

create table recent_records (
  org_id uuid not null references organisations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  label text not null,
  viewed_at timestamptz not null default now(),
  primary key (org_id, user_id, entity_type, entity_id)
);

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{leads:read,leads:write}',
  created_by uuid references users(id),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table idempotency_keys (
  org_id uuid not null references organisations(id) on delete cascade,
  key text not null,
  response jsonb not null,
  status int not null,
  created_at timestamptz not null default now(),
  primary key (org_id, key)
);

create table assignment_state (
  org_id uuid primary key references organisations(id) on delete cascade,
  last_user_id uuid,
  counter bigint not null default 0
);

alter table users add column must_change_password boolean not null default false;
