CREATE TYPE "public"."asset_event_type" AS ENUM('created', 'assigned', 'returned', 'repair_out', 'repair_in', 'lost', 'disposed', 'gate_out', 'gate_in', 'discovered', 'updated');--> statement-breakpoint
CREATE TYPE "public"."asset_request_status" AS ENUM('pending_approval', 'approved', 'rejected', 'awaiting_stock', 'fulfilled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('in_stock', 'assigned', 'in_repair', 'lost', 'disposed');--> statement-breakpoint
CREATE TYPE "public"."depreciation_method" AS ENUM('straight_line', 'written_down_value');--> statement-breakpoint
CREATE TYPE "public"."gate_pass_status" AS ENUM('approved', 'out', 'returned', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."integration_provider" AS ENUM('google_workspace', 'microsoft_365', 'smtp', 'inbound_webhook', 'device_agent', 'intune');--> statement-breakpoint
CREATE TYPE "public"."po_status" AS ENUM('draft', 'pending_approval', 'issued', 'partially_received', 'received', 'cancelled', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."ticket_channel" AS ENUM('portal', 'email', 'teams', 'slack', 'whatsapp', 'kiosk', 'system');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('p1', 'p2', 'p3', 'p4');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('new', 'open', 'in_progress', 'waiting', 'resolved', 'closed');--> statement-breakpoint
CREATE TABLE "agent_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "asset_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"method" "depreciation_method" DEFAULT 'straight_line' NOT NULL,
	"useful_life_months" integer DEFAULT 36 NOT NULL,
	"wdv_rate" numeric(5, 2) DEFAULT '25' NOT NULL,
	"it_managed" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"type" "asset_event_type" NOT NULL,
	"employee_id" uuid,
	"actor_user_id" text,
	"condition" text,
	"signature_name" text,
	"signature_hash" text,
	"notes" text,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_request_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"estimated_unit_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"fulfilled_qty" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"for_employee_id" uuid NOT NULL,
	"requested_by" text,
	"reason" text,
	"source" text DEFAULT 'self_service' NOT NULL,
	"status" "asset_request_status" DEFAULT 'pending_approval' NOT NULL,
	"estimated_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"approval_request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"make" text,
	"model" text,
	"serial_no" text,
	"rfid" text,
	"status" "asset_status" DEFAULT 'in_stock' NOT NULL,
	"condition" text DEFAULT 'new' NOT NULL,
	"location_unit_id" uuid,
	"custodian_employee_id" uuid,
	"purchase_date" date,
	"purchase_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"salvage_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" text NOT NULL,
	"vendor_id" uuid,
	"warranty_until" date,
	"po_line_id" uuid,
	"specs" jsonb,
	"software" jsonb,
	"last_seen_at" timestamp with time zone,
	"notes" text,
	"disposed_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clearance_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"clearance_id" uuid NOT NULL,
	"type" text NOT NULL,
	"ref_id" uuid,
	"description" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"deduction_id" uuid,
	"resolved_by" text,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "clearances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"settlement_blocked" boolean DEFAULT true NOT NULL,
	"exit_date" date,
	"override_reason" text,
	"cleared_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delegations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"delegate_employee_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"reason" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment_kits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_grade_id" uuid,
	"name" text NOT NULL,
	"items" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gate_passes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"type" text NOT NULL,
	"asset_id" uuid,
	"description" text NOT NULL,
	"carrier_name" text NOT NULL,
	"carrier_employee_id" uuid,
	"destination" text NOT NULL,
	"reason" text,
	"expected_return_on" date,
	"status" "gate_pass_status" DEFAULT 'approved' NOT NULL,
	"token_hash" text NOT NULL,
	"issued_by" text,
	"out_at" timestamp with time zone,
	"out_by" text,
	"in_at" timestamp with time zone,
	"in_by" text,
	"overdue_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goods_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"po_id" uuid NOT NULL,
	"received_by" text,
	"notes" text,
	"lines" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text,
	"email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"groups" text[] DEFAULT '{}'::text[] NOT NULL,
	"last_action" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "licence_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"href" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_deductions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"source" text NOT NULL,
	"reference" text NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"applied_period" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "po_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"po_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost" numeric(14, 2) NOT NULL,
	"received_qty" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"vendor_id" uuid NOT NULL,
	"asset_request_id" uuid,
	"status" "po_status" DEFAULT 'draft' NOT NULL,
	"currency" text NOT NULL,
	"quote_ref" text,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"approval_request_id" uuid,
	"created_by" text,
	"issued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"priority" "ticket_priority" NOT NULL,
	"response_minutes" integer NOT NULL,
	"resolve_minutes" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "software_blocklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"pattern" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "software_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vendor_id" uuid,
	"product" text NOT NULL,
	"plan" text,
	"billing_cycle" text DEFAULT 'annual' NOT NULL,
	"seats_total" integer NOT NULL,
	"cost_per_seat" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"renewal_date" date NOT NULL,
	"auto_renew" boolean DEFAULT true NOT NULL,
	"cost_unit_id" uuid,
	"owner_employee_id" uuid,
	"reminders_sent" integer[] DEFAULT '{}'::int[] NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telecom_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"period" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"allowance" numeric(14, 2) NOT NULL,
	"excess" numeric(14, 2) NOT NULL,
	"status" text NOT NULL,
	"deduction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telecom_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"carrier" text NOT NULL,
	"plan" text,
	"employee_id" uuid,
	"monthly_allowance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cost_unit_id" uuid,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_counters" (
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "tenant_counters_tenant_id_key_pk" PRIMARY KEY("tenant_id","key")
);
--> statement-breakpoint
CREATE TABLE "tenant_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"mode" text DEFAULT 'simulator' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_ciphertext" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_user_id" text,
	"author_label" text,
	"body" text NOT NULL,
	"internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"priority" "ticket_priority" DEFAULT 'p3' NOT NULL,
	"status" "ticket_status" DEFAULT 'new' NOT NULL,
	"channel" "ticket_channel" DEFAULT 'portal' NOT NULL,
	"requester_employee_id" uuid,
	"requester_contact" text,
	"assignee_employee_id" uuid,
	"delegated_from_employee_id" uuid,
	"asset_id" uuid,
	"response_due_at" timestamp with time zone,
	"resolve_due_at" timestamp with time zone,
	"first_response_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"breach_notified_at" timestamp with time zone,
	"csat" integer,
	"csat_comment" text,
	"external_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vendor_id" uuid,
	"subscription_id" uuid,
	"po_id" uuid,
	"invoice_no" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"issued_on" date NOT NULL,
	"due_on" date,
	"cost_unit_id" uuid,
	"file_key" text,
	"file_name" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"tax_no" text,
	"address" text,
	"rating" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_tokens" ADD CONSTRAINT "agent_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_categories" ADD CONSTRAINT "asset_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_request_lines" ADD CONSTRAINT "asset_request_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_request_lines" ADD CONSTRAINT "asset_request_lines_request_id_asset_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."asset_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_request_lines" ADD CONSTRAINT "asset_request_lines_category_id_asset_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."asset_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_requests" ADD CONSTRAINT "asset_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_requests" ADD CONSTRAINT "asset_requests_for_employee_id_employees_id_fk" FOREIGN KEY ("for_employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_requests" ADD CONSTRAINT "asset_requests_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_requests" ADD CONSTRAINT "asset_requests_approval_request_id_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_category_id_asset_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."asset_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_location_unit_id_org_units_id_fk" FOREIGN KEY ("location_unit_id") REFERENCES "public"."org_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_custodian_employee_id_employees_id_fk" FOREIGN KEY ("custodian_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearance_items" ADD CONSTRAINT "clearance_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearance_items" ADD CONSTRAINT "clearance_items_clearance_id_clearances_id_fk" FOREIGN KEY ("clearance_id") REFERENCES "public"."clearances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearance_items" ADD CONSTRAINT "clearance_items_deduction_id_payroll_deductions_id_fk" FOREIGN KEY ("deduction_id") REFERENCES "public"."payroll_deductions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearance_items" ADD CONSTRAINT "clearance_items_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearances" ADD CONSTRAINT "clearances_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearances" ADD CONSTRAINT "clearances_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_delegate_employee_id_employees_id_fk" FOREIGN KEY ("delegate_employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_kits" ADD CONSTRAINT "equipment_kits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_carrier_employee_id_employees_id_fk" FOREIGN KEY ("carrier_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_issued_by_user_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_out_by_user_id_fk" FOREIGN KEY ("out_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_in_by_user_id_fk" FOREIGN KEY ("in_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_received_by_user_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_accounts" ADD CONSTRAINT "identity_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_accounts" ADD CONSTRAINT "identity_accounts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licence_assignments" ADD CONSTRAINT "licence_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licence_assignments" ADD CONSTRAINT "licence_assignments_subscription_id_software_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."software_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licence_assignments" ADD CONSTRAINT "licence_assignments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_deductions" ADD CONSTRAINT "payroll_deductions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_deductions" ADD CONSTRAINT "payroll_deductions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_deductions" ADD CONSTRAINT "payroll_deductions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_lines" ADD CONSTRAINT "po_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_lines" ADD CONSTRAINT "po_lines_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_lines" ADD CONSTRAINT "po_lines_category_id_asset_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."asset_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_asset_request_id_asset_requests_id_fk" FOREIGN KEY ("asset_request_id") REFERENCES "public"."asset_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approval_request_id_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "software_blocklist" ADD CONSTRAINT "software_blocklist_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "software_subscriptions" ADD CONSTRAINT "software_subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "software_subscriptions" ADD CONSTRAINT "software_subscriptions_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "software_subscriptions" ADD CONSTRAINT "software_subscriptions_cost_unit_id_org_units_id_fk" FOREIGN KEY ("cost_unit_id") REFERENCES "public"."org_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "software_subscriptions" ADD CONSTRAINT "software_subscriptions_owner_employee_id_employees_id_fk" FOREIGN KEY ("owner_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telecom_bills" ADD CONSTRAINT "telecom_bills_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telecom_bills" ADD CONSTRAINT "telecom_bills_line_id_telecom_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."telecom_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telecom_bills" ADD CONSTRAINT "telecom_bills_deduction_id_payroll_deductions_id_fk" FOREIGN KEY ("deduction_id") REFERENCES "public"."payroll_deductions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telecom_lines" ADD CONSTRAINT "telecom_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telecom_lines" ADD CONSTRAINT "telecom_lines_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telecom_lines" ADD CONSTRAINT "telecom_lines_cost_unit_id_org_units_id_fk" FOREIGN KEY ("cost_unit_id") REFERENCES "public"."org_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_counters" ADD CONSTRAINT "tenant_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_integrations" ADD CONSTRAINT "tenant_integrations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_requester_employee_id_employees_id_fk" FOREIGN KEY ("requester_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_employee_id_employees_id_fk" FOREIGN KEY ("assignee_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_delegated_from_employee_id_employees_id_fk" FOREIGN KEY ("delegated_from_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_subscription_id_software_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."software_subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_cost_unit_id_org_units_id_fk" FOREIGN KEY ("cost_unit_id") REFERENCES "public"."org_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_categories_code_uq" ON "asset_categories" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "asset_events_asset_idx" ON "asset_events" USING btree ("tenant_id","asset_id");--> statement-breakpoint
CREATE INDEX "asset_events_request_idx" ON "asset_events" USING btree ("tenant_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_tag_uq" ON "assets" USING btree ("tenant_id","tag");--> statement-breakpoint
CREATE INDEX "assets_serial_idx" ON "assets" USING btree ("tenant_id","serial_no");--> statement-breakpoint
CREATE INDEX "assets_custodian_idx" ON "assets" USING btree ("tenant_id","custodian_employee_id");--> statement-breakpoint
CREATE INDEX "clearance_items_idx" ON "clearance_items" USING btree ("tenant_id","clearance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clearances_employee_uq" ON "clearances" USING btree ("tenant_id","employee_id");--> statement-breakpoint
CREATE INDEX "delegations_active_idx" ON "delegations" USING btree ("tenant_id","employee_id","starts_on","ends_on");--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_kits_grade_uq" ON "equipment_kits" USING btree ("tenant_id","job_grade_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gate_passes_token_uq" ON "gate_passes" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "gate_passes_status_idx" ON "gate_passes" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_accounts_uq" ON "identity_accounts" USING btree ("tenant_id","provider","employee_id");--> statement-breakpoint
CREATE INDEX "licence_assignments_sub_idx" ON "licence_assignments" USING btree ("tenant_id","subscription_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("tenant_id","user_id","read_at");--> statement-breakpoint
CREATE INDEX "payroll_deductions_emp_idx" ON "payroll_deductions" USING btree ("tenant_id","employee_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "sla_policies_uq" ON "sla_policies" USING btree ("tenant_id","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "software_blocklist_uq" ON "software_blocklist" USING btree ("tenant_id","pattern");--> statement-breakpoint
CREATE UNIQUE INDEX "telecom_bills_uq" ON "telecom_bills" USING btree ("tenant_id","line_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "telecom_lines_number_uq" ON "telecom_lines" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_integrations_uq" ON "tenant_integrations" USING btree ("tenant_id","provider");--> statement-breakpoint
CREATE INDEX "ticket_comments_ticket_idx" ON "ticket_comments" USING btree ("tenant_id","ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_number_uq" ON "tickets" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE INDEX "tickets_status_idx" ON "tickets" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "tickets_assignee_idx" ON "tickets" USING btree ("tenant_id","assignee_employee_id");