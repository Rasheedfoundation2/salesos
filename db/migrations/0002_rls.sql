-- Tenant context, row-level security, audit triggers

create or replace function app.org_id() returns uuid language sql stable as
$$ select nullif(current_setting('app.org_id', true), '')::uuid $$;
create or replace function app.user_id() returns uuid language sql stable as
$$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

-- Role is resolved from the database, never trusted from the application.
create or replace function app.member_role() returns text language sql stable security definer set search_path = public as $$
  select m.role from memberships m
  join organisations o on o.id = m.org_id and o.status = 'active'
  join users u on u.id = m.user_id and u.disabled_at is null
  where m.org_id = app.org_id() and m.user_id = app.user_id() and m.status = 'active'
$$;
create or replace function app.in_org(p_org uuid) returns boolean language sql stable as
$$ select p_org = app.org_id() and app.member_role() is not null $$;
create or replace function app.can_write() returns boolean language sql stable as
$$ select coalesce(app.member_role() <> 'viewer', false) $$;
create or replace function app.is_admin() returns boolean language sql stable as
$$ select coalesce(app.member_role() in ('owner','admin'), false) $$;
create or replace function app.is_manager() returns boolean language sql stable as
$$ select coalesce(app.member_role() in ('owner','admin','manager'), false) $$;

-- Record ownership scope. Sales reps see their own records (or their team's, if the org enables team visibility).
create or replace function app.sees_owner(p_owner uuid) returns boolean language sql stable security definer set search_path = public as $$
  select case
    when app.member_role() is null then false
    when app.member_role() <> 'rep' then true
    when p_owner = app.user_id() then true
    when (select coalesce(settings->>'rep_visibility','own') from organisations where id = app.org_id()) = 'team'
      then exists (select 1 from memberships me join memberships other on other.team_id = me.team_id and other.org_id = me.org_id
                   where me.org_id = app.org_id() and me.user_id = app.user_id() and other.user_id = p_owner and me.team_id is not null)
    else false end
$$;
create or replace function app.can_edit_owned(p_owner uuid) returns boolean language sql stable as $$
  select app.can_write() and (
    app.member_role() in ('owner','admin','manager','marketing')
    or (app.member_role() = 'rep' and (p_owner = app.user_id() or p_owner is null))
    or (app.member_role() = 'finance' and false))
$$;
create or replace function app.is_org_user(p_user uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where org_id = app.org_id() and user_id = p_user) and app.member_role() is not null
$$;

-- updated_at
create or replace function app.touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- Append-only audit
create or replace function app.block_mutation() returns trigger language plpgsql as $$
begin raise exception 'audit_logs is append-only'; end $$;
create trigger audit_logs_append_only before update or delete on audit_logs for each row execute function app.block_mutation();
create trigger audit_logs_no_truncate before truncate on audit_logs for each statement execute function app.block_mutation();

-- Field-level change history captured by the database for core CRM tables
create or replace function app.audit_row() returns trigger language plpgsql security definer set search_path = public as $$
declare diff jsonb := '{}'; k text; skip text[] := array['updated_at','search','full_name','weighted_value'];
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(to_jsonb(new)) loop
      if not (k = any(skip)) and (to_jsonb(old)->k) is distinct from (to_jsonb(new)->k) then
        diff := diff || jsonb_build_object(k, jsonb_build_array(to_jsonb(old)->k, to_jsonb(new)->k));
      end if;
    end loop;
    if diff = '{}' then return new; end if;
    insert into audit_logs(org_id, actor_id, action, entity_type, entity_id, changes)
    values (new.org_id, app.user_id(), 'update', tg_table_name, new.id, diff);
  elsif tg_op = 'INSERT' then
    insert into audit_logs(org_id, actor_id, action, entity_type, entity_id, changes)
    values (new.org_id, app.user_id(), 'create', tg_table_name, new.id, '{}');
  elsif tg_op = 'DELETE' then
    insert into audit_logs(org_id, actor_id, action, entity_type, entity_id, changes)
    values (old.org_id, app.user_id(), 'delete', tg_table_name, old.id, '{}');
    return old;
  end if;
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['organisations','users','memberships','companies','contacts','leads','opportunities','handovers','tasks'] loop
    execute format('create trigger %I_touch before update on %I for each row execute function app.touch()', t, t);
  end loop;
  foreach t in array array['companies','contacts','leads','opportunities','tasks','memberships','handovers','pipeline_stages','api_keys'] loop
    execute format('create trigger %I_audit after insert or update or delete on %I for each row execute function app.audit_row()', t, t);
  end loop;
end $$;

-- ───────── Grants ─────────
grant usage on schema public to salesos_app, salesos_system;
grant select on plans to salesos_app;
grant select, insert, update, delete on all tables in schema public to salesos_app;
revoke delete on audit_logs, timeline_events, login_history from salesos_app;
grant usage, select on all sequences in schema public to salesos_app;
grant all on all tables in schema public to salesos_system;
grant usage, select on all sequences in schema public to salesos_system;
grant execute on all functions in schema app to salesos_app, salesos_system;

-- ───────── RLS ─────────
do $$ declare t text; begin
  foreach t in array array['organisations','users','sessions','password_resets','login_history','email_outbox','teams','memberships','invitations',
    'lead_sources','campaigns','products','lost_reasons','fx_rates','import_batches','companies','contacts','pipelines','pipeline_stages',
    'leads','opportunities','opportunity_stage_history','handovers','activities','tasks','timeline_events','audit_logs','events',
    'notifications','saved_views','recent_records','api_keys','idempotency_keys','assignment_state'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;

-- organisations & users
create policy org_read on organisations for select using (app.in_org(id));
create policy org_update on organisations for update using (app.in_org(id) and app.is_admin()) with check (app.in_org(id) and app.is_admin());
create policy users_read on users for select using (id = app.user_id() or app.is_org_user(id));
create policy users_self_update on users for update using (id = app.user_id()) with check (id = app.user_id());
-- sessions, password_resets, login_history: system role only (no policies for salesos_app)
create policy outbox_insert on email_outbox for insert with check (app.in_org(org_id) and app.is_admin());

-- simple reference tables: every member reads; admins write
do $$ declare t text; begin
  foreach t in array array['teams','products','lost_reasons','fx_rates','pipelines','pipeline_stages'] loop
    execute format('create policy %I_read on %I for select using (app.in_org(org_id))', t, t);
    execute format('create policy %I_write on %I for all using (app.in_org(org_id) and app.is_admin()) with check (app.in_org(org_id) and app.is_admin())', t, t);
  end loop;
  foreach t in array array['lead_sources','campaigns'] loop
    execute format('create policy %I_read on %I for select using (app.in_org(org_id))', t, t);
    execute format('create policy %I_write on %I for all using (app.in_org(org_id) and (app.is_admin() or app.member_role() = ''marketing'')) with check (app.in_org(org_id) and (app.is_admin() or app.member_role() = ''marketing''))', t, t);
  end loop;
end $$;

-- memberships & invitations
create policy memberships_read on memberships for select using (app.in_org(org_id));
create policy memberships_admin on memberships for all using (app.in_org(org_id) and app.is_admin()) with check (app.in_org(org_id) and app.is_admin());
create policy invitations_admin on invitations for all using (app.in_org(org_id) and app.is_admin()) with check (app.in_org(org_id) and app.is_admin());

-- companies & contacts: all members read; edit own (reps) or all (managers+)
create policy companies_read on companies for select using (app.in_org(org_id));
create policy companies_insert on companies for insert with check (app.in_org(org_id) and app.can_write() and app.member_role() <> 'finance');
create policy companies_update on companies for update using (app.in_org(org_id) and app.can_edit_owned(owner_id)) with check (app.in_org(org_id));
create policy contacts_read on contacts for select using (app.in_org(org_id));
create policy contacts_insert on contacts for insert with check (app.in_org(org_id) and app.can_write() and app.member_role() <> 'finance');
create policy contacts_update on contacts for update using (app.in_org(org_id) and app.can_edit_owned(owner_id)) with check (app.in_org(org_id));

-- leads & opportunities: ownership-scoped
create policy leads_read on leads for select using (app.in_org(org_id) and app.sees_owner(owner_id) and app.member_role() <> 'finance');
create policy leads_insert on leads for insert with check (app.in_org(org_id) and app.can_write() and app.member_role() in ('owner','admin','manager','rep','marketing'));
create policy leads_update on leads for update using (app.in_org(org_id) and app.sees_owner(owner_id) and app.can_edit_owned(owner_id)) with check (app.in_org(org_id));
create policy opps_read on opportunities for select using (app.in_org(org_id) and app.sees_owner(owner_id));
create policy opps_insert on opportunities for insert with check (app.in_org(org_id) and app.can_write() and app.member_role() in ('owner','admin','manager','rep'));
create policy opps_update on opportunities for update using (app.in_org(org_id) and app.sees_owner(owner_id) and app.can_write() and app.member_role() in ('owner','admin','manager','rep')) with check (app.in_org(org_id));

-- history, handovers, timeline, events, import batches
create policy osh_read on opportunity_stage_history for select using (app.in_org(org_id));
create policy osh_insert on opportunity_stage_history for insert with check (app.in_org(org_id) and app.can_write());
create policy handovers_read on handovers for select using (app.in_org(org_id));
create policy handovers_write on handovers for insert with check (app.in_org(org_id) and app.can_write());
create policy handovers_update on handovers for update using (app.in_org(org_id) and app.can_write()) with check (app.in_org(org_id));
create policy timeline_read on timeline_events for select using (app.in_org(org_id));
create policy timeline_insert on timeline_events for insert with check (app.in_org(org_id));
create policy events_read on events for select using (app.in_org(org_id) and app.is_admin());
create policy events_insert on events for insert with check (app.in_org(org_id));
create policy imports_read on import_batches for select using (app.in_org(org_id));
create policy imports_write on import_batches for all using (app.in_org(org_id) and app.member_role() in ('owner','admin','manager','marketing')) with check (app.in_org(org_id) and app.member_role() in ('owner','admin','manager','marketing'));

-- activities & tasks: own, or attached to a record the user owns; managers+ see all
create policy activities_read on activities for select using (app.in_org(org_id) and (
  app.sees_owner(owner_id)
  or exists (select 1 from leads l where l.id = activities.lead_id and l.owner_id = app.user_id())
  or exists (select 1 from opportunities o where o.id = activities.opportunity_id and o.owner_id = app.user_id())));
create policy activities_insert on activities for insert with check (app.in_org(org_id) and app.can_write());
create policy activities_update on activities for update using (app.in_org(org_id) and app.can_write() and (owner_id = app.user_id() or app.is_manager())) with check (app.in_org(org_id));
create policy activities_delete on activities for delete using (app.in_org(org_id) and (owner_id = app.user_id() or app.is_manager()));
create policy tasks_read on tasks for select using (app.in_org(org_id) and (
  app.sees_owner(owner_id) or created_by = app.user_id()
  or exists (select 1 from leads l where l.id = tasks.lead_id and l.owner_id = app.user_id())
  or exists (select 1 from opportunities o where o.id = tasks.opportunity_id and o.owner_id = app.user_id())));
create policy tasks_insert on tasks for insert with check (app.in_org(org_id) and app.can_write());
create policy tasks_update on tasks for update using (app.in_org(org_id) and app.can_write() and (owner_id = app.user_id() or created_by = app.user_id() or app.is_manager())) with check (app.in_org(org_id));

-- audit: admins read; anyone in org may append (triggers run as definer)
create policy audit_read on audit_logs for select using (app.in_org(org_id) and app.is_admin());
create policy audit_insert on audit_logs for insert with check (app.in_org(org_id));

-- personal tables
create policy notif_own on notifications for select using (app.in_org(org_id) and user_id = app.user_id());
create policy notif_update on notifications for update using (app.in_org(org_id) and user_id = app.user_id()) with check (user_id = app.user_id());
create policy notif_insert on notifications for insert with check (app.in_org(org_id));
create policy views_read on saved_views for select using (app.in_org(org_id) and (user_id = app.user_id() or is_shared));
create policy views_write on saved_views for all using (app.in_org(org_id) and user_id = app.user_id()) with check (app.in_org(org_id) and user_id = app.user_id());
create policy recent_own on recent_records for all using (app.in_org(org_id) and user_id = app.user_id()) with check (app.in_org(org_id) and user_id = app.user_id());
create policy apikeys_admin on api_keys for all using (app.in_org(org_id) and app.is_admin()) with check (app.in_org(org_id) and app.is_admin());
create policy idem_all on idempotency_keys for all using (app.in_org(org_id)) with check (app.in_org(org_id));
create policy assign_all on assignment_state for all using (app.in_org(org_id)) with check (app.in_org(org_id));
