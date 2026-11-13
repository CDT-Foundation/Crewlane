-- Crewlane security layer: database roles, row-level security, cross-tenant
-- reference checks, maker-checker enforcement and an append-only audit log.
-- Runs as the schema owner. The web app connects as `crewlane_app` and the
-- event worker as `crewlane_worker`; neither owns any table.

-- ------------------------------------------------------------------ roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crewlane_app') THEN
    CREATE ROLE crewlane_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crewlane_worker') THEN
    CREATE ROLE crewlane_worker NOLOGIN;
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO crewlane_app, crewlane_worker;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO crewlane_app, crewlane_worker;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crewlane_app, crewlane_worker;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crewlane_app, crewlane_worker;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO crewlane_app, crewlane_worker;
--> statement-breakpoint
-- The audit log is append-only for runtime roles.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM crewlane_app, crewlane_worker;
--> statement-breakpoint

-- ----------------------------------------------------- tenant context
-- The app sets `app.tenant_id` with set_config(..., true) at the start of
-- every transaction. When it is missing, this returns NULL and every
-- policy below matches zero rows (fail closed).
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
$$;
--> statement-breakpoint

-- ------------------------------------------------- row-level security
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'org_units', 'job_grades', 'employees', 'memberships', 'roles',
    'membership_roles', 'workflows', 'approval_requests', 'approval_actions',
    'letter_templates', 'letters', 'preboarding_invites', 'audit_log',
    'outbox_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant()) '
      'WITH CHECK (tenant_id = app_current_tenant())', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- The worker claims pending events across all tenants, then sets the tenant
-- context before running each handler.
CREATE POLICY worker_claim ON outbox_events TO crewlane_worker USING (true) WITH CHECK (true);
--> statement-breakpoint

-- ------------------------------------------- cross-tenant references
-- Foreign key checks bypass RLS, so a UUID from another tenant would pass a
-- plain FK. This trigger checks that every referenced row has the same
-- tenant_id. Arguments are (column, table) pairs.
CREATE OR REPLACE FUNCTION assert_same_tenant_refs() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  i int;
  col text;
  tbl text;
  val uuid;
  ok boolean;
BEGIN
  FOR i IN 0..(TG_NARGS / 2 - 1) LOOP
    col := TG_ARGV[i * 2];
    tbl := TG_ARGV[i * 2 + 1];
    EXECUTE format('SELECT ($1).%I::uuid', col) INTO val USING NEW;
    IF val IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND tenant_id = $2)', tbl)
        INTO ok USING val, NEW.tenant_id;
      IF NOT ok THEN
        RAISE EXCEPTION 'cross-tenant reference rejected: %.% -> %', TG_TABLE_NAME, col, tbl
          USING ERRCODE = '23503';
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER employees_same_tenant BEFORE INSERT OR UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs(
    'org_unit_id', 'org_units', 'job_grade_id', 'job_grades',
    'manager_id', 'employees', 'dotted_manager_id', 'employees');
--> statement-breakpoint
CREATE TRIGGER org_units_same_tenant BEFORE INSERT OR UPDATE ON org_units
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs('parent_id', 'org_units');
--> statement-breakpoint
CREATE TRIGGER memberships_same_tenant BEFORE INSERT OR UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs('employee_id', 'employees');
--> statement-breakpoint
CREATE TRIGGER membership_roles_same_tenant BEFORE INSERT OR UPDATE ON membership_roles
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs(
    'membership_id', 'memberships', 'role_id', 'roles');
--> statement-breakpoint
CREATE TRIGGER approval_requests_same_tenant BEFORE INSERT OR UPDATE ON approval_requests
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs('workflow_id', 'workflows');
--> statement-breakpoint
CREATE TRIGGER approval_actions_same_tenant BEFORE INSERT OR UPDATE ON approval_actions
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs('request_id', 'approval_requests');
--> statement-breakpoint
CREATE TRIGGER letters_same_tenant BEFORE INSERT OR UPDATE ON letters
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs(
    'employee_id', 'employees', 'template_id', 'letter_templates');
--> statement-breakpoint
CREATE TRIGGER preboarding_same_tenant BEFORE INSERT OR UPDATE ON preboarding_invites
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs('employee_id', 'employees');
--> statement-breakpoint

-- ------------------------------------------------------ maker-checker
-- Enforced in the database as well as in the app: whoever raised a
-- maker-checker request can never record a decision on it.
CREATE OR REPLACE FUNCTION approval_actions_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  req record;
BEGIN
  SELECT requested_by, maker_checker, status, current_step INTO req
  FROM approval_requests WHERE id = NEW.request_id;
  IF req IS NULL THEN
    RAISE EXCEPTION 'approval request not found';
  END IF;
  IF req.status <> 'pending' THEN
    RAISE EXCEPTION 'approval request is no longer pending' USING ERRCODE = '55000';
  END IF;
  IF NEW.step <> req.current_step THEN
    RAISE EXCEPTION 'decision is for step %, current step is %', NEW.step, req.current_step
      USING ERRCODE = '55000';
  END IF;
  IF req.maker_checker AND req.requested_by = NEW.actor_user_id THEN
    RAISE EXCEPTION 'maker-checker: the requester cannot approve their own request'
      USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM approval_actions
    WHERE request_id = NEW.request_id AND actor_user_id = NEW.actor_user_id AND req.maker_checker
  ) THEN
    RAISE EXCEPTION 'maker-checker: each step needs a different officer' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER approval_actions_guard BEFORE INSERT ON approval_actions
  FOR EACH ROW EXECUTE FUNCTION approval_actions_guard();
--> statement-breakpoint

-- ------------------------------------------------ append-only audit log
CREATE OR REPLACE FUNCTION audit_row_hash(
  prev text, tenant uuid, actor text, action text, entity_type text,
  entity_id text, ip text, before jsonb, after jsonb, created_at timestamptz, seq bigint
) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT encode(sha256(convert_to(concat_ws('|',
    coalesce(prev, ''), tenant::text, seq::text, coalesce(actor, ''), action, entity_type,
    coalesce(entity_id, ''), coalesce(ip, ''), coalesce(before::text, ''),
    coalesce(after::text, ''),
    to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
  ), 'UTF8')), 'hex')
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_log_chain() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  last_hash text;
  last_seq bigint;
BEGIN
  -- Serialise appends per tenant so the chain never forks.
  PERFORM pg_advisory_xact_lock(hashtextextended('audit:' || NEW.tenant_id::text, 0));
  SELECT hash, seq INTO last_hash, last_seq
  FROM audit_log WHERE tenant_id = NEW.tenant_id ORDER BY seq DESC LIMIT 1;
  NEW.created_at := coalesce(NEW.created_at, now());
  NEW.seq := coalesce(last_seq, 0) + 1;
  NEW.prev_hash := last_hash;
  NEW.hash := audit_row_hash(last_hash, NEW.tenant_id, NEW.actor_user_id, NEW.action,
    NEW.entity_type, NEW.entity_id, NEW.ip, NEW.before, NEW.after, NEW.created_at, NEW.seq);
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER audit_log_chain BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_chain();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_log_block_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = '42501';
END $$;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_block_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_block_mutation();
--> statement-breakpoint
-- Recomputes the current tenant's chain. Returns how many rows were checked
-- and the seq of the first row that does not match (NULL when intact).
CREATE OR REPLACE FUNCTION audit_verify_chain()
RETURNS TABLE (checked bigint, first_broken_seq bigint)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  r record;
  prev text := NULL;
  n bigint := 0;
BEGIN
  FOR r IN SELECT * FROM audit_log WHERE tenant_id = app_current_tenant() ORDER BY seq LOOP
    n := n + 1;
    IF r.prev_hash IS DISTINCT FROM prev
       OR r.hash IS DISTINCT FROM audit_row_hash(prev, r.tenant_id, r.actor_user_id, r.action,
            r.entity_type, r.entity_id, r.ip, r.before, r.after, r.created_at, r.seq) THEN
      checked := n;
      first_broken_seq := r.seq;
      RETURN NEXT;
      RETURN;
    END IF;
    prev := r.hash;
  END LOOP;
  checked := n;
  first_broken_seq := NULL;
  RETURN NEXT;
END $$;
