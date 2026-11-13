-- Phase 2 security: the same guarantees as 0001_security.sql for every new
-- table — forced row-level security, runtime-role grants and checks that
-- references never cross tenants.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO crewlane_app, crewlane_worker;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crewlane_app, crewlane_worker;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenant_counters', 'notifications', 'tenant_integrations', 'delegations', 'payroll_deductions',
    'asset_categories', 'vendors', 'assets', 'asset_events', 'equipment_kits',
    'asset_requests', 'asset_request_lines', 'purchase_orders', 'po_lines', 'goods_receipts',
    'gate_passes', 'sla_policies', 'tickets', 'ticket_comments', 'identity_accounts',
    'software_subscriptions', 'licence_assignments', 'vendor_invoices',
    'telecom_lines', 'telecom_bills', 'clearances', 'clearance_items',
    'agent_tokens', 'software_blocklist'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant()) '
      'WITH CHECK (tenant_id = app_current_tenant())', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- The scheduler in the worker scans tenants one at a time with the tenant
-- context set, so no cross-tenant policies are needed beyond the outbox.

CREATE TRIGGER delegations_same_tenant BEFORE INSERT OR UPDATE ON delegations
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs(
    'employee_id', 'employees', 'delegate_employee_id', 'employees');
--> statement-breakpoint
CREATE TRIGGER payroll_deductions_same_tenant BEFORE INSERT OR UPDATE ON payroll_deductions
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs('employee_id', 'employees');
--> statement-breakpoint
CREATE TRIGGER assets_same_tenant BEFORE INSERT OR UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs(
    'category_id', 'asset_categories', 'location_unit_id', 'org_units',
    'custodian_employee_id', 'employees', 'vendor_id', 'vendors', 'po_line_id', 'po_lines');
--> statement-breakpoint
CREATE TRIGGER asset_events_same_tenant BEFORE INSERT OR UPDATE ON asset_events
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs('asset_id', 'assets', 'employee_id', 'employees');
--> statement-breakpoint
CREATE TRIGGER equipment_kits_same_tenant BEFORE INSERT OR UPDATE ON equipment_kits
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs('job_grade_id', 'job_grades');
--> statement-breakpoint
CREATE TRIGGER asset_requests_same_tenant BEFORE INSERT OR UPDATE ON asset_requests
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs(
    'for_employee_id', 'employees', 'approval_request_id', 'approval_requests');
--> statement-breakpoint
CREATE TRIGGER asset_request_lines_same_tenant BEFORE INSERT OR UPDATE ON asset_request_lines
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs(
    'request_id', 'asset_requests', 'category_id', 'asset_categories');
--> statement-breakpoint
CREATE TRIGGER purchase_orders_same_tenant BEFORE INSERT OR UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs(
    'vendor_id', 'vendors', 'asset_request_id', 'asset_requests', 'approval_request_id', 'approval_requests');
--> statement-breakpoint
CREATE TRIGGER po_lines_same_tenant BEFORE INSERT OR UPDATE ON po_lines
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs('po_id', 'purchase_orders', 'category_id', 'asset_categories');
--> statement-breakpoint
CREATE TRIGGER goods_receipts_same_tenant BEFORE INSERT OR UPDATE ON goods_receipts
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs('po_id', 'purchase_orders');
--> statement-breakpoint
CREATE TRIGGER gate_passes_same_tenant BEFORE INSERT OR UPDATE ON gate_passes
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs('asset_id', 'assets', 'carrier_employee_id', 'employees');
--> statement-breakpoint
CREATE TRIGGER tickets_same_tenant BEFORE INSERT OR UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs(
    'requester_employee_id', 'employees', 'assignee_employee_id', 'employees',
    'delegated_from_employee_id', 'employees', 'asset_id', 'assets');
--> statement-breakpoint
CREATE TRIGGER ticket_comments_same_tenant BEFORE INSERT OR UPDATE ON ticket_comments
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs('ticket_id', 'tickets');
--> statement-breakpoint
CREATE TRIGGER identity_accounts_same_tenant BEFORE INSERT OR UPDATE ON identity_accounts
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs('employee_id', 'employees');
--> statement-breakpoint
CREATE TRIGGER software_subscriptions_same_tenant BEFORE INSERT OR UPDATE ON software_subscriptions
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs(
    'vendor_id', 'vendors', 'cost_unit_id', 'org_units', 'owner_employee_id', 'employees');
--> statement-breakpoint
CREATE TRIGGER licence_assignments_same_tenant BEFORE INSERT OR UPDATE ON licence_assignments
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs(
    'subscription_id', 'software_subscriptions', 'employee_id', 'employees');
--> statement-breakpoint
CREATE TRIGGER vendor_invoices_same_tenant BEFORE INSERT OR UPDATE ON vendor_invoices
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs(
    'vendor_id', 'vendors', 'subscription_id', 'software_subscriptions', 'po_id', 'purchase_orders',
    'cost_unit_id', 'org_units');
--> statement-breakpoint
CREATE TRIGGER telecom_lines_same_tenant BEFORE INSERT OR UPDATE ON telecom_lines
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs('employee_id', 'employees', 'cost_unit_id', 'org_units');
--> statement-breakpoint
CREATE TRIGGER telecom_bills_same_tenant BEFORE INSERT OR UPDATE ON telecom_bills
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs('line_id', 'telecom_lines', 'deduction_id', 'payroll_deductions');
--> statement-breakpoint
CREATE TRIGGER clearances_same_tenant BEFORE INSERT OR UPDATE ON clearances
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs('employee_id', 'employees');
--> statement-breakpoint
CREATE TRIGGER clearance_items_same_tenant BEFORE INSERT OR UPDATE ON clearance_items
  FOR EACH ROW EXECUTE FUNCTION assert_same_tenant_refs('clearance_id', 'clearances', 'deduction_id', 'payroll_deductions');
--> statement-breakpoint
-- Next value of a per-tenant counter, atomically. Runs with the caller's
-- rights, so RLS keeps it inside the current tenant.
CREATE OR REPLACE FUNCTION next_tenant_counter(counter_key text) RETURNS bigint
LANGUAGE sql VOLATILE AS $$
  INSERT INTO tenant_counters (tenant_id, key, value)
  VALUES (app_current_tenant(), counter_key, 1)
  ON CONFLICT (tenant_id, key) DO UPDATE SET value = tenant_counters.value + 1
  RETURNING value
$$;
