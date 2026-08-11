-- =========================================================================
-- MAHALAXMI ELECTRICALS PRODUCTION DATABASE SCHEMA
-- Generated automatically to match the remote Supabase DB state
-- Timestamp: 2026-08-07T08:12:17.754Z
-- =========================================================================

CREATE SCHEMA IF NOT EXISTS public;

-- ── ENUMS ────────────────────────────────────────────────────────────────
DROP TYPE IF EXISTS public.approval_mode CASCADE;
CREATE TYPE public.approval_mode AS ENUM ('architect_then_customer', 'customer_only');

DROP TYPE IF EXISTS public.assignment_role CASCADE;
CREATE TYPE public.assignment_role AS ENUM ('electrician', 'architect');

DROP TYPE IF EXISTS public.assignment_status CASCADE;
CREATE TYPE public.assignment_status AS ENUM ('active', 'removed', 'completed');

DROP TYPE IF EXISTS public.bid_status CASCADE;
CREATE TYPE public.bid_status AS ENUM ('submitted', 'shortlisted', 'accepted', 'rejected', 'withdrawn');

DROP TYPE IF EXISTS public.content_category CASCADE;
CREATE TYPE public.content_category AS ENUM ('electrical_tips', 'home_tips');

DROP TYPE IF EXISTS public.finance_application_status CASCADE;
CREATE TYPE public.finance_application_status AS ENUM ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'disbursed', 'closed');

DROP TYPE IF EXISTS public.installment_status CASCADE;
CREATE TYPE public.installment_status AS ENUM ('pending', 'paid', 'late', 'waived', 'cancelled');

DROP TYPE IF EXISTS public.inventory_stock_status CASCADE;
CREATE TYPE public.inventory_stock_status AS ENUM ('in_stock', 'out_of_stock', 'limited');

DROP TYPE IF EXISTS public.lead_status CASCADE;
CREATE TYPE public.lead_status AS ENUM ('new', 'contacted', 'quoted', 'sample_dispatched', 'won', 'lost');

DROP TYPE IF EXISTS public.ledger_account_type CASCADE;
CREATE TYPE public.ledger_account_type AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

DROP TYPE IF EXISTS public.ledger_entry_direction CASCADE;
CREATE TYPE public.ledger_entry_direction AS ENUM ('DEBIT', 'CREDIT');

DROP TYPE IF EXISTS public.marketplace_bid_status CASCADE;
CREATE TYPE public.marketplace_bid_status AS ENUM ('submitted', 'accepted', 'rejected', 'expired');

DROP TYPE IF EXISTS public.notification_type CASCADE;
CREATE TYPE public.notification_type AS ENUM ('general', 'approval_requested', 'approval_completed', 'substitute_suggested', 'substitute_response', 'bid_update', 'order_update', 'finance_update');

DROP TYPE IF EXISTS public.order_item_status CASCADE;
CREATE TYPE public.order_item_status AS ENUM ('draft_by_electrician', 'draft_by_architect', 'pending_architect_approval', 'pending_customer_approval', 'approved_pending_shop_confirmation', 'approved_pending_supply', 'partially_supplied', 'supplied', 'rejected_by_architect', 'rejected_by_customer', 'substitute_suggested', 'substitute_accepted', 'substitute_rejected', 'cancelled');

DROP TYPE IF EXISTS public.order_status CASCADE;
CREATE TYPE public.order_status AS ENUM ('draft', 'awaiting_approval', 'partially_approved', 'confirmed', 'processing', 'partially_supplied', 'supplied', 'cancelled');

DROP TYPE IF EXISTS public.product_request_status CASCADE;
CREATE TYPE public.product_request_status AS ENUM ('submitted', 'reviewing', 'matched', 'ordered', 'fulfilled', 'rejected');

DROP TYPE IF EXISTS public.referral_program_status CASCADE;
CREATE TYPE public.referral_program_status AS ENUM ('draft', 'active', 'paused', 'retired');

DROP TYPE IF EXISTS public.referral_reward_status CASCADE;
CREATE TYPE public.referral_reward_status AS ENUM ('pending', 'approved', 'credited', 'rejected', 'reversed');

DROP TYPE IF EXISTS public.requirement_source CASCADE;
CREATE TYPE public.requirement_source AS ENUM ('electrician', 'architect', 'admin', 'customer');

DROP TYPE IF EXISTS public.risk_band_type CASCADE;
CREATE TYPE public.risk_band_type AS ENUM ('LOW', 'MODERATE', 'HIGH', 'BLOCKED');

DROP TYPE IF EXISTS public.savings_plan_status CASCADE;
CREATE TYPE public.savings_plan_status AS ENUM ('draft', 'active', 'paused', 'retired');

DROP TYPE IF EXISTS public.savings_subscription_status CASCADE;
CREATE TYPE public.savings_subscription_status AS ENUM ('active', 'paused', 'completed', 'defaulted', 'cancelled');

DROP TYPE IF EXISTS public.site_status CASCADE;
CREATE TYPE public.site_status AS ENUM ('draft', 'open_for_bidding', 'assigned', 'in_progress', 'on_hold', 'completed', 'cancelled');

DROP TYPE IF EXISTS public.substitute_status CASCADE;
CREATE TYPE public.substitute_status AS ENUM ('suggested', 'accepted', 'rejected', 'expired');

DROP TYPE IF EXISTS public.tenant_membership_role CASCADE;
CREATE TYPE public.tenant_membership_role AS ENUM ('owner', 'admin', 'staff', 'customer', 'electrician', 'architect', 'supplier', 'pop_man', 'carpenter', 'painter', 'tiles_man', 'plumber');

DROP TYPE IF EXISTS public.tenant_status CASCADE;
CREATE TYPE public.tenant_status AS ENUM ('active', 'suspended', 'archived');

DROP TYPE IF EXISTS public.user_role CASCADE;
CREATE TYPE public.user_role AS ENUM ('admin', 'customer', 'electrician', 'architect', 'supplier', 'pop_man', 'carpenter', 'painter', 'tiles_man', 'plumber');

DROP TYPE IF EXISTS public.user_status CASCADE;
CREATE TYPE public.user_status AS ENUM ('active', 'inactive', 'blocked');

DROP TYPE IF EXISTS public.verification_status CASCADE;
CREATE TYPE public.verification_status AS ENUM ('pending', 'verified', 'rejected');

DROP TYPE IF EXISTS public.wallet_account_status CASCADE;
CREATE TYPE public.wallet_account_status AS ENUM ('active', 'frozen', 'closed');

DROP TYPE IF EXISTS public.wallet_entry_direction CASCADE;
CREATE TYPE public.wallet_entry_direction AS ENUM ('credit', 'debit');

DROP TYPE IF EXISTS public.wallet_entry_status CASCADE;
CREATE TYPE public.wallet_entry_status AS ENUM ('pending', 'posted', 'reversed', 'cancelled');

DROP TYPE IF EXISTS public.wallet_entry_type CASCADE;
CREATE TYPE public.wallet_entry_type AS ENUM ('manual_adjustment', 'referral_reward', 'cashback_reward', 'savings_bonus', 'savings_contribution', 'wallet_redemption', 'finance_disbursement', 'finance_repayment', 'reversal');

-- ── TABLES ───────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.audit_logs CASCADE;
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  actor_user_id UUID,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(100) NOT NULL,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  tenant_id UUID,
  CONSTRAINT audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT audit_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.bids CASCADE;
CREATE TABLE public.bids (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL,
  handyman_id UUID NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  estimated_days INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status public.marketplace_bid_status NOT NULL DEFAULT 'submitted'::marketplace_bid_status,
  CONSTRAINT bids_amount_check CHECK (amount > 0::numeric),
  CONSTRAINT bids_estimated_days_check CHECK (estimated_days > 0),
  CONSTRAINT bids_handyman_id_fkey FOREIGN KEY (handyman_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT bids_pkey PRIMARY KEY (id),
  CONSTRAINT bids_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT bids_task_id_handyman_id_key UNIQUE (task_id, handyman_id),
  CONSTRAINT uq_task_handyman_bid UNIQUE (task_id, handyman_id)
);

DROP TABLE IF EXISTS public.budget_trackers CASCADE;
CREATE TABLE public.budget_trackers (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL,
  initial_budget NUMERIC(14, 2) NOT NULL DEFAULT 0,
  revised_budget NUMERIC(14, 2) NOT NULL DEFAULT 0,
  approved_material_budget NUMERIC(14, 2) NOT NULL DEFAULT 0,
  actual_material_spend NUMERIC(14, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  tenant_id UUID,
  CONSTRAINT budget_trackers_actual_material_spend_check CHECK (actual_material_spend >= 0::numeric),
  CONSTRAINT budget_trackers_approved_material_budget_check CHECK (approved_material_budget >= 0::numeric),
  CONSTRAINT budget_trackers_initial_budget_check CHECK (initial_budget >= 0::numeric),
  CONSTRAINT budget_trackers_pkey PRIMARY KEY (id),
  CONSTRAINT budget_trackers_revised_budget_check CHECK (revised_budget >= 0::numeric),
  CONSTRAINT budget_trackers_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  CONSTRAINT budget_trackers_site_id_key UNIQUE (site_id),
  CONSTRAINT budget_trackers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.content_posts CASCADE;
CREATE TABLE public.content_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  category public.content_category NOT NULL,
  title VARCHAR(200) NOT NULL,
  slug VARCHAR(220) NOT NULL,
  summary TEXT,
  body TEXT NOT NULL,
  thumbnail_url TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  tenant_id UUID,
  CONSTRAINT content_posts_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT content_posts_pkey PRIMARY KEY (id),
  CONSTRAINT content_posts_slug_key UNIQUE (slug),
  CONSTRAINT content_posts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.contractor_risk_profiles CASCADE;
CREATE TABLE public.contractor_risk_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  trust_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  credit_limit NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  outstanding_credit NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  payment_history_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  repayment_consistency NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  dispute_count INTEGER NOT NULL DEFAULT 0,
  project_completion_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  risk_band public.risk_band_type NOT NULL DEFAULT 'BLOCKED'::risk_band_type,
  default_probability NUMERIC(5, 4) NOT NULL DEFAULT 1.0000,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT contractor_risk_profiles_credit_limit_check CHECK (credit_limit >= 0::numeric),
  CONSTRAINT contractor_risk_profiles_default_probability_check CHECK (default_probability >= 0::numeric AND default_probability <= 1::numeric),
  CONSTRAINT contractor_risk_profiles_dispute_count_check CHECK (dispute_count >= 0),
  CONSTRAINT contractor_risk_profiles_outstanding_credit_check CHECK (outstanding_credit >= 0::numeric),
  CONSTRAINT contractor_risk_profiles_payment_history_score_check CHECK (payment_history_score >= 0::numeric AND payment_history_score <= 100::numeric),
  CONSTRAINT contractor_risk_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT contractor_risk_profiles_project_completion_score_check CHECK (project_completion_score >= 0::numeric AND project_completion_score <= 100::numeric),
  CONSTRAINT contractor_risk_profiles_repayment_consistency_check CHECK (repayment_consistency >= 0::numeric AND repayment_consistency <= 100::numeric),
  CONSTRAINT contractor_risk_profiles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT contractor_risk_profiles_trust_score_check CHECK (trust_score >= 0::numeric AND trust_score <= 100::numeric),
  CONSTRAINT contractor_risk_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT contractor_risk_profiles_user_id_key UNIQUE (user_id)
);

DROP TABLE IF EXISTS public.contractor_subscription_plans CASCADE;
CREATE TABLE public.contractor_subscription_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  price NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  billing_cycle VARCHAR(20) NOT NULL DEFAULT 'MONTHLY'::character varying,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT contractor_subscription_plans_pkey PRIMARY KEY (id),
  CONSTRAINT contractor_subscription_plans_price_check CHECK (price >= 0::numeric),
  CONSTRAINT contractor_subscription_plans_tenant_id_code_key UNIQUE (tenant_id, code),
  CONSTRAINT contractor_subscription_plans_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.credit_limits CASCADE;
CREATE TABLE public.credit_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  contractor_id UUID NOT NULL,
  allocated_limit NUMERIC(14, 2) NOT NULL,
  available_limit NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  utilized_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT chk_allocated_vs_utilized CHECK (utilized_amount <= allocated_limit),
  CONSTRAINT credit_limits_allocated_limit_check CHECK (allocated_limit >= 0::numeric),
  CONSTRAINT credit_limits_available_limit_check CHECK (available_limit >= 0::numeric),
  CONSTRAINT credit_limits_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT credit_limits_pkey PRIMARY KEY (id),
  CONSTRAINT credit_limits_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT credit_limits_utilized_amount_check CHECK (utilized_amount >= 0::numeric)
);

DROP TABLE IF EXISTS public.credit_requests CASCADE;
CREATE TABLE public.credit_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  contractor_id UUID NOT NULL,
  site_id UUID,
  requested_amount NUMERIC(14, 2) NOT NULL,
  purpose TEXT,
  status public.finance_application_status NOT NULL DEFAULT 'draft'::finance_application_status,
  approved_amount NUMERIC(14, 2),
  advance_required_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  reviewer_id UUID,
  review_notes TEXT,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT credit_requests_advance_required_percentage_check CHECK (advance_required_percentage >= 0::numeric AND advance_required_percentage <= 100::numeric),
  CONSTRAINT credit_requests_approved_amount_check CHECK (approved_amount >= 0::numeric),
  CONSTRAINT credit_requests_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT credit_requests_pkey PRIMARY KEY (id),
  CONSTRAINT credit_requests_requested_amount_check CHECK (requested_amount > 0::numeric),
  CONSTRAINT credit_requests_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT credit_requests_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL,
  CONSTRAINT credit_requests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.escrow_accounts CASCADE;
CREATE TABLE public.escrow_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  site_order_id UUID NOT NULL,
  total_escrow_amount NUMERIC(14, 2) NOT NULL,
  locked_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  released_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  disputed_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  status public.finance_application_status NOT NULL DEFAULT 'draft'::finance_application_status,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT chk_escrow_totals CHECK ((locked_amount + released_amount + disputed_amount) <= total_escrow_amount),
  CONSTRAINT escrow_accounts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT escrow_accounts_disputed_amount_check CHECK (disputed_amount >= 0::numeric),
  CONSTRAINT escrow_accounts_locked_amount_check CHECK (locked_amount >= 0::numeric),
  CONSTRAINT escrow_accounts_pkey PRIMARY KEY (id),
  CONSTRAINT escrow_accounts_released_amount_check CHECK (released_amount >= 0::numeric),
  CONSTRAINT escrow_accounts_site_order_id_fkey FOREIGN KEY (site_order_id) REFERENCES site_orders(id) ON DELETE CASCADE,
  CONSTRAINT escrow_accounts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT escrow_accounts_total_escrow_amount_check CHECK (total_escrow_amount >= 0::numeric)
);

DROP TABLE IF EXISTS public.escrow_transactions CASCADE;
CREATE TABLE public.escrow_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  escrow_account_id UUID NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  type VARCHAR(30) NOT NULL,
  ledger_tx_id UUID,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT escrow_transactions_amount_check CHECK (amount > 0::numeric),
  CONSTRAINT escrow_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT escrow_transactions_escrow_account_id_fkey FOREIGN KEY (escrow_account_id) REFERENCES escrow_accounts(id) ON DELETE CASCADE,
  CONSTRAINT escrow_transactions_ledger_tx_id_fkey FOREIGN KEY (ledger_tx_id) REFERENCES ledger_transactions(id) ON DELETE SET NULL,
  CONSTRAINT escrow_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT escrow_transactions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.finance_applications CASCADE;
CREATE TABLE public.finance_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL,
  site_id UUID,
  application_number VARCHAR(40) NOT NULL,
  requested_amount NUMERIC(14, 2) NOT NULL,
  approved_amount NUMERIC(14, 2),
  tenure_months INTEGER,
  status public.finance_application_status NOT NULL DEFAULT 'draft'::finance_application_status,
  remarks TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  decided_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  tenant_id UUID,
  CONSTRAINT finance_applications_application_number_key UNIQUE (application_number),
  CONSTRAINT finance_applications_approved_amount_check CHECK (approved_amount IS NULL OR approved_amount >= 0::numeric),
  CONSTRAINT finance_applications_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT finance_applications_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT finance_applications_pkey PRIMARY KEY (id),
  CONSTRAINT finance_applications_requested_amount_check CHECK (requested_amount > 0::numeric),
  CONSTRAINT finance_applications_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL,
  CONSTRAINT finance_applications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT finance_applications_tenure_months_check CHECK (tenure_months IS NULL OR tenure_months > 0)
);

DROP TABLE IF EXISTS public.leads CASCADE;
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  requester_user_id UUID,
  product_id UUID,
  module VARCHAR(120) NOT NULL DEFAULT 'architectural_lighting_visualizer'::character varying,
  room_type VARCHAR(120),
  contact_name VARCHAR(180) NOT NULL,
  contact_phone VARCHAR(30),
  contact_email VARCHAR(255),
  notes TEXT,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status public.lead_status NOT NULL DEFAULT 'new'::lead_status,
  CONSTRAINT leads_pkey PRIMARY KEY (id),
  CONSTRAINT leads_product_id_fkey FOREIGN KEY (product_id) REFERENCES lighting_products(id) ON DELETE SET NULL,
  CONSTRAINT leads_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.ledger_accounts CASCADE;
CREATE TABLE public.ledger_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  account_number VARCHAR(60) NOT NULL,
  name VARCHAR(150) NOT NULL,
  type public.ledger_account_type NOT NULL,
  currency_code VARCHAR(10) NOT NULL DEFAULT 'INR'::character varying,
  balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  user_id UUID,
  site_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT ledger_accounts_pkey PRIMARY KEY (id),
  CONSTRAINT ledger_accounts_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL,
  CONSTRAINT ledger_accounts_tenant_id_account_number_key UNIQUE (tenant_id, account_number),
  CONSTRAINT ledger_accounts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT ledger_accounts_tenant_id_user_id_account_number_key UNIQUE (tenant_id, user_id, account_number),
  CONSTRAINT ledger_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

DROP TABLE IF EXISTS public.ledger_entries CASCADE;
CREATE TABLE public.ledger_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  transaction_id UUID NOT NULL,
  account_id UUID NOT NULL,
  direction public.ledger_entry_direction NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT ledger_entries_account_id_fkey FOREIGN KEY (account_id) REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT ledger_entries_amount_check CHECK (amount > 0::numeric),
  CONSTRAINT ledger_entries_pkey PRIMARY KEY (id),
  CONSTRAINT ledger_entries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT ledger_entries_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES ledger_transactions(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.ledger_transactions CASCADE;
CREATE TABLE public.ledger_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  reference_type VARCHAR(60) NOT NULL,
  reference_id UUID NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'POSTED'::character varying,
  posted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT ledger_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT ledger_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT ledger_transactions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.lighting_products CASCADE;
CREATE TABLE public.lighting_products (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  brand VARCHAR(120) NOT NULL,
  product_name VARCHAR(180) NOT NULL,
  category VARCHAR(120) NOT NULL DEFAULT 'architectural_lighting'::character varying,
  sku VARCHAR(120),
  cri INTEGER NOT NULL,
  kelvin INTEGER NOT NULL,
  ugr NUMERIC(4, 1) NOT NULL,
  lumens INTEGER NOT NULL,
  beam_angle INTEGER,
  finish VARCHAR(80),
  summary TEXT,
  hero_badge VARCHAR(120),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT lighting_products_cri_check CHECK (cri >= 50 AND cri <= 100),
  CONSTRAINT lighting_products_kelvin_check CHECK (kelvin >= 2200 AND kelvin <= 7000),
  CONSTRAINT lighting_products_lumens_check CHECK (lumens > 0),
  CONSTRAINT lighting_products_pkey PRIMARY KEY (id),
  CONSTRAINT lighting_products_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT lighting_products_ugr_check CHECK (ugr >= 5::numeric AND ugr <= 35::numeric)
);

DROP TABLE IF EXISTS public.notifications CASCADE;
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type public.notification_type NOT NULL DEFAULT 'general'::notification_type,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  tenant_id UUID,
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.order_item_status_history CASCADE;
CREATE TABLE public.order_item_status_history (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL,
  from_status public.order_item_status,
  to_status public.order_item_status NOT NULL,
  changed_by UUID,
  change_reason TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  tenant_id UUID,
  CONSTRAINT order_item_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT order_item_status_history_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
  CONSTRAINT order_item_status_history_pkey PRIMARY KEY (id),
  CONSTRAINT order_item_status_history_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.order_items CASCADE;
CREATE TABLE public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  site_order_id UUID NOT NULL,
  site_id UUID NOT NULL,
  product_id UUID NOT NULL,
  source public.requirement_source NOT NULL,
  source_user_id UUID,
  parent_order_item_id UUID,
  approval_mode public.approval_mode NOT NULL,
  requires_architect_approval BOOLEAN NOT NULL DEFAULT true,
  item_name_snapshot VARCHAR(150) NOT NULL,
  category_name_snapshot VARCHAR(100),
  brand_name_snapshot VARCHAR(100),
  sku_snapshot VARCHAR(80),
  unit_snapshot VARCHAR(30) NOT NULL,
  quantity_required NUMERIC(14, 2) NOT NULL,
  quantity_approved NUMERIC(14, 2),
  quantity_supplied NUMERIC(14, 2) NOT NULL DEFAULT 0,
  unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  line_subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  electrician_notes TEXT,
  architect_notes TEXT,
  customer_notes TEXT,
  admin_notes TEXT,
  status public.order_item_status NOT NULL,
  is_substitute BOOLEAN NOT NULL DEFAULT false,
  substitute_for_order_item_id UUID,
  substitute_status public.substitute_status,
  architect_reviewed_by UUID,
  architect_reviewed_at TIMESTAMP WITH TIME ZONE,
  customer_reviewed_by UUID,
  customer_reviewed_at TIMESTAMP WITH TIME ZONE,
  shop_confirmed_by UUID,
  shop_confirmed_at TIMESTAMP WITH TIME ZONE,
  supplied_by UUID,
  supplied_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  tenant_id UUID,
  CONSTRAINT chk_order_items_qty_approved CHECK (quantity_approved IS NULL OR quantity_approved <= quantity_required),
  CONSTRAINT chk_order_items_qty_supplied_le_required CHECK (quantity_supplied <= quantity_required),
  CONSTRAINT chk_order_items_substitute_status CHECK (is_substitute = false AND substitute_status IS NULL OR is_substitute = true AND substitute_status IS NOT NULL),
  CONSTRAINT order_items_architect_reviewed_by_fkey FOREIGN KEY (architect_reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT order_items_customer_reviewed_by_fkey FOREIGN KEY (customer_reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT order_items_line_subtotal_check CHECK (line_subtotal >= 0::numeric),
  CONSTRAINT order_items_line_total_check CHECK (line_total >= 0::numeric),
  CONSTRAINT order_items_parent_order_item_id_fkey FOREIGN KEY (parent_order_item_id) REFERENCES order_items(id) ON DELETE SET NULL,
  CONSTRAINT order_items_pkey PRIMARY KEY (id),
  CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  CONSTRAINT order_items_quantity_approved_check CHECK (quantity_approved IS NULL OR quantity_approved >= 0::numeric),
  CONSTRAINT order_items_quantity_required_check CHECK (quantity_required > 0::numeric),
  CONSTRAINT order_items_quantity_supplied_check CHECK (quantity_supplied >= 0::numeric),
  CONSTRAINT order_items_shop_confirmed_by_fkey FOREIGN KEY (shop_confirmed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT order_items_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  CONSTRAINT order_items_site_order_id_fkey FOREIGN KEY (site_order_id) REFERENCES site_orders(id) ON DELETE CASCADE,
  CONSTRAINT order_items_source_user_id_fkey FOREIGN KEY (source_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT order_items_substitute_for_order_item_id_fkey FOREIGN KEY (substitute_for_order_item_id) REFERENCES order_items(id) ON DELETE SET NULL,
  CONSTRAINT order_items_supplied_by_fkey FOREIGN KEY (supplied_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT order_items_tax_amount_check CHECK (tax_amount >= 0::numeric),
  CONSTRAINT order_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT order_items_unit_price_check CHECK (unit_price >= 0::numeric)
);

DROP TABLE IF EXISTS public.partner_business_summary CASCADE;
CREATE TABLE public.partner_business_summary (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  partner_id UUID NOT NULL,
  scheme_id UUID,
  current_slab_id UUID,
  business_year INTEGER NOT NULL,
  wire_business NUMERIC(14, 2) NOT NULL DEFAULT 0,
  other_business NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_business NUMERIC(14, 2) NOT NULL DEFAULT 0,
  commission_earned NUMERIC(14, 2) NOT NULL DEFAULT 0,
  bonus_points_earned INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT partner_business_summary_bonus_points_earned_check CHECK (bonus_points_earned >= 0),
  CONSTRAINT partner_business_summary_commission_earned_check CHECK (commission_earned >= 0::numeric),
  CONSTRAINT partner_business_summary_current_slab_id_fkey FOREIGN KEY (current_slab_id) REFERENCES partner_incentive_slabs(id) ON DELETE SET NULL,
  CONSTRAINT partner_business_summary_other_business_check CHECK (other_business >= 0::numeric),
  CONSTRAINT partner_business_summary_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT partner_business_summary_pkey PRIMARY KEY (id),
  CONSTRAINT partner_business_summary_scheme_id_fkey FOREIGN KEY (scheme_id) REFERENCES partner_incentive_schemes(id) ON DELETE SET NULL,
  CONSTRAINT partner_business_summary_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT partner_business_summary_tenant_id_partner_id_business_year_key UNIQUE (tenant_id, partner_id, business_year),
  CONSTRAINT partner_business_summary_total_business_check CHECK (total_business >= 0::numeric),
  CONSTRAINT partner_business_summary_wire_business_check CHECK (wire_business >= 0::numeric)
);

DROP TABLE IF EXISTS public.partner_commission_ledger CASCADE;
CREATE TABLE public.partner_commission_ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  partner_id UUID NOT NULL,
  scheme_id UUID,
  slab_id UUID,
  site_order_id UUID,
  order_item_id UUID,
  entry_type TEXT NOT NULL,
  commission_type TEXT,
  business_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  commission_percent NUMERIC(6, 3) NOT NULL DEFAULT 0,
  commission_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  idempotency_key TEXT NOT NULL,
  posted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT partner_commission_ledger_business_amount_check CHECK (business_amount >= 0::numeric),
  CONSTRAINT partner_commission_ledger_commission_amount_check CHECK (commission_amount >= 0::numeric),
  CONSTRAINT partner_commission_ledger_commission_percent_check CHECK (commission_percent >= 0::numeric),
  CONSTRAINT partner_commission_ledger_commission_type_check CHECK (commission_type = ANY (ARRAY['WIRE'::text, 'OTHER'::text])),
  CONSTRAINT partner_commission_ledger_entry_type_check CHECK (entry_type = ANY (ARRAY['business'::text, 'commission'::text, 'bonus_points'::text, 'redemption'::text, 'adjustment'::text])),
  CONSTRAINT partner_commission_ledger_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE SET NULL,
  CONSTRAINT partner_commission_ledger_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT partner_commission_ledger_pkey PRIMARY KEY (id),
  CONSTRAINT partner_commission_ledger_scheme_id_fkey FOREIGN KEY (scheme_id) REFERENCES partner_incentive_schemes(id) ON DELETE SET NULL,
  CONSTRAINT partner_commission_ledger_site_order_id_fkey FOREIGN KEY (site_order_id) REFERENCES site_orders(id) ON DELETE SET NULL,
  CONSTRAINT partner_commission_ledger_slab_id_fkey FOREIGN KEY (slab_id) REFERENCES partner_incentive_slabs(id) ON DELETE SET NULL,
  CONSTRAINT partner_commission_ledger_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT partner_commission_ledger_tenant_id_idempotency_key_key UNIQUE (tenant_id, idempotency_key)
);

DROP TABLE IF EXISTS public.partner_incentive_schemes CASCADE;
CREATE TABLE public.partner_incentive_schemes (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  partner_type TEXT NOT NULL DEFAULT 'all'::text,
  status TEXT NOT NULL DEFAULT 'draft'::text,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  description TEXT,
  created_by UUID,
  archived_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT chk_partner_scheme_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT partner_incentive_schemes_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT partner_incentive_schemes_pkey PRIMARY KEY (id),
  CONSTRAINT partner_incentive_schemes_status_check CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text])),
  CONSTRAINT partner_incentive_schemes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.partner_incentive_slabs CASCADE;
CREATE TABLE public.partner_incentive_slabs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  scheme_id UUID NOT NULL,
  tier_name TEXT NOT NULL,
  min_business NUMERIC(14, 2) NOT NULL,
  max_business NUMERIC(14, 2),
  wire_commission_percent NUMERIC(6, 3) NOT NULL,
  other_commission_percent NUMERIC(6, 3) NOT NULL,
  bonus_points INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  icon TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT partner_incentive_slabs_bonus_points_check CHECK (bonus_points >= 0),
  CONSTRAINT partner_incentive_slabs_check CHECK (max_business IS NULL OR max_business > min_business),
  CONSTRAINT partner_incentive_slabs_min_business_check CHECK (min_business >= 0::numeric),
  CONSTRAINT partner_incentive_slabs_other_commission_percent_check CHECK (other_commission_percent >= 0::numeric),
  CONSTRAINT partner_incentive_slabs_pkey PRIMARY KEY (id),
  CONSTRAINT partner_incentive_slabs_scheme_id_fkey FOREIGN KEY (scheme_id) REFERENCES partner_incentive_schemes(id) ON DELETE CASCADE,
  CONSTRAINT partner_incentive_slabs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT partner_incentive_slabs_wire_commission_percent_check CHECK (wire_commission_percent >= 0::numeric)
);

DROP TABLE IF EXISTS public.partner_points_wallet CASCADE;
CREATE TABLE public.partner_points_wallet (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  partner_id UUID NOT NULL,
  points_balance INTEGER NOT NULL DEFAULT 0,
  lifetime_points INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT partner_points_wallet_lifetime_points_check CHECK (lifetime_points >= 0),
  CONSTRAINT partner_points_wallet_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT partner_points_wallet_pkey PRIMARY KEY (id),
  CONSTRAINT partner_points_wallet_points_balance_check CHECK (points_balance >= 0),
  CONSTRAINT partner_points_wallet_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT partner_points_wallet_tenant_id_partner_id_key UNIQUE (tenant_id, partner_id)
);

DROP TABLE IF EXISTS public.partner_reward_redemptions CASCADE;
CREATE TABLE public.partner_reward_redemptions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  partner_id UUID NOT NULL,
  points INTEGER NOT NULL,
  reward_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested'::text,
  notes TEXT,
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID,
  CONSTRAINT partner_reward_redemptions_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT partner_reward_redemptions_pkey PRIMARY KEY (id),
  CONSTRAINT partner_reward_redemptions_points_check CHECK (points > 0),
  CONSTRAINT partner_reward_redemptions_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT partner_reward_redemptions_status_check CHECK (status = ANY (ARRAY['requested'::text, 'approved'::text, 'rejected'::text, 'fulfilled'::text, 'cancelled'::text])),
  CONSTRAINT partner_reward_redemptions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.partner_scheme_history CASCADE;
CREATE TABLE public.partner_scheme_history (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  scheme_id UUID NOT NULL,
  partner_type TEXT NOT NULL,
  action TEXT NOT NULL,
  changed_by UUID,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT partner_scheme_history_action_check CHECK (action = ANY (ARRAY['created'::text, 'updated'::text, 'activated'::text, 'archived'::text, 'deleted'::text])),
  CONSTRAINT partner_scheme_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT partner_scheme_history_pkey PRIMARY KEY (id),
  CONSTRAINT partner_scheme_history_scheme_id_fkey FOREIGN KEY (scheme_id) REFERENCES partner_incentive_schemes(id) ON DELETE CASCADE,
  CONSTRAINT partner_scheme_history_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.partner_slab_history CASCADE;
CREATE TABLE public.partner_slab_history (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  partner_id UUID NOT NULL,
  scheme_id UUID NOT NULL,
  from_slab_id UUID,
  to_slab_id UUID NOT NULL,
  business_year INTEGER NOT NULL,
  business_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  bonus_points_awarded INTEGER NOT NULL DEFAULT 0,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT partner_slab_history_from_slab_id_fkey FOREIGN KEY (from_slab_id) REFERENCES partner_incentive_slabs(id) ON DELETE SET NULL,
  CONSTRAINT partner_slab_history_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT partner_slab_history_pkey PRIMARY KEY (id),
  CONSTRAINT partner_slab_history_scheme_id_fkey FOREIGN KEY (scheme_id) REFERENCES partner_incentive_schemes(id) ON DELETE CASCADE,
  CONSTRAINT partner_slab_history_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT partner_slab_history_tenant_id_partner_id_scheme_id_to_slab_key UNIQUE (tenant_id, partner_id, scheme_id, to_slab_id, business_year),
  CONSTRAINT partner_slab_history_to_slab_id_fkey FOREIGN KEY (to_slab_id) REFERENCES partner_incentive_slabs(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.payment_guarantees CASCADE;
CREATE TABLE public.payment_guarantees (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  site_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  guarantor_type VARCHAR(30) NOT NULL,
  guarantee_amount NUMERIC(14, 2) NOT NULL,
  document_url TEXT,
  status public.verification_status NOT NULL DEFAULT 'pending'::verification_status,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT payment_guarantees_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT payment_guarantees_guarantee_amount_check CHECK (guarantee_amount > 0::numeric),
  CONSTRAINT payment_guarantees_pkey PRIMARY KEY (id),
  CONSTRAINT payment_guarantees_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  CONSTRAINT payment_guarantees_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.platform_event_outbox CASCADE;
CREATE TABLE public.platform_event_outbox (
  id UUID NOT NULL,
  event_type TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'::text,
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
  available_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  dispatched_at TIMESTAMP WITH TIME ZONE,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT platform_event_outbox_pkey PRIMARY KEY (id),
  CONSTRAINT platform_event_outbox_status_check CHECK (status = ANY (ARRAY['pending'::text, 'dispatched'::text, 'failed'::text]))
);

DROP TABLE IF EXISTS public.platform_roles CASCADE;
CREATE TABLE public.platform_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  role_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  permission_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT platform_roles_pkey PRIMARY KEY (id),
  CONSTRAINT platform_roles_role_key_check CHECK (role_key ~ '^[a-z][a-z0-9_]{1,63}$'::text),
  CONSTRAINT platform_roles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT platform_roles_tenant_id_role_key_key UNIQUE (tenant_id, role_key)
);

DROP TABLE IF EXISTS public.procurement_fee_entries CASCADE;
CREATE TABLE public.procurement_fee_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  site_order_id UUID NOT NULL,
  fee_model VARCHAR(30) NOT NULL,
  calculated_fee NUMERIC(14, 2) NOT NULL,
  waived_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  final_fee NUMERIC(14, 2) NOT NULL,
  payment_status public.installment_status NOT NULL DEFAULT 'pending'::installment_status,
  ledger_tx_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT procurement_fee_entries_calculated_fee_check CHECK (calculated_fee >= 0::numeric),
  CONSTRAINT procurement_fee_entries_final_fee_check CHECK (final_fee >= 0::numeric),
  CONSTRAINT procurement_fee_entries_ledger_tx_id_fkey FOREIGN KEY (ledger_tx_id) REFERENCES ledger_transactions(id) ON DELETE SET NULL,
  CONSTRAINT procurement_fee_entries_pkey PRIMARY KEY (id),
  CONSTRAINT procurement_fee_entries_site_order_id_fkey FOREIGN KEY (site_order_id) REFERENCES site_orders(id) ON DELETE CASCADE,
  CONSTRAINT procurement_fee_entries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT procurement_fee_entries_waived_amount_check CHECK (waived_amount >= 0::numeric)
);

DROP TABLE IF EXISTS public.product_brands CASCADE;
CREATE TABLE public.product_brands (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  tenant_id UUID,
  CONSTRAINT product_brands_category_id_fkey FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE CASCADE,
  CONSTRAINT product_brands_category_id_slug_key UNIQUE (category_id, slug),
  CONSTRAINT product_brands_pkey PRIMARY KEY (id),
  CONSTRAINT product_brands_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.product_categories CASCADE;
CREATE TABLE public.product_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  tenant_id UUID,
  commission_type TEXT NOT NULL DEFAULT 'OTHER'::text,
  CONSTRAINT product_categories_commission_type_check CHECK (commission_type = ANY (ARRAY['WIRE'::text, 'OTHER'::text])),
  CONSTRAINT product_categories_pkey PRIMARY KEY (id),
  CONSTRAINT product_categories_slug_key UNIQUE (slug),
  CONSTRAINT product_categories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.product_inventory CASCADE;
CREATE TABLE public.product_inventory (
  product_id UUID NOT NULL,
  available_qty NUMERIC(14, 2) NOT NULL DEFAULT 0,
  reserved_qty NUMERIC(14, 2) NOT NULL DEFAULT 0,
  reorder_level NUMERIC(14, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT product_inventory_available_qty_check CHECK (available_qty >= 0::numeric),
  CONSTRAINT product_inventory_pkey PRIMARY KEY (product_id),
  CONSTRAINT product_inventory_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT product_inventory_reorder_level_check CHECK (reorder_level >= 0::numeric),
  CONSTRAINT product_inventory_reserved_qty_check CHECK (reserved_qty >= 0::numeric)
);

DROP TABLE IF EXISTS public.product_requests CASCADE;
CREATE TABLE public.product_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL,
  requested_by_user_id UUID NOT NULL,
  title VARCHAR(180) NOT NULL,
  preferred_category VARCHAR(120),
  preferred_brand VARCHAR(120),
  description TEXT NOT NULL,
  status public.product_request_status NOT NULL DEFAULT 'submitted'::product_request_status,
  matched_product_id UUID,
  admin_notes TEXT,
  ordered_at TIMESTAMP WITH TIME ZONE,
  fulfilled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  tenant_id UUID,
  CONSTRAINT product_requests_matched_product_id_fkey FOREIGN KEY (matched_product_id) REFERENCES products(id) ON DELETE SET NULL,
  CONSTRAINT product_requests_pkey PRIMARY KEY (id),
  CONSTRAINT product_requests_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT product_requests_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  CONSTRAINT product_requests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.products CASCADE;
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL,
  brand_id UUID NOT NULL,
  item_name VARCHAR(150) NOT NULL,
  sku VARCHAR(80) NOT NULL,
  hsn_code VARCHAR(20),
  color VARCHAR(50),
  specification VARCHAR(255),
  unit VARCHAR(30) NOT NULL,
  pack_size NUMERIC(12, 2),
  base_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  mrp NUMERIC(14, 2),
  stock_status public.inventory_stock_status NOT NULL DEFAULT 'in_stock'::inventory_stock_status,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_approved_for_sale BOOLEAN NOT NULL DEFAULT true,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  tenant_id UUID,
  CONSTRAINT products_base_price_check CHECK (base_price >= 0::numeric),
  CONSTRAINT products_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES product_brands(id) ON DELETE RESTRICT,
  CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE RESTRICT,
  CONSTRAINT products_mrp_check CHECK (mrp IS NULL OR mrp >= 0::numeric),
  CONSTRAINT products_pack_size_check CHECK (pack_size IS NULL OR pack_size > 0::numeric),
  CONSTRAINT products_pkey PRIMARY KEY (id),
  CONSTRAINT products_sku_key UNIQUE (sku),
  CONSTRAINT products_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.project_bids CASCADE;
CREATE TABLE public.project_bids (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL,
  bidder_user_id UUID NOT NULL,
  bidder_role public.tenant_membership_role NOT NULL,
  bid_amount NUMERIC(14, 2) NOT NULL,
  notes TEXT,
  estimated_days INTEGER,
  status public.bid_status NOT NULL DEFAULT 'submitted'::bid_status,
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  responded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  tenant_id UUID,
  CONSTRAINT project_bids_bid_amount_check CHECK (bid_amount >= 0::numeric),
  CONSTRAINT project_bids_bidder_user_id_fkey FOREIGN KEY (bidder_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT project_bids_estimated_days_check CHECK (estimated_days IS NULL OR estimated_days > 0),
  CONSTRAINT project_bids_pkey PRIMARY KEY (id),
  CONSTRAINT project_bids_site_id_bidder_user_id_bidder_role_key UNIQUE (site_id, bidder_user_id, bidder_role),
  CONSTRAINT project_bids_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  CONSTRAINT project_bids_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.project_media CASCADE;
CREATE TABLE public.project_media (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  uploaded_by UUID NOT NULL,
  shared_by UUID NOT NULL,
  object_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'project'::text,
  context_type TEXT NOT NULL DEFAULT 'project'::text,
  context_id UUID,
  caption TEXT,
  status TEXT NOT NULL DEFAULT 'uploading'::text,
  uploaded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT project_media_context_type_check CHECK (context_type = ANY (ARRAY['project'::text, 'site'::text, 'room'::text, 'task'::text, 'issue'::text, 'chat'::text])),
  CONSTRAINT project_media_mime_type_check CHECK (mime_type = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text, 'image/heic'::text])),
  CONSTRAINT project_media_object_key_key UNIQUE (object_key),
  CONSTRAINT project_media_pkey PRIMARY KEY (id),
  CONSTRAINT project_media_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT project_media_shared_by_fkey FOREIGN KEY (shared_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT project_media_size_bytes_check CHECK (size_bytes > 0 AND size_bytes <= 20971520),
  CONSTRAINT project_media_status_check CHECK (status = ANY (ARRAY['uploading'::text, 'ready'::text, 'failed'::text])),
  CONSTRAINT project_media_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT project_media_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT project_media_visibility_check CHECK (visibility = ANY (ARRAY['project'::text, 'recipients'::text]))
);

DROP TABLE IF EXISTS public.project_media_recipients CASCADE;
CREATE TABLE public.project_media_recipients (
  media_id UUID NOT NULL,
  recipient_user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT project_media_recipients_media_id_fkey FOREIGN KEY (media_id) REFERENCES project_media(id) ON DELETE CASCADE,
  CONSTRAINT project_media_recipients_pkey PRIMARY KEY (media_id, recipient_user_id),
  CONSTRAINT project_media_recipients_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.project_members CASCADE;
CREATE TABLE public.project_members (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role_key TEXT NOT NULL,
  permission_overrides JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active'::text,
  joined_at TIMESTAMP WITH TIME ZONE,
  removed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT project_members_pkey PRIMARY KEY (id),
  CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT project_members_project_id_user_id_role_key_key UNIQUE (project_id, user_id, role_key),
  CONSTRAINT project_members_status_check CHECK (status = ANY (ARRAY['invited'::text, 'active'::text, 'removed'::text])),
  CONSTRAINT project_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.project_rooms CASCADE;
CREATE TABLE public.project_rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  parent_room_id UUID,
  name TEXT NOT NULL,
  room_type TEXT,
  floor_label TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'::text,
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT project_rooms_parent_room_id_fkey FOREIGN KEY (parent_room_id) REFERENCES project_rooms(id) ON DELETE SET NULL,
  CONSTRAINT project_rooms_pkey PRIMARY KEY (id),
  CONSTRAINT project_rooms_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT project_rooms_project_id_parent_room_id_name_key UNIQUE (project_id, parent_room_id, name),
  CONSTRAINT project_rooms_status_check CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'completed'::text]))
);

DROP TABLE IF EXISTS public.project_task_assignees CASCADE;
CREATE TABLE public.project_task_assignees (
  task_id UUID NOT NULL,
  user_id UUID NOT NULL,
  assigned_by UUID,
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT project_task_assignees_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT project_task_assignees_pkey PRIMARY KEY (task_id, user_id),
  CONSTRAINT project_task_assignees_task_id_fkey FOREIGN KEY (task_id) REFERENCES project_tasks(id) ON DELETE CASCADE,
  CONSTRAINT project_task_assignees_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.project_tasks CASCADE;
CREATE TABLE public.project_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  room_id UUID,
  parent_task_id UUID,
  created_by UUID,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium'::text,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'pending'::text,
  start_date DATE,
  deadline DATE,
  estimated_hours NUMERIC(10, 2),
  actual_hours NUMERIC(10, 2),
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT project_tasks_actual_hours_check CHECK (actual_hours >= 0::numeric),
  CONSTRAINT project_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT project_tasks_estimated_hours_check CHECK (estimated_hours >= 0::numeric),
  CONSTRAINT project_tasks_parent_task_id_fkey FOREIGN KEY (parent_task_id) REFERENCES project_tasks(id) ON DELETE SET NULL,
  CONSTRAINT project_tasks_pkey PRIMARY KEY (id),
  CONSTRAINT project_tasks_priority_check CHECK (priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])),
  CONSTRAINT project_tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT project_tasks_room_id_fkey FOREIGN KEY (room_id) REFERENCES project_rooms(id) ON DELETE SET NULL,
  CONSTRAINT project_tasks_status_check CHECK (status = ANY (ARRAY['pending'::text, 'assigned'::text, 'in_progress'::text, 'waiting_material'::text, 'waiting_approval'::text, 'completed'::text, 'rejected'::text]))
);

DROP TABLE IF EXISTS public.projects CASCADE;
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  legacy_site_id UUID,
  customer_id UUID,
  created_by UUID,
  project_code TEXT NOT NULL,
  name TEXT NOT NULL,
  project_type TEXT,
  status TEXT NOT NULL DEFAULT 'planning'::text,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  start_date DATE,
  target_end_date DATE,
  completed_at TIMESTAMP WITH TIME ZONE,
  estimated_budget NUMERIC(14, 2) NOT NULL DEFAULT 0,
  actual_spend NUMERIC(14, 2) NOT NULL DEFAULT 0,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT projects_actual_spend_check CHECK (actual_spend >= 0::numeric),
  CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT projects_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT projects_estimated_budget_check CHECK (estimated_budget >= 0::numeric),
  CONSTRAINT projects_legacy_site_id_fkey FOREIGN KEY (legacy_site_id) REFERENCES sites(id) ON DELETE SET NULL,
  CONSTRAINT projects_legacy_site_id_key UNIQUE (legacy_site_id),
  CONSTRAINT projects_pkey PRIMARY KEY (id),
  CONSTRAINT projects_status_check CHECK (status = ANY (ARRAY['planning'::text, 'active'::text, 'on_hold'::text, 'completed'::text, 'cancelled'::text])),
  CONSTRAINT projects_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT projects_tenant_id_project_code_key UNIQUE (tenant_id, project_code)
);

DROP TABLE IF EXISTS public.referral_codes CASCADE;
CREATE TABLE public.referral_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  code VARCHAR(50) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT referral_codes_pkey PRIMARY KEY (id),
  CONSTRAINT referral_codes_tenant_id_code_key UNIQUE (tenant_id, code),
  CONSTRAINT referral_codes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT referral_codes_tenant_id_user_id_key UNIQUE (tenant_id, user_id)
);

DROP TABLE IF EXISTS public.referral_events CASCADE;
CREATE TABLE public.referral_events (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  referral_program_id UUID,
  referral_code_id UUID,
  referrer_user_id UUID,
  referred_user_id UUID,
  trigger_event VARCHAR(80) NOT NULL,
  reference_type VARCHAR(80),
  reference_id UUID,
  event_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT referral_events_pkey PRIMARY KEY (id),
  CONSTRAINT referral_events_referral_code_id_fkey FOREIGN KEY (referral_code_id) REFERENCES referral_codes(id) ON DELETE SET NULL,
  CONSTRAINT referral_events_referral_program_id_fkey FOREIGN KEY (referral_program_id) REFERENCES referral_programs(id) ON DELETE SET NULL,
  CONSTRAINT referral_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.referral_programs CASCADE;
CREATE TABLE public.referral_programs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(180) NOT NULL,
  description TEXT,
  status public.referral_program_status NOT NULL DEFAULT 'draft'::referral_program_status,
  trigger_event VARCHAR(80) NOT NULL,
  reward_amount NUMERIC(14, 2) NOT NULL,
  referrer_reward_amount NUMERIC(14, 2) NOT NULL,
  referred_reward_amount NUMERIC(14, 2) NOT NULL,
  max_rewards_per_referrer INTEGER,
  eligibility_rules JSONB,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT referral_programs_pkey PRIMARY KEY (id),
  CONSTRAINT referral_programs_referred_reward_amount_check CHECK (referred_reward_amount >= 0::numeric),
  CONSTRAINT referral_programs_referrer_reward_amount_check CHECK (referrer_reward_amount >= 0::numeric),
  CONSTRAINT referral_programs_reward_amount_check CHECK (reward_amount >= 0::numeric),
  CONSTRAINT referral_programs_tenant_id_code_key UNIQUE (tenant_id, code),
  CONSTRAINT referral_programs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.referral_rewards CASCADE;
CREATE TABLE public.referral_rewards (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  referral_event_id UUID NOT NULL,
  beneficiary_user_id UUID NOT NULL,
  wallet_account_id UUID,
  reward_status public.referral_reward_status NOT NULL DEFAULT 'pending'::referral_reward_status,
  reward_amount NUMERIC(14, 2) NOT NULL,
  wallet_ledger_entry_id UUID,
  decision_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT referral_rewards_pkey PRIMARY KEY (id),
  CONSTRAINT referral_rewards_referral_event_id_fkey FOREIGN KEY (referral_event_id) REFERENCES referral_events(id) ON DELETE CASCADE,
  CONSTRAINT referral_rewards_reward_amount_check CHECK (reward_amount >= 0::numeric),
  CONSTRAINT referral_rewards_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT referral_rewards_wallet_account_id_fkey FOREIGN KEY (wallet_account_id) REFERENCES wallet_accounts(id) ON DELETE SET NULL,
  CONSTRAINT referral_rewards_wallet_ledger_entry_id_fkey FOREIGN KEY (wallet_ledger_entry_id) REFERENCES wallet_ledger_entries(id) ON DELETE SET NULL
);

DROP TABLE IF EXISTS public.repayment_schedules CASCADE;
CREATE TABLE public.repayment_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  contractor_id UUID NOT NULL,
  site_order_id UUID,
  total_due NUMERIC(14, 2) NOT NULL,
  principal_due NUMERIC(14, 2) NOT NULL,
  interest_due NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  penalty_due NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  amount_paid NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  due_date DATE NOT NULL,
  status public.installment_status NOT NULL DEFAULT 'pending'::installment_status,
  paid_at TIMESTAMP WITH TIME ZONE,
  grace_period_ends_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT chk_paid_limit CHECK (amount_paid <= total_due),
  CONSTRAINT repayment_schedules_amount_paid_check CHECK (amount_paid >= 0::numeric),
  CONSTRAINT repayment_schedules_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT repayment_schedules_interest_due_check CHECK (interest_due >= 0::numeric),
  CONSTRAINT repayment_schedules_penalty_due_check CHECK (penalty_due >= 0::numeric),
  CONSTRAINT repayment_schedules_pkey PRIMARY KEY (id),
  CONSTRAINT repayment_schedules_principal_due_check CHECK (principal_due >= 0::numeric),
  CONSTRAINT repayment_schedules_site_order_id_fkey FOREIGN KEY (site_order_id) REFERENCES site_orders(id) ON DELETE SET NULL,
  CONSTRAINT repayment_schedules_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT repayment_schedules_total_due_check CHECK (total_due >= 0::numeric)
);

DROP TABLE IF EXISTS public.requirement_batch_dictionaries CASCADE;
CREATE TABLE public.requirement_batch_dictionaries (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  term VARCHAR(120) NOT NULL,
  normalized_term VARCHAR(120) NOT NULL,
  term_type VARCHAR(50) NOT NULL,
  language_code VARCHAR(10) NOT NULL DEFAULT 'mixed'::character varying,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT requirement_batch_dictionaries_pkey PRIMARY KEY (id),
  CONSTRAINT requirement_batch_dictionaries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.requirement_batch_item_candidates CASCADE;
CREATE TABLE public.requirement_batch_item_candidates (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  requirement_batch_item_id UUID NOT NULL,
  candidate_product_id UUID,
  candidate_reason TEXT,
  semantic_score NUMERIC(5, 2),
  fuzzy_score NUMERIC(5, 2),
  brand_score NUMERIC(5, 2),
  availability_score NUMERIC(5, 2),
  final_score NUMERIC(5, 2),
  is_substitute BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT requirement_batch_item_candidate_requirement_batch_item_id_fkey FOREIGN KEY (requirement_batch_item_id) REFERENCES requirement_batch_items(id) ON DELETE CASCADE,
  CONSTRAINT requirement_batch_item_candidates_pkey PRIMARY KEY (id)
);

DROP TABLE IF EXISTS public.requirement_batch_items CASCADE;
CREATE TABLE public.requirement_batch_items (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  requirement_batch_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  source_id UUID,
  source_page INTEGER,
  source_line_number INTEGER,
  raw_text TEXT NOT NULL,
  normalized_text TEXT,
  extracted_quantity NUMERIC(14, 2),
  extracted_unit VARCHAR(40),
  extracted_brand VARCHAR(120),
  extracted_specifications TEXT,
  extracted_dimensions VARCHAR(120),
  extracted_category VARCHAR(120),
  matched_product_id UUID,
  match_confidence NUMERIC(5, 2),
  extraction_confidence NUMERIC(5, 2),
  review_status VARCHAR(40) NOT NULL DEFAULT 'pending'::character varying,
  review_notes TEXT,
  source_coordinates JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT requirement_batch_items_pkey PRIMARY KEY (id),
  CONSTRAINT requirement_batch_items_requirement_batch_id_fkey FOREIGN KEY (requirement_batch_id) REFERENCES requirement_batches(id) ON DELETE CASCADE,
  CONSTRAINT requirement_batch_items_source_id_fkey FOREIGN KEY (source_id) REFERENCES requirement_batch_sources(id) ON DELETE SET NULL,
  CONSTRAINT requirement_batch_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.requirement_batch_processing_jobs CASCADE;
CREATE TABLE public.requirement_batch_processing_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  requirement_batch_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  stage VARCHAR(50) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'queued'::character varying,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  worker_name VARCHAR(120),
  error_message TEXT,
  input_payload JSONB,
  output_payload JSONB,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT requirement_batch_processing_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT requirement_batch_processing_jobs_requirement_batch_id_fkey FOREIGN KEY (requirement_batch_id) REFERENCES requirement_batches(id) ON DELETE CASCADE,
  CONSTRAINT requirement_batch_processing_jobs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.requirement_batch_review_actions CASCADE;
CREATE TABLE public.requirement_batch_review_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  requirement_batch_id UUID NOT NULL,
  item_id UUID,
  reviewed_by UUID,
  action_type VARCHAR(40) NOT NULL,
  old_value JSONB,
  new_value JSONB,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT requirement_batch_review_actions_item_id_fkey FOREIGN KEY (item_id) REFERENCES requirement_batch_items(id) ON DELETE SET NULL,
  CONSTRAINT requirement_batch_review_actions_pkey PRIMARY KEY (id),
  CONSTRAINT requirement_batch_review_actions_requirement_batch_id_fkey FOREIGN KEY (requirement_batch_id) REFERENCES requirement_batches(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.requirement_batch_sources CASCADE;
CREATE TABLE public.requirement_batch_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  requirement_batch_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  source_type VARCHAR(40) NOT NULL,
  mime_type VARCHAR(120),
  original_filename VARCHAR(255),
  storage_bucket VARCHAR(255),
  storage_key TEXT,
  public_url TEXT,
  page_count INTEGER,
  raw_text TEXT,
  metadata_json JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT requirement_batch_sources_pkey PRIMARY KEY (id),
  CONSTRAINT requirement_batch_sources_requirement_batch_id_fkey FOREIGN KEY (requirement_batch_id) REFERENCES requirement_batches(id) ON DELETE CASCADE,
  CONSTRAINT requirement_batch_sources_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.requirement_batches CASCADE;
CREATE TABLE public.requirement_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  site_id UUID,
  created_by UUID,
  source_channel VARCHAR(50) NOT NULL DEFAULT 'manual_upload'::character varying,
  status VARCHAR(40) NOT NULL DEFAULT 'queued'::character varying,
  review_status VARCHAR(40) NOT NULL DEFAULT 'pending'::character varying,
  input_language VARCHAR(20),
  overall_confidence NUMERIC(5, 2),
  notes TEXT,
  generated_site_order_id UUID,
  processing_started_at TIMESTAMP WITH TIME ZONE,
  processing_completed_at TIMESTAMP WITH TIME ZONE,
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT requirement_batches_pkey PRIMARY KEY (id),
  CONSTRAINT requirement_batches_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.savings_installments CASCADE;
CREATE TABLE public.savings_installments (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  subscription_id UUID NOT NULL,
  installment_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  expected_amount NUMERIC(14, 2) NOT NULL,
  paid_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status public.installment_status NOT NULL DEFAULT 'pending'::installment_status,
  paid_at TIMESTAMP WITH TIME ZONE,
  wallet_ledger_entry_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT savings_installments_expected_amount_check CHECK (expected_amount > 0::numeric),
  CONSTRAINT savings_installments_installment_number_check CHECK (installment_number > 0),
  CONSTRAINT savings_installments_paid_amount_check CHECK (paid_amount >= 0::numeric),
  CONSTRAINT savings_installments_pkey PRIMARY KEY (id),
  CONSTRAINT savings_installments_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES savings_plan_subscriptions(id) ON DELETE CASCADE,
  CONSTRAINT savings_installments_subscription_id_installment_number_key UNIQUE (subscription_id, installment_number),
  CONSTRAINT savings_installments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT savings_installments_wallet_ledger_entry_id_fkey FOREIGN KEY (wallet_ledger_entry_id) REFERENCES wallet_ledger_entries(id) ON DELETE SET NULL
);

DROP TABLE IF EXISTS public.savings_plan_subscriptions CASCADE;
CREATE TABLE public.savings_plan_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  wallet_account_id UUID NOT NULL,
  user_id UUID NOT NULL,
  plan_template_id UUID NOT NULL,
  subscription_number VARCHAR(50) NOT NULL,
  status public.savings_subscription_status NOT NULL DEFAULT 'active'::savings_subscription_status,
  started_at DATE NOT NULL DEFAULT CURRENT_DATE,
  maturity_date DATE,
  installment_amount NUMERIC(14, 2) NOT NULL,
  installment_count INTEGER NOT NULL,
  maturity_bonus_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  completed_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT savings_plan_subscriptions_installment_amount_check CHECK (installment_amount > 0::numeric),
  CONSTRAINT savings_plan_subscriptions_installment_count_check CHECK (installment_count > 0),
  CONSTRAINT savings_plan_subscriptions_maturity_bonus_amount_check CHECK (maturity_bonus_amount >= 0::numeric),
  CONSTRAINT savings_plan_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT savings_plan_subscriptions_plan_template_id_fkey FOREIGN KEY (plan_template_id) REFERENCES savings_plan_templates(id) ON DELETE RESTRICT,
  CONSTRAINT savings_plan_subscriptions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT savings_plan_subscriptions_tenant_id_subscription_number_key UNIQUE (tenant_id, subscription_number),
  CONSTRAINT savings_plan_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT savings_plan_subscriptions_wallet_account_id_fkey FOREIGN KEY (wallet_account_id) REFERENCES wallet_accounts(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.savings_plan_templates CASCADE;
CREATE TABLE public.savings_plan_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(180) NOT NULL,
  description TEXT,
  installment_amount NUMERIC(14, 2) NOT NULL,
  installment_count INTEGER NOT NULL,
  frequency_days INTEGER NOT NULL DEFAULT 30,
  maturity_bonus_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  minimum_completion_ratio NUMERIC(5, 2) NOT NULL DEFAULT 100,
  status public.savings_plan_status NOT NULL DEFAULT 'draft'::savings_plan_status,
  eligibility_rules JSONB,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT savings_plan_templates_frequency_days_check CHECK (frequency_days > 0),
  CONSTRAINT savings_plan_templates_installment_amount_check CHECK (installment_amount > 0::numeric),
  CONSTRAINT savings_plan_templates_installment_count_check CHECK (installment_count >= 1 AND installment_count <= 24),
  CONSTRAINT savings_plan_templates_maturity_bonus_amount_check CHECK (maturity_bonus_amount >= 0::numeric),
  CONSTRAINT savings_plan_templates_minimum_completion_ratio_check CHECK (minimum_completion_ratio > 0::numeric AND minimum_completion_ratio <= 100::numeric),
  CONSTRAINT savings_plan_templates_pkey PRIMARY KEY (id),
  CONSTRAINT savings_plan_templates_tenant_id_code_key UNIQUE (tenant_id, code),
  CONSTRAINT savings_plan_templates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.site_assignments CASCADE;
CREATE TABLE public.site_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role public.assignment_role NOT NULL,
  status public.assignment_status NOT NULL DEFAULT 'active'::assignment_status,
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  removed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  tenant_id UUID,
  CONSTRAINT site_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT site_assignments_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  CONSTRAINT site_assignments_site_id_user_id_role_key UNIQUE (site_id, user_id, role),
  CONSTRAINT site_assignments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT site_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

DROP TABLE IF EXISTS public.site_credit_profiles CASCADE;
CREATE TABLE public.site_credit_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  site_id UUID NOT NULL,
  site_budget NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  approved_limit NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  utilization NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  repayment_status VARCHAR(30) NOT NULL DEFAULT 'CURRENT'::character varying,
  architect_verification public.verification_status NOT NULL DEFAULT 'pending'::verification_status,
  customer_backing public.verification_status NOT NULL DEFAULT 'pending'::verification_status,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT chk_site_utilized_amount CHECK (utilization <= approved_limit),
  CONSTRAINT site_credit_profiles_approved_limit_check CHECK (approved_limit >= 0::numeric),
  CONSTRAINT site_credit_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT site_credit_profiles_site_budget_check CHECK (site_budget >= 0::numeric),
  CONSTRAINT site_credit_profiles_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  CONSTRAINT site_credit_profiles_site_id_key UNIQUE (site_id),
  CONSTRAINT site_credit_profiles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT site_credit_profiles_utilization_check CHECK (utilization >= 0::numeric)
);

DROP TABLE IF EXISTS public.site_notes CASCADE;
CREATE TABLE public.site_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL,
  sender_user_id UUID NOT NULL,
  recipient_role public.tenant_membership_role,
  recipient_user_id UUID,
  note_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  tenant_id UUID,
  CONSTRAINT site_notes_pkey PRIMARY KEY (id),
  CONSTRAINT site_notes_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT site_notes_sender_user_id_fkey FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT site_notes_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  CONSTRAINT site_notes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.site_orders CASCADE;
CREATE TABLE public.site_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL,
  order_number VARCHAR(40) NOT NULL,
  customer_id UUID NOT NULL,
  electrician_id UUID,
  architect_id UUID,
  status public.order_status NOT NULL DEFAULT 'draft'::order_status,
  subtotal_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  remarks TEXT,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  supplied_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  tenant_id UUID,
  CONSTRAINT site_orders_architect_id_fkey FOREIGN KEY (architect_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT site_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT site_orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT site_orders_discount_amount_check CHECK (discount_amount >= 0::numeric),
  CONSTRAINT site_orders_electrician_id_fkey FOREIGN KEY (electrician_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT site_orders_order_number_key UNIQUE (order_number),
  CONSTRAINT site_orders_pkey PRIMARY KEY (id),
  CONSTRAINT site_orders_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  CONSTRAINT site_orders_subtotal_amount_check CHECK (subtotal_amount >= 0::numeric),
  CONSTRAINT site_orders_tax_amount_check CHECK (tax_amount >= 0::numeric),
  CONSTRAINT site_orders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT site_orders_total_amount_check CHECK (total_amount >= 0::numeric)
);

DROP TABLE IF EXISTS public.sites CASCADE;
CREATE TABLE public.sites (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL,
  site_code VARCHAR(30) NOT NULL,
  site_name VARCHAR(150) NOT NULL,
  project_type VARCHAR(100),
  site_address_line1 VARCHAR(255) NOT NULL,
  site_address_line2 VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  postal_code VARCHAR(20),
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  area_sqft NUMERIC(12, 2),
  architect_required BOOLEAN NOT NULL DEFAULT true,
  approval_mode public.approval_mode NOT NULL DEFAULT 'architect_then_customer'::approval_mode,
  estimated_budget NUMERIC(14, 2) NOT NULL DEFAULT 0,
  actual_spend NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status public.site_status NOT NULL DEFAULT 'draft'::site_status,
  description TEXT,
  start_date DATE,
  expected_end_date DATE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  tenant_id UUID,
  CONSTRAINT sites_actual_spend_check CHECK (actual_spend >= 0::numeric),
  CONSTRAINT sites_area_sqft_check CHECK (area_sqft >= 0::numeric),
  CONSTRAINT sites_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT sites_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT sites_estimated_budget_check CHECK (estimated_budget >= 0::numeric),
  CONSTRAINT sites_pkey PRIMARY KEY (id),
  CONSTRAINT sites_site_code_key UNIQUE (site_code),
  CONSTRAINT sites_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.state_transition_catalog CASCADE;
CREATE TABLE public.state_transition_catalog (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  entity_type VARCHAR(60) NOT NULL,
  from_state VARCHAR(80) NOT NULL,
  to_state VARCHAR(80) NOT NULL,
  transition_key VARCHAR(120) NOT NULL,
  allowed_actor_scope VARCHAR(60) NOT NULL,
  workflow_name VARCHAR(120) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT state_transition_catalog_allowed_actor_scope_check CHECK (allowed_actor_scope::text = ANY (ARRAY['customer'::character varying, 'architect'::character varying, 'admin'::character varying, 'electrician'::character varying, 'system'::character varying]::text[])),
  CONSTRAINT state_transition_catalog_entity_type_check CHECK (entity_type::text = ANY (ARRAY['order_item'::character varying, 'site_order'::character varying, 'substitute_suggestion'::character varying]::text[])),
  CONSTRAINT state_transition_catalog_pkey PRIMARY KEY (id)
);

DROP TABLE IF EXISTS public.substitute_suggestions CASCADE;
CREATE TABLE public.substitute_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  original_order_item_id UUID NOT NULL,
  suggested_product_id UUID NOT NULL,
  suggested_by UUID NOT NULL,
  customer_id UUID NOT NULL,
  status public.substitute_status NOT NULL DEFAULT 'suggested'::substitute_status,
  reason TEXT,
  customer_response_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  tenant_id UUID,
  CONSTRAINT substitute_suggestions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT substitute_suggestions_original_order_item_id_fkey FOREIGN KEY (original_order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
  CONSTRAINT substitute_suggestions_pkey PRIMARY KEY (id),
  CONSTRAINT substitute_suggestions_suggested_by_fkey FOREIGN KEY (suggested_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT substitute_suggestions_suggested_product_id_fkey FOREIGN KEY (suggested_product_id) REFERENCES products(id) ON DELETE RESTRICT,
  CONSTRAINT substitute_suggestions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.supplier_subscription_plans CASCADE;
CREATE TABLE public.supplier_subscription_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  price NUMERIC(14, 2) NOT NULL,
  billing_cycle VARCHAR(20) NOT NULL DEFAULT 'MONTHLY'::character varying,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT supplier_subscription_plans_pkey PRIMARY KEY (id),
  CONSTRAINT supplier_subscription_plans_price_check CHECK (price >= 0::numeric),
  CONSTRAINT supplier_subscription_plans_tenant_id_code_key UNIQUE (tenant_id, code),
  CONSTRAINT supplier_subscription_plans_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.system_events CASCADE;
CREATE TABLE public.system_events (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  event_type VARCHAR(120) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id UUID NOT NULL,
  actor_user_id UUID,
  correlation_id UUID NOT NULL DEFAULT gen_random_uuid(),
  source_module VARCHAR(120) NOT NULL DEFAULT 'order_workflow'::character varying,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT system_events_entity_type_check CHECK (entity_type::text = ANY (ARRAY['order_item'::character varying, 'site_order'::character varying, 'substitute_suggestion'::character varying]::text[])),
  CONSTRAINT system_events_pkey PRIMARY KEY (id),
  CONSTRAINT system_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.tasks CASCADE;
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  site_id UUID,
  created_by UUID,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  budget_range NUMERIC(12, 2),
  max_budget NUMERIC(12, 2),
  status TEXT NOT NULL DEFAULT 'OPEN'::text,
  assigned_handyman_id UUID,
  assignment_deadline TIMESTAMP WITH TIME ZONE,
  handyman_id UUID,
  claimed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  selected_bid_id UUID,
  CONSTRAINT tasks_pkey PRIMARY KEY (id),
  CONSTRAINT tasks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.tenant_branding CASCADE;
CREATE TABLE public.tenant_branding (
  tenant_id UUID NOT NULL,
  app_name VARCHAR(200) NOT NULL DEFAULT 'Mahalaxmi Electricals'::character varying,
  support_email VARCHAR(255),
  support_phone VARCHAR(30),
  logo_url TEXT,
  favicon_url TEXT,
  primary_color VARCHAR(20),
  secondary_color VARCHAR(20),
  accent_color VARCHAR(20),
  website_url TEXT,
  custom_domain TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT tenant_branding_pkey PRIMARY KEY (tenant_id),
  CONSTRAINT tenant_branding_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.tenant_memberships CASCADE;
CREATE TABLE public.tenant_memberships (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role public.tenant_membership_role NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  invited_by UUID,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT tenant_memberships_pkey PRIMARY KEY (id),
  CONSTRAINT tenant_memberships_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT tenant_memberships_tenant_id_user_id_key UNIQUE (tenant_id, user_id)
);

DROP TABLE IF EXISTS public.tenants CASCADE;
CREATE TABLE public.tenants (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  slug VARCHAR(120) NOT NULL,
  legal_name VARCHAR(200) NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  status public.tenant_status NOT NULL DEFAULT 'active'::tenant_status,
  country_code VARCHAR(10) NOT NULL DEFAULT 'IN'::character varying,
  currency_code VARCHAR(10) NOT NULL DEFAULT 'INR'::character varying,
  time_zone VARCHAR(80) NOT NULL DEFAULT 'Asia/Kolkata'::character varying,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT tenants_pkey PRIMARY KEY (id),
  CONSTRAINT tenants_slug_key UNIQUE (slug)
);

DROP TABLE IF EXISTS public.urgency_pricing CASCADE;
CREATE TABLE public.urgency_pricing (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  urgency_level VARCHAR(20) NOT NULL,
  fee_type VARCHAR(20) NOT NULL,
  fee_value NUMERIC(14, 2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT urgency_pricing_fee_type_check CHECK (fee_type::text = ANY (ARRAY['FIXED'::character varying, 'PERCENTAGE'::character varying]::text[])),
  CONSTRAINT urgency_pricing_fee_value_check CHECK (fee_value >= 0::numeric),
  CONSTRAINT urgency_pricing_pkey PRIMARY KEY (id),
  CONSTRAINT urgency_pricing_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT urgency_pricing_tenant_id_urgency_level_key UNIQUE (tenant_id, urgency_level),
  CONSTRAINT urgency_pricing_urgency_level_check CHECK (urgency_level::text = ANY (ARRAY['STANDARD'::character varying, 'PRIORITY'::character varying, 'EMERGENCY'::character varying]::text[]))
);

DROP TABLE IF EXISTS public.user_professional_profiles CASCADE;
CREATE TABLE public.user_professional_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  profession_title VARCHAR(100),
  years_of_experience INTEGER,
  license_number VARCHAR(100),
  service_radius_km NUMERIC(10, 2),
  bio TEXT,
  rating_avg NUMERIC(3, 2) DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  tenant_id UUID,
  CONSTRAINT user_professional_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT user_professional_profiles_rating_avg_check CHECK (rating_avg >= 0::numeric AND rating_avg <= 5::numeric),
  CONSTRAINT user_professional_profiles_rating_count_check CHECK (rating_count >= 0),
  CONSTRAINT user_professional_profiles_service_radius_km_check CHECK (service_radius_km >= 0::numeric),
  CONSTRAINT user_professional_profiles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT user_professional_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT user_professional_profiles_user_id_key UNIQUE (user_id),
  CONSTRAINT user_professional_profiles_years_of_experience_check CHECK (years_of_experience >= 0)
);

DROP TABLE IF EXISTS public.users CASCADE;
CREATE TABLE public.users (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  auth_user_id UUID,
  username VARCHAR(24) NOT NULL,
  role public.user_role NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  password_hash TEXT,
  status public.user_status NOT NULL DEFAULT 'active'::user_status,
  verification_status public.verification_status NOT NULL DEFAULT 'pending'::verification_status,
  is_admin_verified BOOLEAN NOT NULL DEFAULT false,
  company_name VARCHAR(150),
  gst_number VARCHAR(30),
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(20),
  country VARCHAR(100) DEFAULT 'India'::character varying,
  profile_photo_url TEXT,
  notes TEXT,
  last_login_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  default_tenant_id UUID,
  credit_limit NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  credit_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  credit_score INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT users_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT users_auth_user_id_key UNIQUE (auth_user_id),
  CONSTRAINT users_email_key UNIQUE (email),
  CONSTRAINT users_phone_key UNIQUE (phone),
  CONSTRAINT users_pkey PRIMARY KEY (id)
);

DROP TABLE IF EXISTS public.wallet_accounts CASCADE;
CREATE TABLE public.wallet_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  currency_code VARCHAR(10) NOT NULL DEFAULT 'INR'::character varying,
  status public.wallet_account_status NOT NULL DEFAULT 'active'::wallet_account_status,
  available_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  lifetime_credited NUMERIC(14, 2) NOT NULL DEFAULT 0,
  lifetime_debited NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT wallet_accounts_available_balance_check CHECK (available_balance >= 0::numeric),
  CONSTRAINT wallet_accounts_lifetime_credited_check CHECK (lifetime_credited >= 0::numeric),
  CONSTRAINT wallet_accounts_lifetime_debited_check CHECK (lifetime_debited >= 0::numeric),
  CONSTRAINT wallet_accounts_pkey PRIMARY KEY (id),
  CONSTRAINT wallet_accounts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT wallet_accounts_tenant_id_user_id_key UNIQUE (tenant_id, user_id),
  CONSTRAINT wallet_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.wallet_balance_snapshots CASCADE;
CREATE TABLE public.wallet_balance_snapshots (
  wallet_account_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  last_ledger_entry_id UUID,
  available_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  calculated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT wallet_balance_snapshots_available_balance_check CHECK (available_balance >= 0::numeric),
  CONSTRAINT wallet_balance_snapshots_last_ledger_entry_id_fkey FOREIGN KEY (last_ledger_entry_id) REFERENCES wallet_ledger_entries(id) ON DELETE SET NULL,
  CONSTRAINT wallet_balance_snapshots_pkey PRIMARY KEY (wallet_account_id),
  CONSTRAINT wallet_balance_snapshots_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT wallet_balance_snapshots_wallet_account_id_fkey FOREIGN KEY (wallet_account_id) REFERENCES wallet_accounts(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.wallet_ledger_entries CASCADE;
CREATE TABLE public.wallet_ledger_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  wallet_account_id UUID NOT NULL,
  direction public.wallet_entry_direction NOT NULL,
  entry_type public.wallet_entry_type NOT NULL,
  status public.wallet_entry_status NOT NULL DEFAULT 'posted'::wallet_entry_status,
  amount NUMERIC(14, 2) NOT NULL,
  currency_code VARCHAR(10) NOT NULL DEFAULT 'INR'::character varying,
  reference_type VARCHAR(80),
  reference_id UUID,
  external_reference VARCHAR(120),
  narrative TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT wallet_ledger_entries_amount_check CHECK (amount > 0::numeric),
  CONSTRAINT wallet_ledger_entries_pkey PRIMARY KEY (id),
  CONSTRAINT wallet_ledger_entries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT wallet_ledger_entries_wallet_account_id_fkey FOREIGN KEY (wallet_account_id) REFERENCES wallet_accounts(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS public.workflow_logs CASCADE;
CREATE TABLE public.workflow_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  workflow_name VARCHAR(120) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id UUID NOT NULL,
  current_step VARCHAR(120) NOT NULL,
  step_status VARCHAR(60) NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  event_id UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT workflow_logs_attempt_number_check CHECK (attempt_number > 0),
  CONSTRAINT workflow_logs_entity_type_check CHECK (entity_type::text = ANY (ARRAY['order_item'::character varying, 'site_order'::character varying, 'substitute_suggestion'::character varying]::text[])),
  CONSTRAINT workflow_logs_event_id_fkey FOREIGN KEY (event_id) REFERENCES system_events(id) ON DELETE SET NULL,
  CONSTRAINT workflow_logs_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ── FUNCTIONS ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.append_workflow_log(target_tenant_id uuid, target_workflow_name text, target_entity_type text, target_entity_id uuid, target_step text, target_step_status text, target_event_id uuid DEFAULT NULL::uuid, target_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  next_attempt INTEGER;
  log_id UUID;
BEGIN
  SELECT COALESCE(MAX(attempt_number), 0) + 1
  INTO next_attempt
  FROM public.workflow_logs wl
  WHERE wl.tenant_id = target_tenant_id
    AND wl.workflow_name = target_workflow_name
    AND wl.entity_type = target_entity_type
    AND wl.entity_id = target_entity_id
    AND wl.current_step = target_step;

  INSERT INTO public.workflow_logs (
    tenant_id,
    workflow_name,
    entity_type,
    entity_id,
    current_step,
    step_status,
    attempt_number,
    event_id,
    notes
  )
  VALUES (
    target_tenant_id,
    target_workflow_name,
    target_entity_type,
    target_entity_id,
    target_step,
    target_step_status,
    next_attempt,
    target_event_id,
    target_notes
  )
  RETURNING id INTO log_id;

  RETURN log_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_order_item_by_customer(target_order_item_id uuid, approve boolean, note_text text DEFAULT NULL::text)
 RETURNS order_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE target_site UUID; next_status public.order_item_status;
BEGIN
  SELECT site_id INTO target_site FROM public.order_items WHERE id = target_order_item_id;
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = target_site AND customer_id = public.current_profile_id()) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  next_status := CASE WHEN approve THEN 'approved_pending_shop_confirmation' ELSE 'rejected_by_customer' END;
  UPDATE public.order_items
  SET customer_notes = COALESCE(note_text, customer_notes),
      customer_reviewed_by = public.current_profile_id(),
      customer_reviewed_at = NOW()
  WHERE id = target_order_item_id;
  RETURN public.record_order_item_status(target_order_item_id, next_status, note_text);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.can_access_project(target_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    LEFT JOIN public.project_members pm
      ON pm.project_id = p.id
      AND pm.user_id = public.current_profile_id()
      AND pm.status = 'active'
    WHERE p.id = target_project_id
      AND (
        public.is_admin_user()
        OR p.customer_id = public.current_profile_id()
        OR p.created_by = public.current_profile_id()
        OR pm.user_id IS NOT NULL
      )
  )
$function$
;

CREATE OR REPLACE FUNCTION public.can_access_project_media(target_media_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_media media
    LEFT JOIN public.project_media_recipients recipient
      ON recipient.media_id = media.id
      AND recipient.recipient_user_id = public.current_profile_id()
    WHERE media.id = target_media_id
      AND (
        public.is_admin_user()
        OR media.uploaded_by = public.current_profile_id()
        OR media.shared_by = public.current_profile_id()
        OR recipient.recipient_user_id IS NOT NULL
        OR (media.visibility = 'project' AND public.can_access_project(media.project_id))
      )
  )
$function$
;

CREATE OR REPLACE FUNCTION public.can_access_site(target_site_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.sites s
    LEFT JOIN public.site_assignments sa ON sa.site_id = s.id AND sa.status = 'active'
    WHERE s.id = target_site_id
      AND (
        public.is_admin_user()
        OR s.customer_id = public.current_profile_id()
        OR sa.user_id = public.current_profile_id()
      )
  )
$function$
;

CREATE OR REPLACE FUNCTION public.can_access_tenant(target_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.tenant_id = target_tenant_id
      AND tm.user_id = public.current_profile_id()
      AND tm.is_active = TRUE
  ) OR public.is_admin_user()
$function$
;

CREATE OR REPLACE FUNCTION public.can_administer_tenant(target_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.tenant_id = target_tenant_id
      AND tm.user_id = public.current_profile_id()
      AND tm.is_active = TRUE
      AND tm.role IN ('owner', 'admin')
  ) OR public.is_admin_user()
$function$
;

CREATE OR REPLACE FUNCTION public.can_manage_site_as_contractor(target_site_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.site_assignments sa
    WHERE sa.site_id = target_site_id
      AND sa.user_id = public.current_profile_id()
      AND sa.status = 'active'
      AND sa.role IN ('electrician', 'architect')
  ) OR public.is_admin_user()
$function$
;

CREATE OR REPLACE FUNCTION public.create_order_item_workflow_event(target_order_item_id uuid, target_event_type text, target_payload jsonb DEFAULT '{}'::jsonb, target_workflow_name text DEFAULT 'order_item_workflow'::text, target_step_name text DEFAULT NULL::text, target_step_status text DEFAULT 'completed'::text, target_notes text DEFAULT NULL::text, target_correlation_id uuid DEFAULT gen_random_uuid(), target_source_module text DEFAULT 'order_workflow'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  item_row public.order_items;
  event_id UUID;
BEGIN
  SELECT *
  INTO item_row
  FROM public.order_items
  WHERE id = target_order_item_id;

  IF item_row.id IS NULL THEN
    RAISE EXCEPTION 'Order item not found';
  END IF;

  IF NOT public.can_access_site(item_row.site_id) AND NOT public.can_administer_tenant(item_row.tenant_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  event_id := public.insert_system_event(
    item_row.tenant_id,
    target_event_type,
    'order_item',
    item_row.id,
    target_payload,
    target_correlation_id,
    target_source_module
  );

  PERFORM public.append_workflow_log(
    item_row.tenant_id,
    target_workflow_name,
    'order_item',
    item_row.id,
    COALESCE(target_step_name, target_event_type),
    target_step_status,
    event_id,
    target_notes
  );

  RETURN event_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_product_request_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    SELECT u.id, 'general', 'New architect product request', LEFT(NEW.title || ': ' || NEW.description, 180), jsonb_build_object('module', 'product_requests', 'site_id', NEW.site_id, 'request_id', NEW.id)
    FROM public.users u WHERE u.role = 'admin';
  ELSIF TG_OP = 'UPDATE' AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes OR NEW.matched_product_id IS DISTINCT FROM OLD.matched_product_id) THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      NEW.requested_by_user_id,
      'general',
      'Product request updated',
      LEFT(COALESCE(NEW.admin_notes, 'Your product request has a new update.'), 180),
      jsonb_build_object('module', 'product_requests', 'site_id', NEW.site_id, 'request_id', NEW.id, 'status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_site_note_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.recipient_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (NEW.recipient_user_id, 'general', 'New note received', LEFT(NEW.note_text, 180), jsonb_build_object('module', 'site_notes', 'site_id', NEW.site_id, 'note_id', NEW.id));
  ELSIF NEW.recipient_role IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    SELECT DISTINCT u.id, 'general', 'New note received', LEFT(NEW.note_text, 180), jsonb_build_object('module', 'site_notes', 'site_id', NEW.site_id, 'note_id', NEW.id)
    FROM public.users u
    LEFT JOIN public.sites s ON s.id = NEW.site_id
    LEFT JOIN public.site_assignments sa ON sa.site_id = NEW.site_id AND sa.status = 'active'
    WHERE u.id <> NEW.sender_user_id
      AND (
        (NEW.recipient_role = 'admin' AND u.role = 'admin')
        OR (NEW.recipient_role = 'customer' AND s.customer_id = u.id)
        OR (NEW.recipient_role = 'electrician' AND sa.role = 'electrician' AND sa.user_id = u.id)
        OR (NEW.recipient_role = 'architect' AND sa.role = 'architect' AND sa.user_id = u.id)
      );
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_user_wallet()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.wallet_accounts (tenant_id, user_id, available_balance)
    VALUES (NEW.default_tenant_id, NEW.id, 0);
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.current_profile_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id
  FROM public.users
  WHERE auth_user_id = auth.uid() OR id = auth.uid()
  ORDER BY CASE WHEN auth_user_id = auth.uid() THEN 0 ELSE 1 END
  LIMIT 1
$function$
;

CREATE OR REPLACE FUNCTION public.current_profile_role()
 RETURNS user_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role FROM public.users WHERE id = public.current_profile_id()
$function$
;

CREATE OR REPLACE FUNCTION public.current_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT default_tenant_id FROM public.users WHERE id = public.current_profile_id()),
    (
      SELECT tm.tenant_id
      FROM public.tenant_memberships tm
      WHERE tm.user_id = public.current_profile_id()
        AND tm.is_default = TRUE
        AND tm.is_active = TRUE
      LIMIT 1
    ),
    (
      SELECT tm.tenant_id
      FROM public.tenant_memberships tm
      WHERE tm.user_id = public.current_profile_id()
        AND tm.is_active = TRUE
      ORDER BY tm.joined_at
      LIMIT 1
    )
  )
$function$
;

CREATE OR REPLACE FUNCTION public.current_tenant_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT tm.tenant_id
  FROM public.tenant_memberships tm
  WHERE tm.user_id = public.current_profile_id()
    AND tm.is_active = TRUE
$function$
;

CREATE OR REPLACE FUNCTION public.demote_admin_to_customer(target_email text)
 RETURNS users
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE updated_user public.users;
BEGIN
  UPDATE public.users SET role = 'customer', updated_at = NOW()
  WHERE LOWER(email) = LOWER(target_email)
  RETURNING * INTO updated_user;
  IF updated_user.id IS NULL THEN RAISE EXCEPTION 'No user found for email %', target_email; END IF;
  RETURN updated_user;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_admin_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE admin_count INTEGER;
BEGIN
  IF NEW.role = 'admin' AND (TG_OP = 'INSERT' OR OLD.role IS DISTINCT FROM 'admin') THEN
    SELECT COUNT(*) INTO admin_count FROM public.users WHERE role = 'admin';
    IF admin_count >= 4 THEN
      RAISE EXCEPTION 'Maximum 4 admin accounts allowed';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_public_user_identity_uniqueness()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  normalized_username text;
  normalized_email text;
  normalized_phone text;
BEGIN
  normalized_username := NULLIF(public.normalize_username(NEW.username), '');
  normalized_email := NULLIF(lower(trim(coalesce(NEW.email, ''))), '');
  normalized_phone := NULLIF(public.normalize_phone(NEW.phone), '');

  IF normalized_username IS NULL THEN
    RAISE EXCEPTION 'Username is required';
  END IF;

  NEW.username := normalized_username;
  NEW.email := normalized_email;
  NEW.phone := normalized_phone;

  IF EXISTS (
    SELECT 1
    FROM public.users
    WHERE lower(username) = normalized_username
      AND id <> COALESCE(NEW.id, gen_random_uuid())
  ) THEN
    RAISE EXCEPTION 'Username already exists';
  END IF;

  IF normalized_email IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.users
    WHERE lower(email) = normalized_email
      AND id <> COALESCE(NEW.id, gen_random_uuid())
  ) THEN
    RAISE EXCEPTION 'Email already exists';
  END IF;

  IF normalized_phone IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.users
    WHERE public.normalize_phone(phone) = normalized_phone
      AND id <> COALESCE(NEW.id, gen_random_uuid())
  ) THEN
    RAISE EXCEPTION 'Phone already exists';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_wallet_account(target_tenant_id uuid, target_user_id uuid)
 RETURNS wallet_accounts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result_row public.wallet_accounts;
BEGIN
  IF NOT (
    public.can_administer_tenant(target_tenant_id)
    OR (
      public.can_access_tenant(target_tenant_id)
      AND target_user_id = public.current_profile_id()
    )
  ) THEN
    RAISE EXCEPTION 'You do not have access to create or view this wallet.';
  END IF;

  -- Protect transaction pool state from breaking if user does not exist
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = target_user_id) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.wallet_accounts (tenant_id, user_id, available_balance)
  VALUES (target_tenant_id, target_user_id, 0.00)
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  SELECT *
  INTO result_row
  FROM public.wallet_accounts
  WHERE tenant_id = target_tenant_id
    AND user_id = target_user_id;

  RETURN result_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_active_partner_incentive_scheme(target_tenant_id uuid, target_partner_type text)
 RETURNS partner_incentive_schemes
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT *
  FROM public.partner_incentive_schemes s
  WHERE s.tenant_id = target_tenant_id
    AND s.status = 'active'
    AND lower(s.partner_type) IN (lower(target_partner_type), 'all')
    AND s.effective_from <= CURRENT_DATE
    AND (s.effective_to IS NULL OR s.effective_to >= CURRENT_DATE)
  ORDER BY CASE WHEN lower(s.partner_type) = lower(target_partner_type) THEN 0 ELSE 1 END, s.effective_from DESC
  LIMIT 1
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_profile()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT to_jsonb(profile_row)
  FROM (
    SELECT
      id,
      auth_user_id,
      full_name,
      email,
      phone,
      role,
      city,
      state,
      company_name,
      verification_status,
      is_admin_verified
    FROM public.users
    WHERE auth_user_id = auth.uid() OR id = auth.uid()
    ORDER BY CASE WHEN auth_user_id = auth.uid() THEN 0 ELSE 1 END
    LIMIT 1
  ) AS profile_row
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  requested_role text;
  safe_role public.user_role;
  matched_user_id uuid;
  target_tenant_id uuid;
  safe_username text;
  membership_role_type text;
BEGIN
  requested_role := lower(coalesce(NEW.raw_user_meta_data ->> 'role', 'customer'));
  
  safe_username := public.make_unique_username(
    COALESCE(
      NULLIF(NEW.raw_user_meta_data ->> 'username', ''),
      NULLIF(split_part(lower(coalesce(NEW.email, '')), '@', 1), ''),
      NULLIF(public.normalize_username(NEW.raw_user_meta_data ->> 'full_name'), ''),
      NULLIF(public.normalize_phone(NEW.phone), ''),
      'user'
    )
  );

  safe_role := CASE
    WHEN requested_role = 'electrician' THEN 'electrician'::public.user_role
    WHEN requested_role = 'architect' THEN 'architect'::public.user_role
    WHEN requested_role = 'supplier' THEN 'supplier'::public.user_role
    WHEN requested_role = 'pop_man' THEN 'pop_man'::public.user_role
    WHEN requested_role = 'carpenter' THEN 'carpenter'::public.user_role
    WHEN requested_role = 'painter' THEN 'painter'::public.user_role
    WHEN requested_role = 'tiles_man' THEN 'tiles_man'::public.user_role
    WHEN requested_role = 'plumber' THEN 'plumber'::public.user_role
    ELSE 'customer'::public.user_role
  END;

  SELECT id
  INTO target_tenant_id
  FROM public.tenants
  WHERE slug = 'mahalaxmi-electricals'
  LIMIT 1;

  SELECT id
  INTO matched_user_id
  FROM public.users
  WHERE auth_user_id IS NULL
    AND (
      (NEW.email IS NOT NULL AND email IS NOT NULL AND lower(email) = lower(NEW.email))
      OR
      (NEW.phone IS NOT NULL AND phone IS NOT NULL AND public.normalize_phone(phone) = public.normalize_phone(NEW.phone))
    )
  ORDER BY created_at
  LIMIT 1;

  IF matched_user_id IS NOT NULL THEN
    UPDATE public.users
    SET
      auth_user_id = NEW.id,
      default_tenant_id = COALESCE(default_tenant_id, target_tenant_id),
      username = COALESCE(NULLIF(username, ''), safe_username),
      email = COALESCE(NULLIF(lower(NEW.email), ''), email),
      phone = COALESCE(NULLIF(public.normalize_phone(NEW.phone), ''), phone),
      full_name = COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), full_name, 'User'),
      role = COALESCE(role, safe_role),
      last_login_at = NEW.last_sign_in_at,
      updated_at = now()
    WHERE id = matched_user_id;
  ELSE
    INSERT INTO public.users (
      auth_user_id,
      default_tenant_id,
      username,
      role,
      full_name,
      phone,
      email,
      status,
      verification_status,
      is_admin_verified,
      last_login_at
    )
    VALUES (
      NEW.id,
      target_tenant_id,
      safe_username,
      safe_role,
      COALESCE(
        NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
        split_part(COALESCE(NULLIF(NEW.email, ''), NULLIF(NEW.phone, ''), 'user'), '@', 1),
        'User'
      ),
      NULLIF(public.normalize_phone(NEW.phone), ''),
      NULLIF(lower(NEW.email), ''),
      'active',
      CASE
        WHEN safe_role = 'customer' THEN 'verified'::public.verification_status
        ELSE 'pending'::public.verification_status
      END,
      CASE
        WHEN safe_role = 'customer' THEN TRUE
        ELSE FALSE
      END,
      NEW.last_sign_in_at
    )
    ON CONFLICT (auth_user_id) DO NOTHING;

    SELECT id
    INTO matched_user_id
    FROM public.users
    WHERE auth_user_id = NEW.id
    LIMIT 1;
  END IF;

  IF matched_user_id IS NOT NULL AND target_tenant_id IS NOT NULL THEN
    SELECT c.udt_name
    INTO membership_role_type
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'tenant_memberships'
      AND c.column_name = 'role'
    LIMIT 1;

    EXECUTE format(
      'INSERT INTO public.tenant_memberships (
         tenant_id, user_id, role, is_default, is_active
       )
       VALUES ($1, $2, $3::public.%I, TRUE, TRUE)
       ON CONFLICT (tenant_id, user_id) DO UPDATE
       SET role = EXCLUDED.role, is_default = TRUE, is_active = TRUE, updated_at = now()',
      COALESCE(membership_role_type, 'user_role')
    )
    USING target_tenant_id, matched_user_id, safe_role::text;
  END IF;

  -- Process referral if provided in raw_user_meta_data
  IF matched_user_id IS NOT NULL AND target_tenant_id IS NOT NULL THEN
    DECLARE
      ref_code_text text;
      ref_code_row record;
      ref_program_row record;
      ref_event_id uuid;
      ref_reward_id uuid;
      ref_referrer_wallet record;
      ref_ledger_id uuid;
      ref_next_balance numeric(14,2);
    BEGIN
      ref_code_text := NEW.raw_user_meta_data ->> 'referral_code';
      IF ref_code_text IS NOT NULL AND ref_code_text <> '' THEN
        -- Find active referral code
        SELECT * INTO ref_code_row
        FROM public.referral_codes
        WHERE tenant_id = target_tenant_id
          AND lower(code) = lower(trim(ref_code_text))
          AND is_active = true
        LIMIT 1;

        -- Make sure code is found and is not referring self
        IF ref_code_row.id IS NOT NULL AND ref_code_row.user_id <> matched_user_id THEN
          -- Find active referral program for signup
          SELECT * INTO ref_program_row
          FROM public.referral_programs
          WHERE tenant_id = target_tenant_id
            AND trigger_event = 'signup'
            AND status = 'active'
          LIMIT 1;

          -- Create referral event
          ref_event_id := gen_random_uuid();
          INSERT INTO public.referral_events (
            id, tenant_id, referral_program_id, referral_code_id,
            referrer_user_id, referred_user_id, trigger_event,
            created_at
          )
          VALUES (
            ref_event_id, target_tenant_id, ref_program_row.id, ref_code_row.id,
            ref_code_row.user_id, matched_user_id, 'signup',
            now()
          );

          -- Create referral reward for referrer
          ref_reward_id := gen_random_uuid();
          INSERT INTO public.referral_rewards (
            id, tenant_id, referral_event_id, beneficiary_user_id,
            reward_amount, reward_status, created_at
          )
          VALUES (
            ref_reward_id, target_tenant_id, ref_event_id, ref_code_row.user_id,
            COALESCE(ref_program_row.referrer_reward_amount, 100.00), 'credited', now()
          );

          -- Ensure referrer has a wallet
          ref_referrer_wallet := public.ensure_wallet_account(target_tenant_id, ref_code_row.user_id);

          -- Credit points/amount to referrer's wallet
          IF ref_referrer_wallet.id IS NOT NULL THEN
            ref_ledger_id := gen_random_uuid();
            INSERT INTO public.wallet_ledger_entries (
              id, tenant_id, wallet_account_id, direction, entry_type,
              status, amount, currency_code, reference_type, reference_id,
              narrative, created_at
            )
            VALUES (
              ref_ledger_id, target_tenant_id, ref_referrer_wallet.id, 'credit', 'referral_reward',
              'posted', COALESCE(ref_program_row.referrer_reward_amount, 100.00), ref_referrer_wallet.currency_code,
              'referral_reward', ref_reward_id, 'Referral signup reward credited.', now()
            );

            -- Update balance snapshots to avoid drift
            ref_next_balance := COALESCE(ref_referrer_wallet.available_balance, 0.00) + COALESCE(ref_program_row.referrer_reward_amount, 100.00);
            INSERT INTO public.wallet_balance_snapshots (
              wallet_account_id,
              tenant_id,
              last_ledger_entry_id,
              available_balance,
              calculated_at
            )
            VALUES (
              ref_referrer_wallet.id,
              target_tenant_id,
              ref_ledger_id,
              ref_next_balance,
              now()
            )
            ON CONFLICT (wallet_account_id) DO UPDATE
            SET
              last_ledger_entry_id = EXCLUDED.last_ledger_entry_id,
              available_balance = EXCLUDED.available_balance,
              calculated_at = EXCLUDED.calculated_at;
          END IF;

          -- Create referral reward for referred user (if program has referred_reward_amount > 0)
          IF ref_program_row.id IS NOT NULL AND COALESCE(ref_program_row.referred_reward_amount, 0.00) > 0.00 THEN
            DECLARE
              ref_referred_reward_id uuid;
              ref_referred_wallet record;
              ref_referred_ledger_id uuid;
              ref_referred_next_balance numeric(14,2);
            BEGIN
              ref_referred_reward_id := gen_random_uuid();
              INSERT INTO public.referral_rewards (
                id, tenant_id, referral_event_id, beneficiary_user_id,
                reward_amount, reward_status, created_at
              )
              VALUES (
                ref_referred_reward_id, target_tenant_id, ref_event_id, matched_user_id,
                ref_program_row.referred_reward_amount, 'credited', now()
              );

              -- Ensure referred user has a wallet
              ref_referred_wallet := public.ensure_wallet_account(target_tenant_id, matched_user_id);

              IF ref_referred_wallet.id IS NOT NULL THEN
                ref_referred_ledger_id := gen_random_uuid();
                INSERT INTO public.wallet_ledger_entries (
                  id, tenant_id, wallet_account_id, direction, entry_type,
                  status, amount, currency_code, reference_type, reference_id,
                  narrative, created_at
                )
                VALUES (
                  ref_referred_ledger_id, target_tenant_id, ref_referred_wallet.id, 'credit', 'referral_reward',
                  'posted', ref_program_row.referred_reward_amount, ref_referred_wallet.currency_code,
                  'referral_reward', ref_referred_reward_id, 'Referral signup welcome reward credited.', now()
                );

                ref_referred_next_balance := COALESCE(ref_referred_wallet.available_balance, 0.00) + ref_program_row.referred_reward_amount;
                INSERT INTO public.wallet_balance_snapshots (
                  wallet_account_id,
                  tenant_id,
                  last_ledger_entry_id,
                  available_balance,
                  calculated_at
                )
                VALUES (
                  ref_referred_wallet.id,
                  target_tenant_id,
                  ref_referred_ledger_id,
                  ref_referred_next_balance,
                  now()
                )
                ON CONFLICT (wallet_account_id) DO UPDATE
                SET
                  last_ledger_entry_id = EXCLUDED.last_ledger_entry_id,
                  available_balance = EXCLUDED.available_balance,
                  calculated_at = EXCLUDED.calculated_at;
              END IF;
            END;
          END IF;
        END IF;
      END IF;
    END;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user_wallet()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  target_tenant_id uuid;
BEGIN
  target_tenant_id := COALESCE(
    NEW.default_tenant_id,
    (SELECT id FROM public.tenants WHERE slug = 'mahalaxmi-electricals' LIMIT 1)
  );

  IF target_tenant_id IS NOT NULL THEN
    INSERT INTO public.wallet_accounts (tenant_id, user_id, available_balance, currency_code)
    VALUES (target_tenant_id, NEW.id, 0.00, 'INR')
    ON CONFLICT (tenant_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_partner_incentive_order_item_supplied()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'supplied' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.process_partner_incentives_for_order_item(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_wallet_ledger_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.direction = 'credit' THEN
        UPDATE public.wallet_accounts
        SET 
            available_balance = available_balance + NEW.amount,
            lifetime_credited = lifetime_credited + NEW.amount,
            updated_at = NOW()
        WHERE id = NEW.wallet_account_id;
    ELSIF NEW.direction = 'debit' THEN
        UPDATE public.wallet_accounts
        SET 
            available_balance = available_balance - NEW.amount,
            lifetime_debited = lifetime_debited + NEW.amount,
            updated_at = NOW()
        WHERE id = NEW.wallet_account_id;
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.insert_system_event(target_tenant_id uuid, target_event_type text, target_entity_type text, target_entity_id uuid, target_payload jsonb DEFAULT '{}'::jsonb, target_correlation_id uuid DEFAULT gen_random_uuid(), target_source_module text DEFAULT 'order_workflow'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  event_id UUID;
BEGIN
  INSERT INTO public.system_events (
    tenant_id,
    event_type,
    entity_type,
    entity_id,
    actor_user_id,
    correlation_id,
    source_module,
    payload
  )
  VALUES (
    target_tenant_id,
    target_event_type,
    target_entity_type,
    target_entity_id,
    public.current_profile_id(),
    target_correlation_id,
    target_source_module,
    COALESCE(target_payload, '{}'::jsonb)
  )
  RETURNING id INTO event_id;

  RETURN event_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(public.current_profile_role() = 'admin', FALSE)
$function$
;

CREATE OR REPLACE FUNCTION public.make_unique_username(base_username text, current_user_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  sanitized_base text;
  candidate text;
  suffix integer := 0;
BEGIN
  sanitized_base := NULLIF(public.normalize_username(base_username), '');

  IF sanitized_base IS NULL THEN
    sanitized_base := 'user';
  END IF;

  IF length(sanitized_base) < 3 THEN
    sanitized_base := rpad(sanitized_base, 3, 'x');
  END IF;

  LOOP
    candidate := CASE
      WHEN suffix = 0 THEN sanitized_base
      ELSE left(sanitized_base, greatest(1, 24 - length(suffix::text) - 1)) || '_' || suffix::text
    END;

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.users
      WHERE lower(coalesce(username, '')) = lower(candidate)
        AND (current_user_id IS NULL OR id <> current_user_id)
    );

    suffix := suffix + 1;
  END LOOP;

  RETURN candidate;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.manage_inventory_on_supply()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.status = 'supplied' AND (OLD.status IS NULL OR OLD.status != 'supplied') THEN
        UPDATE public.product_inventory
        SET 
            available_qty = available_qty - NEW.quantity_supplied,
            updated_at = NOW()
        WHERE product_id = NEW.product_id;
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_order_item_supplied(target_order_item_id uuid, supplied_qty numeric, note_text text DEFAULT NULL::text)
 RETURNS order_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_required NUMERIC;
  current_supplied NUMERIC;
  new_total NUMERIC;
  next_status public.order_item_status;
  item_product_id UUID;
BEGIN
  IF NOT public.is_admin_user() AND public.current_profile_role() != 'supplier'::public.user_role THEN
    RAISE EXCEPTION 'Only admin or supplier can mark supply';
  END IF;

  SELECT quantity_required, quantity_supplied, product_id
  INTO current_required, current_supplied, item_product_id
  FROM public.order_items
  WHERE id = target_order_item_id;

  new_total := COALESCE(current_supplied, 0) + COALESCE(supplied_qty, 0);
  next_status := CASE WHEN new_total >= current_required THEN 'supplied' ELSE 'partially_supplied' END;
  
  UPDATE public.order_items
  SET quantity_supplied = LEAST(new_total, current_required),
      supplied_by = public.current_profile_id(),
      supplied_at = NOW(),
      admin_notes = COALESCE(note_text, admin_notes),
      shop_confirmed_by = COALESCE(shop_confirmed_by, public.current_profile_id()),
      shop_confirmed_at = COALESCE(shop_confirmed_at, NOW())
  WHERE id = target_order_item_id;

  -- Deduct from inventory
  UPDATE public.product_inventory
  SET available_qty = GREATEST(available_qty - COALESCE(supplied_qty, 0), 0),
      reserved_qty = GREATEST(reserved_qty - COALESCE(supplied_qty, 0), 0)
  WHERE product_id = item_product_id;

  RETURN public.record_order_item_status(target_order_item_id, next_status, note_text);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_order_supply_progress(target_order_item_id uuid, supplied_qty numeric, note_text text DEFAULT NULL::text)
 RETURNS order_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  item_row public.order_items;
  new_total NUMERIC;
  transition_key TEXT;
BEGIN
  SELECT *
  INTO item_row
  FROM public.order_items
  WHERE id = target_order_item_id;

  IF item_row.id IS NULL THEN
    RAISE EXCEPTION 'Order item not found';
  END IF;

  IF supplied_qty IS NULL OR supplied_qty <= 0 THEN
    RAISE EXCEPTION 'Supplied quantity must be greater than zero';
  END IF;

  IF NOT public.can_administer_tenant(item_row.tenant_id) AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Only admin can mark supply';
  END IF;

  new_total := LEAST(COALESCE(item_row.quantity_supplied, 0) + supplied_qty, item_row.quantity_required);
  transition_key := CASE
    WHEN new_total >= item_row.quantity_required THEN 'record_full_supply'
    ELSE 'record_partial_supply'
  END;

  RETURN public.transition_order_item(
    target_order_item_id,
    transition_key,
    note_text,
    jsonb_build_object(
      'supplied_increment', supplied_qty,
      'new_total_supplied', new_total,
      'quantity_required', item_row.quantity_required
    ),
    'supply_workflow'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_phone(raw_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT regexp_replace(coalesce(raw_value, ''), '[^0-9+]+', '', 'g')
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_username(raw_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT left(
    regexp_replace(lower(coalesce(raw_value, '')), '[^a-z0-9._]+', '', 'g'),
    24
  )
$function$
;

CREATE OR REPLACE FUNCTION public.order_workflow_actor_scope(target_site_id uuid, target_tenant_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.can_administer_tenant(target_tenant_id) OR public.is_admin_user() THEN
    RETURN 'admin';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sites s
    WHERE s.id = target_site_id
      AND s.customer_id = public.current_profile_id()
  ) THEN
    RETURN 'customer';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.site_assignments sa
    WHERE sa.site_id = target_site_id
      AND sa.user_id = public.current_profile_id()
      AND sa.status = 'active'
      AND sa.role = 'architect'
  ) THEN
    RETURN 'architect';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.site_assignments sa
    WHERE sa.site_id = target_site_id
      AND sa.user_id = public.current_profile_id()
      AND sa.status = 'active'
      AND sa.role = 'electrician'
  ) THEN
    RETURN 'electrician';
  END IF;

  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pay_savings_installment(target_installment_id uuid, payment_amount numeric DEFAULT NULL::numeric, note_text text DEFAULT NULL::text)
 RETURNS savings_installments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  installment_row public.savings_installments;
  subscription_row public.savings_plan_subscriptions;
  wallet_row public.wallet_accounts;
  contribution_entry public.wallet_ledger_entries;
  bonus_entry public.wallet_ledger_entries;
  remaining_amount NUMERIC(14,2);
  final_payment_amount NUMERIC(14,2);
BEGIN
  SELECT *
  INTO installment_row
  FROM public.savings_installments
  WHERE id = target_installment_id
  FOR UPDATE;

  IF installment_row.id IS NULL THEN
    RAISE EXCEPTION 'Installment not found.';
  END IF;

  SELECT *
  INTO subscription_row
  FROM public.savings_plan_subscriptions
  WHERE id = installment_row.subscription_id
  FOR UPDATE;

  IF NOT (
    public.can_administer_tenant(subscription_row.tenant_id)
    OR subscription_row.user_id = public.current_profile_id()
  ) THEN
    RAISE EXCEPTION 'You do not have permission to pay this installment.';
  END IF;

  IF installment_row.status NOT IN ('pending', 'late') THEN
    RAISE EXCEPTION 'Only pending or late installments can be paid.';
  END IF;

  remaining_amount := installment_row.expected_amount - installment_row.paid_amount;
  final_payment_amount := COALESCE(payment_amount, remaining_amount);

  IF final_payment_amount <= 0 OR final_payment_amount > remaining_amount THEN
    RAISE EXCEPTION 'Invalid installment payment amount.';
  END IF;

  SELECT *
  INTO wallet_row
  FROM public.wallet_accounts
  WHERE id = subscription_row.wallet_account_id
  FOR UPDATE;

  IF wallet_row.id IS NULL THEN
    RAISE EXCEPTION 'Wallet account not found for subscription.';
  END IF;

  INSERT INTO public.wallet_ledger_entries (
    tenant_id,
    wallet_account_id,
    direction,
    entry_type,
    status,
    amount,
    currency_code,
    reference_type,
    reference_id,
    narrative,
    created_by
  )
  VALUES (
    subscription_row.tenant_id,
    wallet_row.id,
    'credit',
    'savings_contribution',
    'posted',
    final_payment_amount,
    wallet_row.currency_code,
    'savings_installment',
    installment_row.id,
    COALESCE(note_text, format('Savings installment %s contribution', installment_row.installment_number)),
    public.current_profile_id()
  )
  RETURNING *
  INTO contribution_entry;

  UPDATE public.wallet_accounts
  SET
    available_balance = available_balance + final_payment_amount,
    lifetime_credited = lifetime_credited + final_payment_amount,
    updated_at = NOW()
  WHERE id = wallet_row.id;

  INSERT INTO public.wallet_balance_snapshots (
    wallet_account_id,
    tenant_id,
    last_ledger_entry_id,
    available_balance,
    calculated_at
  )
  VALUES (
    wallet_row.id,
    subscription_row.tenant_id,
    contribution_entry.id,
    wallet_row.available_balance + final_payment_amount,
    NOW()
  )
  ON CONFLICT (wallet_account_id) DO UPDATE
  SET
    tenant_id = EXCLUDED.tenant_id,
    last_ledger_entry_id = EXCLUDED.last_ledger_entry_id,
    available_balance = EXCLUDED.available_balance,
    calculated_at = EXCLUDED.calculated_at;

  UPDATE public.savings_installments
  SET
    paid_amount = paid_amount + final_payment_amount,
    paid_at = CASE WHEN paid_amount + final_payment_amount >= expected_amount THEN NOW() ELSE paid_at END,
    status = CASE WHEN paid_amount + final_payment_amount >= expected_amount THEN 'paid' ELSE status END,
    wallet_ledger_entry_id = contribution_entry.id,
    updated_at = NOW()
  WHERE id = installment_row.id
  RETURNING *
  INTO installment_row;

  IF NOT EXISTS (
    SELECT 1
    FROM public.savings_installments si
    WHERE si.subscription_id = subscription_row.id
      AND si.status NOT IN ('paid', 'waived', 'cancelled')
  ) THEN
    UPDATE public.savings_plan_subscriptions
    SET
      status = 'completed',
      completed_at = COALESCE(completed_at, NOW()),
      updated_at = NOW()
    WHERE id = subscription_row.id;

    IF subscription_row.maturity_bonus_amount > 0
       AND NOT EXISTS (
         SELECT 1
         FROM public.wallet_ledger_entries wle
         WHERE wle.reference_type = 'savings_subscription_bonus'
           AND wle.reference_id = subscription_row.id
           AND wle.entry_type = 'savings_bonus'
       )
    THEN
      INSERT INTO public.wallet_ledger_entries (
        tenant_id,
        wallet_account_id,
        direction,
        entry_type,
        status,
        amount,
        currency_code,
        reference_type,
        reference_id,
        narrative,
        created_by
      )
      VALUES (
        subscription_row.tenant_id,
        wallet_row.id,
        'credit',
        'savings_bonus',
        'posted',
        subscription_row.maturity_bonus_amount,
        wallet_row.currency_code,
        'savings_subscription_bonus',
        subscription_row.id,
        format('Maturity bonus for subscription %s', subscription_row.subscription_number),
        public.current_profile_id()
      )
      RETURNING *
      INTO bonus_entry;

      UPDATE public.wallet_accounts
      SET
        available_balance = available_balance + subscription_row.maturity_bonus_amount,
        lifetime_credited = lifetime_credited + subscription_row.maturity_bonus_amount,
        updated_at = NOW()
      WHERE id = wallet_row.id;

      UPDATE public.wallet_balance_snapshots
      SET
        last_ledger_entry_id = bonus_entry.id,
        available_balance = available_balance + subscription_row.maturity_bonus_amount,
        calculated_at = NOW()
      WHERE wallet_account_id = wallet_row.id;
    END IF;
  END IF;

  RETURN installment_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.post_wallet_entry(target_tenant_id uuid, target_wallet_account_id uuid, target_direction wallet_entry_direction, target_entry_type wallet_entry_type, target_amount numeric, target_narrative text DEFAULT NULL::text, target_reference_type character varying DEFAULT NULL::character varying, target_reference_id uuid DEFAULT NULL::uuid, target_external_reference character varying DEFAULT NULL::character varying)
 RETURNS wallet_ledger_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  wallet_row public.wallet_accounts;
  ledger_row public.wallet_ledger_entries;
  next_available_balance NUMERIC(14,2);
BEGIN
  IF NOT public.can_administer_tenant(target_tenant_id) THEN
    RAISE EXCEPTION 'Only tenant admins can post wallet entries directly.';
  END IF;

  IF COALESCE(target_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Wallet entry amount must be greater than zero.';
  END IF;

  SELECT *
  INTO wallet_row
  FROM public.wallet_accounts
  WHERE id = target_wallet_account_id
    AND tenant_id = target_tenant_id
  FOR UPDATE;

  IF wallet_row.id IS NULL THEN
    RAISE EXCEPTION 'Wallet account not found for this tenant.';
  END IF;

  next_available_balance := wallet_row.available_balance
    + CASE WHEN target_direction = 'credit' THEN target_amount ELSE -target_amount END;

  IF next_available_balance < 0 THEN
    RAISE EXCEPTION 'Wallet debit would make the balance negative.';
  END IF;

  INSERT INTO public.wallet_ledger_entries (
    tenant_id,
    wallet_account_id,
    direction,
    entry_type,
    status,
    amount,
    currency_code,
    reference_type,
    reference_id,
    external_reference,
    narrative,
    created_by
  )
  VALUES (
    target_tenant_id,
    target_wallet_account_id,
    target_direction,
    target_entry_type,
    'posted',
    target_amount,
    wallet_row.currency_code,
    target_reference_type,
    target_reference_id,
    target_external_reference,
    target_narrative,
    public.current_profile_id()
  )
  RETURNING *
  INTO ledger_row;

  UPDATE public.wallet_accounts
  SET
    available_balance = next_available_balance,
    lifetime_credited = lifetime_credited + CASE WHEN target_direction = 'credit' THEN target_amount ELSE 0 END,
    lifetime_debited = lifetime_debited + CASE WHEN target_direction = 'debit' THEN target_amount ELSE 0 END,
    updated_at = NOW()
  WHERE id = target_wallet_account_id;

  INSERT INTO public.wallet_balance_snapshots (
    wallet_account_id,
    tenant_id,
    last_ledger_entry_id,
    available_balance,
    calculated_at
  )
  VALUES (
    target_wallet_account_id,
    target_tenant_id,
    ledger_row.id,
    next_available_balance,
    NOW()
  )
  ON CONFLICT (wallet_account_id) DO UPDATE
  SET
    tenant_id = EXCLUDED.tenant_id,
    last_ledger_entry_id = EXCLUDED.last_ledger_entry_id,
    available_balance = EXCLUDED.available_balance,
    calculated_at = EXCLUDED.calculated_at;

  RETURN ledger_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_partner_incentives_for_order_item(target_order_item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  item RECORD;
  partner RECORD;
  scheme public.partner_incentive_schemes;
  current_slab public.partner_incentive_slabs;
  previous_slab_id UUID;
  v_business_year INTEGER;
  v_business_amount NUMERIC(14,2);
  v_category_commission_type TEXT;
  v_commission_percent NUMERIC(6,3);
  v_commission_amount NUMERIC(14,2);
  summary_row public.partner_business_summary;
  v_idempotency_key TEXT;
BEGIN
  SELECT
    oi.id,
    oi.site_order_id,
    oi.tenant_id,
    oi.line_total,
    oi.quantity_supplied,
    oi.quantity_required,
    oi.supplied_at,
    so.architect_id,
    so.electrician_id,
    pc.commission_type
  INTO item
  FROM public.order_items oi
  JOIN public.site_orders so ON so.id = oi.site_order_id
  JOIN public.products p ON p.id = oi.product_id
  JOIN public.product_categories pc ON pc.id = p.category_id
  WHERE oi.id = target_order_item_id
    AND oi.status = 'supplied';

  IF item.id IS NULL THEN
    RETURN;
  END IF;

  v_business_year := EXTRACT(YEAR FROM COALESCE(item.supplied_at, NOW()))::INTEGER;
  v_business_amount := COALESCE(item.line_total, 0);
  v_category_commission_type := COALESCE(item.commission_type, 'OTHER');

  FOR partner IN
    SELECT DISTINCT u.id, u.role::text AS partner_type
    FROM public.users u
    WHERE u.id IN (item.architect_id, item.electrician_id)
      AND u.role::text NOT IN ('admin', 'customer', 'supplier')
  LOOP
    scheme := public.get_active_partner_incentive_scheme(item.tenant_id, partner.partner_type);
    IF scheme.id IS NULL THEN
      CONTINUE;
    END IF;

    v_idempotency_key := 'order_item:' || item.id::text || ':partner:' || partner.id::text;
    IF EXISTS (SELECT 1 FROM public.partner_commission_ledger pcl WHERE pcl.tenant_id = item.tenant_id AND pcl.idempotency_key = v_idempotency_key) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.partner_business_summary (tenant_id, partner_id, scheme_id, business_year)
    VALUES (item.tenant_id, partner.id, scheme.id, v_business_year)
    ON CONFLICT (tenant_id, partner_id, business_year) DO NOTHING;

    SELECT current_slab_id INTO previous_slab_id
    FROM public.partner_business_summary
    WHERE tenant_id = item.tenant_id AND partner_id = partner.id AND partner_business_summary.business_year = v_business_year;

    UPDATE public.partner_business_summary
    SET
      scheme_id = scheme.id,
      wire_business = wire_business + CASE WHEN v_category_commission_type = 'WIRE' THEN v_business_amount ELSE 0 END,
      other_business = other_business + CASE WHEN v_category_commission_type = 'OTHER' THEN v_business_amount ELSE 0 END,
      total_business = total_business + v_business_amount,
      updated_at = NOW()
    WHERE tenant_id = item.tenant_id AND partner_id = partner.id AND partner_business_summary.business_year = v_business_year
    RETURNING * INTO summary_row;

    SELECT * INTO current_slab
    FROM public.partner_incentive_slabs s
    WHERE s.scheme_id = scheme.id
      AND s.is_active = TRUE
      AND summary_row.total_business >= s.min_business
      AND (s.max_business IS NULL OR summary_row.total_business < s.max_business)
    ORDER BY s.min_business DESC
    LIMIT 1;

    IF current_slab.id IS NULL THEN
      CONTINUE;
    END IF;

    v_commission_percent := CASE WHEN v_category_commission_type = 'WIRE' THEN current_slab.wire_commission_percent ELSE current_slab.other_commission_percent END;
    v_commission_amount := ROUND((v_business_amount * v_commission_percent / 100)::numeric, 2);

    INSERT INTO public.partner_commission_ledger (
      tenant_id, partner_id, scheme_id, slab_id, site_order_id, order_item_id, entry_type,
      commission_type, business_amount, commission_percent, commission_amount, points, description, idempotency_key
    ) VALUES (
      item.tenant_id, partner.id, scheme.id, current_slab.id, item.site_order_id, item.id, 'commission',
      v_category_commission_type, v_business_amount, v_commission_percent, v_commission_amount, 0,
      'Commission for supplied order item', v_idempotency_key
    );

    UPDATE public.partner_business_summary
    SET current_slab_id = current_slab.id,
        commission_earned = commission_earned + v_commission_amount,
        updated_at = NOW()
    WHERE id = summary_row.id;

    IF previous_slab_id IS DISTINCT FROM current_slab.id THEN
      INSERT INTO public.partner_slab_history (
        tenant_id, partner_id, scheme_id, from_slab_id, to_slab_id, business_year, business_amount, bonus_points_awarded
      ) VALUES (
        item.tenant_id, partner.id, scheme.id, previous_slab_id, current_slab.id, v_business_year, summary_row.total_business, current_slab.bonus_points
      ) ON CONFLICT (tenant_id, partner_id, scheme_id, to_slab_id, business_year) DO NOTHING;

      IF FOUND AND current_slab.bonus_points > 0 THEN
        INSERT INTO public.partner_commission_ledger (
          tenant_id, partner_id, scheme_id, slab_id, site_order_id, order_item_id, entry_type,
          business_amount, commission_percent, commission_amount, points, description, idempotency_key
        ) VALUES (
          item.tenant_id, partner.id, scheme.id, current_slab.id, item.site_order_id, item.id, 'bonus_points',
          0, 0, 0, current_slab.bonus_points, 'Tier bonus awarded: ' || current_slab.tier_name,
          'bonus:' || scheme.id::text || ':' || current_slab.id::text || ':' || partner.id::text || ':' || v_business_year::text
        ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;

        INSERT INTO public.partner_points_wallet (tenant_id, partner_id, points_balance, lifetime_points)
        VALUES (item.tenant_id, partner.id, current_slab.bonus_points, current_slab.bonus_points)
        ON CONFLICT (tenant_id, partner_id) DO UPDATE
        SET points_balance = public.partner_points_wallet.points_balance + EXCLUDED.points_balance,
            lifetime_points = public.partner_points_wallet.lifetime_points + EXCLUDED.lifetime_points,
            updated_at = NOW();

        UPDATE public.partner_business_summary
        SET bonus_points_earned = bonus_points_earned + current_slab.bonus_points,
            updated_at = NOW()
        WHERE id = summary_row.id;
      END IF;

      INSERT INTO public.notifications (tenant_id, user_id, type, title, body, data)
      VALUES (
        item.tenant_id,
        partner.id,
        'general',
        'Partner tier updated',
        'You are now in ' || current_slab.tier_name || ' tier. Bonus points: ' || current_slab.bonus_points::text,
        jsonb_build_object('module', 'partner_incentives', 'scheme_id', scheme.id, 'slab_id', current_slab.id, 'business_year', v_business_year)
      );
    END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.promote_user_to_admin(target_email text)
 RETURNS users
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE updated_user public.users;
BEGIN
  UPDATE public.users
  SET role = 'admin', is_admin_verified = TRUE, verification_status = 'verified', updated_at = NOW()
  WHERE LOWER(email) = LOWER(target_email)
  RETURNING * INTO updated_user;
  IF updated_user.id IS NULL THEN RAISE EXCEPTION 'No user found for email %', target_email; END IF;
  RETURN updated_user;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_order_item_status(target_order_item_id uuid, next_status order_item_status, reason_text text DEFAULT NULL::text)
 RETURNS order_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE updated_item public.order_items; previous_status public.order_item_status;
BEGIN
  SELECT status INTO previous_status FROM public.order_items WHERE id = target_order_item_id;
  UPDATE public.order_items SET status = next_status, updated_at = NOW() WHERE id = target_order_item_id RETURNING * INTO updated_item;
  INSERT INTO public.order_item_status_history (order_item_id, from_status, to_status, changed_by, change_reason)
  VALUES (target_order_item_id, previous_status, next_status, public.current_profile_id(), reason_text);
  RETURN updated_item;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_referral_reward(target_reward_id uuid, approve_reward boolean DEFAULT true, note_text text DEFAULT NULL::text)
 RETURNS referral_rewards
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  reward_row public.referral_rewards;
  wallet_row public.wallet_accounts;
  reward_entry public.wallet_ledger_entries;
BEGIN
  SELECT *
  INTO reward_row
  FROM public.referral_rewards
  WHERE id = target_reward_id
  FOR UPDATE;

  IF reward_row.id IS NULL THEN
    RAISE EXCEPTION 'Referral reward not found.';
  END IF;

  IF NOT public.can_administer_tenant(reward_row.tenant_id) THEN
    RAISE EXCEPTION 'Only tenant admins can resolve referral rewards.';
  END IF;

  IF reward_row.reward_status NOT IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'Only pending or approved rewards can be resolved.';
  END IF;

  IF NOT approve_reward THEN
    UPDATE public.referral_rewards
    SET reward_status = 'rejected', decision_notes = note_text, updated_at = NOW()
    WHERE id = reward_row.id
    RETURNING *
    INTO reward_row;

    RETURN reward_row;
  END IF;

  wallet_row := public.ensure_wallet_account(reward_row.tenant_id, reward_row.beneficiary_user_id);

  IF reward_row.reward_amount > 0 THEN
    INSERT INTO public.wallet_ledger_entries (
      tenant_id,
      wallet_account_id,
      direction,
      entry_type,
      status,
      amount,
      currency_code,
      reference_type,
      reference_id,
      narrative,
      created_by
    )
    VALUES (
      reward_row.tenant_id,
      wallet_row.id,
      'credit',
      'referral_reward',
      'posted',
      reward_row.reward_amount,
      wallet_row.currency_code,
      'referral_reward',
      reward_row.id,
      COALESCE(note_text, 'Referral reward approved and credited.'),
      public.current_profile_id()
    )
    RETURNING *
    INTO reward_entry;

    UPDATE public.wallet_accounts
    SET
      available_balance = available_balance + reward_row.reward_amount,
      lifetime_credited = lifetime_credited + reward_row.reward_amount,
      updated_at = NOW()
    WHERE id = wallet_row.id;

    INSERT INTO public.wallet_balance_snapshots (
      wallet_account_id,
      tenant_id,
      last_ledger_entry_id,
      available_balance,
      calculated_at
    )
    VALUES (
      wallet_row.id,
      reward_row.tenant_id,
      reward_entry.id,
      wallet_row.available_balance + reward_row.reward_amount,
      NOW()
    )
    ON CONFLICT (wallet_account_id) DO UPDATE
    SET
      tenant_id = EXCLUDED.tenant_id,
      last_ledger_entry_id = EXCLUDED.last_ledger_entry_id,
      available_balance = EXCLUDED.available_balance,
      calculated_at = EXCLUDED.calculated_at;
  END IF;

  UPDATE public.referral_rewards
  SET
    wallet_account_id = wallet_row.id,
    wallet_ledger_entry_id = reward_entry.id,
    reward_status = CASE WHEN reward_row.reward_amount > 0 THEN 'credited' ELSE 'approved' END,
    decision_notes = note_text,
    updated_at = NOW()
  WHERE id = reward_row.id
  RETURNING *
  INTO reward_row;

  RETURN reward_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_substitute_workflow(suggestion_id uuid, accept_choice boolean, note_text text DEFAULT NULL::text)
 RETURNS substitute_suggestions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result_row public.substitute_suggestions;
  item_row public.order_items;
  transition_key TEXT;
  final_note TEXT;
  event_id UUID;
BEGIN
  UPDATE public.substitute_suggestions
  SET
    status = CASE WHEN accept_choice THEN 'accepted' ELSE 'rejected' END,
    customer_response_at = NOW(),
    updated_at = NOW()
  WHERE id = suggestion_id
    AND customer_id = public.current_profile_id()
  RETURNING * INTO result_row;

  IF result_row.id IS NULL THEN
    RAISE EXCEPTION 'Not allowed or suggestion not found';
  END IF;

  SELECT *
  INTO item_row
  FROM public.order_items
  WHERE id = result_row.original_order_item_id;

  transition_key := CASE WHEN accept_choice THEN 'accept_substitute' ELSE 'reject_substitute' END;
  final_note := COALESCE(
    note_text,
    CASE
      WHEN accept_choice THEN 'Customer accepted substitute'
      ELSE 'Customer rejected substitute'
    END
  );

  PERFORM public.transition_order_item(
    result_row.original_order_item_id,
    transition_key,
    final_note,
    jsonb_build_object(
      'suggestion_id', result_row.id,
      'suggested_product_id', result_row.suggested_product_id,
      'substitute_status', result_row.status
    ),
    'substitute_workflow'
  );

  event_id := public.insert_system_event(
    item_row.tenant_id,
    'substitute_workflow_resolved',
    'substitute_suggestion',
    result_row.id,
    jsonb_build_object(
      'original_order_item_id', result_row.original_order_item_id,
      'accepted', accept_choice
    ),
    gen_random_uuid(),
    'substitute_workflow'
  );

  PERFORM public.append_workflow_log(
    item_row.tenant_id,
    'substitute_workflow',
    'substitute_suggestion',
    result_row.id,
    'transition_key',
    'completed',
    event_id,
    final_note
  );

  RETURN result_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.respond_to_substitute(suggestion_id uuid, accept_choice boolean)
 RETURNS substitute_suggestions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result_row public.substitute_suggestions; original_item UUID; previous_status public.order_item_status; next_status public.order_item_status;
BEGIN
  UPDATE public.substitute_suggestions
  SET status = CASE WHEN accept_choice THEN 'accepted' ELSE 'rejected' END,
      customer_response_at = NOW(),
      updated_at = NOW()
  WHERE id = suggestion_id AND customer_id = public.current_profile_id()
  RETURNING * INTO result_row;

  IF result_row.id IS NULL THEN
    RAISE EXCEPTION 'Not allowed or suggestion not found';
  END IF;

  original_item := result_row.original_order_item_id;
  SELECT status INTO previous_status FROM public.order_items WHERE id = original_item;
  next_status := CASE WHEN accept_choice THEN 'approved_pending_shop_confirmation' ELSE 'substitute_rejected' END;

  UPDATE public.order_items
  SET status = next_status,
      customer_reviewed_by = public.current_profile_id(),
      customer_reviewed_at = NOW(),
      updated_at = NOW()
  WHERE id = original_item;

  INSERT INTO public.order_item_status_history (order_item_id, from_status, to_status, changed_by, change_reason)
  VALUES (
    original_item,
    previous_status,
    next_status,
    public.current_profile_id(),
    CASE WHEN accept_choice THEN 'Customer accepted substitute' ELSE 'Customer rejected substitute' END
  );

  RETURN result_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.review_order_item_by_architect(target_order_item_id uuid, approve boolean, note_text text DEFAULT NULL::text)
 RETURNS order_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE target_site UUID; next_status public.order_item_status;
BEGIN
  SELECT site_id INTO target_site FROM public.order_items WHERE id = target_order_item_id;
  IF NOT public.can_manage_site_as_contractor(target_site) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  next_status := CASE WHEN approve THEN 'pending_customer_approval' ELSE 'rejected_by_architect' END;
  UPDATE public.order_items
  SET architect_notes = COALESCE(note_text, architect_notes),
      architect_reviewed_by = public.current_profile_id(),
      architect_reviewed_at = NOW()
  WHERE id = target_order_item_id;
  RETURN public.record_order_item_status(target_order_item_id, next_status, note_text);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_default_site_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.site_code IS NULL OR NEW.site_code = '' THEN
    NEW.site_code := 'SIT-' || nextval('public.site_code_seq')::TEXT;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.start_substitute_workflow(original_item_id uuid, suggested_product uuid, reason_text text DEFAULT NULL::text)
 RETURNS substitute_suggestions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  item_row public.order_items;
  site_customer UUID;
  result_row public.substitute_suggestions;
  event_id UUID;
BEGIN
  SELECT oi.*
  INTO item_row
  FROM public.order_items oi
  WHERE oi.id = original_item_id;

  SELECT s.customer_id
  INTO site_customer
  FROM public.sites s
  WHERE s.id = item_row.site_id;

  IF item_row.id IS NULL THEN
    RAISE EXCEPTION 'Order item not found';
  END IF;

  IF site_customer IS NULL THEN
    RAISE EXCEPTION 'Customer not found for order item %', original_item_id;
  END IF;

  IF NOT public.can_administer_tenant(item_row.tenant_id) AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Only admin can suggest substitutes';
  END IF;

  INSERT INTO public.substitute_suggestions (
    original_order_item_id,
    suggested_product_id,
    suggested_by,
    customer_id,
    status,
    reason,
    tenant_id
  )
  VALUES (
    original_item_id,
    suggested_product,
    public.current_profile_id(),
    site_customer,
    'suggested',
    reason_text,
    item_row.tenant_id
  )
  RETURNING * INTO result_row;

  PERFORM public.transition_order_item(
    original_item_id,
    'suggest_substitute',
    reason_text,
    jsonb_build_object(
      'suggestion_id', result_row.id,
      'suggested_product_id', suggested_product
    ),
    'substitute_workflow'
  );

  event_id := public.insert_system_event(
    item_row.tenant_id,
    'substitute_workflow_started',
    'substitute_suggestion',
    result_row.id,
    jsonb_build_object(
      'original_order_item_id', original_item_id,
      'suggested_product_id', suggested_product
    ),
    gen_random_uuid(),
    'substitute_workflow'
  );

  PERFORM public.append_workflow_log(
    item_row.tenant_id,
    'substitute_workflow',
    'substitute_suggestion',
    result_row.id,
    'suggest_substitute',
    'completed',
    event_id,
    reason_text
  );

  RETURN result_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.suggest_substitute_item(original_item_id uuid, suggested_product uuid, reason_text text DEFAULT NULL::text)
 RETURNS substitute_suggestions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result_row public.substitute_suggestions; item_customer UUID; previous_status public.order_item_status;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Only admin can suggest substitutes';
  END IF;
  SELECT s.customer_id, oi.status INTO item_customer, previous_status
  FROM public.order_items oi
  JOIN public.sites s ON s.id = oi.site_id
  WHERE oi.id = original_item_id;

  INSERT INTO public.substitute_suggestions (original_order_item_id, suggested_product_id, suggested_by, customer_id, status, reason)
  VALUES (original_item_id, suggested_product, public.current_profile_id(), item_customer, 'suggested', reason_text)
  RETURNING * INTO result_row;

  UPDATE public.order_items
  SET status = 'substitute_suggested', admin_notes = COALESCE(reason_text, admin_notes), updated_at = NOW()
  WHERE id = original_item_id;

  INSERT INTO public.order_item_status_history (order_item_id, from_status, to_status, changed_by, change_reason)
  VALUES (original_item_id, previous_status, 'substitute_suggested', public.current_profile_id(), reason_text);

  RETURN result_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_auth_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.users
  SET email = COALESCE(NULLIF(NEW.email, ''), email),
      phone = COALESCE(NULLIF(NEW.phone, ''), phone),
      full_name = COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), full_name),
      last_login_at = NEW.last_sign_in_at,
      updated_at = NOW()
  WHERE auth_user_id = NEW.id;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_brand_tenant_from_category()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    SELECT tenant_id INTO NEW.tenant_id
    FROM public.product_categories
    WHERE id = NEW.category_id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_order_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE public.site_orders
    SET 
        subtotal_amount = (SELECT COALESCE(SUM(line_subtotal), 0) FROM public.order_items WHERE site_order_id = COALESCE(NEW.site_order_id, OLD.site_order_id)),
        tax_amount = (SELECT COALESCE(SUM(tax_amount), 0) FROM public.order_items WHERE site_order_id = COALESCE(NEW.site_order_id, OLD.site_order_id)),
        total_amount = (SELECT COALESCE(SUM(line_total), 0) FROM public.order_items WHERE site_order_id = COALESCE(NEW.site_order_id, OLD.site_order_id)),
        updated_at = NOW()
    WHERE id = COALESCE(NEW.site_order_id, OLD.site_order_id);
    RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_product_tenant_from_parents()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  category_tenant UUID;
  brand_tenant UUID;
BEGIN
  SELECT tenant_id INTO category_tenant
  FROM public.product_categories
  WHERE id = NEW.category_id;

  SELECT tenant_id INTO brand_tenant
  FROM public.product_brands
  WHERE id = NEW.brand_id;

  IF category_tenant IS NULL OR brand_tenant IS NULL OR category_tenant <> brand_tenant THEN
    RAISE EXCEPTION 'Product category and brand must belong to the same tenant';
  END IF;

  NEW.tenant_id := category_tenant;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_site_order_workflow(target_site_order_id uuid, note_text text DEFAULT NULL::text, target_source_module text DEFAULT 'order_workflow_rollup'::text)
 RETURNS site_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  order_row public.site_orders;
  total_items INTEGER;
  awaiting_count INTEGER;
  approval_ready_count INTEGER;
  supply_ready_count INTEGER;
  partial_supply_count INTEGER;
  supplied_count INTEGER;
  closed_count INTEGER;
  desired_status public.order_status;
  transition_key TEXT;
BEGIN
  SELECT *
  INTO order_row
  FROM public.site_orders
  WHERE id = target_site_order_id;

  IF order_row.id IS NULL THEN
    RAISE EXCEPTION 'Site order not found';
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('pending_architect_approval', 'pending_customer_approval', 'substitute_suggested')),
    COUNT(*) FILTER (WHERE status = 'approved_pending_shop_confirmation'),
    COUNT(*) FILTER (WHERE status = 'approved_pending_supply'),
    COUNT(*) FILTER (WHERE status = 'partially_supplied'),
    COUNT(*) FILTER (WHERE status = 'supplied'),
    COUNT(*) FILTER (WHERE status IN ('cancelled', 'rejected_by_architect', 'rejected_by_customer', 'substitute_rejected'))
  INTO
    total_items,
    awaiting_count,
    approval_ready_count,
    supply_ready_count,
    partial_supply_count,
    supplied_count,
    closed_count
  FROM public.order_items
  WHERE site_order_id = target_site_order_id;

  IF total_items = 0 THEN
    desired_status := 'draft';
  ELSIF supplied_count = total_items THEN
    desired_status := 'supplied';
  ELSIF supplied_count > 0 OR partial_supply_count > 0 THEN
    desired_status := 'partially_supplied';
  ELSIF supply_ready_count > 0 THEN
    desired_status := 'processing';
  ELSIF approval_ready_count > 0 AND awaiting_count = 0 THEN
    desired_status := 'confirmed';
  ELSIF approval_ready_count > 0 AND awaiting_count > 0 THEN
    desired_status := 'partially_approved';
  ELSIF awaiting_count > 0 THEN
    desired_status := 'awaiting_approval';
  ELSIF closed_count = total_items THEN
    desired_status := 'cancelled';
  ELSE
    desired_status := order_row.status;
  END IF;

  IF desired_status = order_row.status THEN
    RETURN order_row;
  END IF;

  transition_key := CASE desired_status
    WHEN 'draft' THEN 'system_rollup_to_draft'
    WHEN 'awaiting_approval' THEN 'system_rollup_to_awaiting_approval'
    WHEN 'partially_approved' THEN 'system_rollup_to_partially_approved'
    WHEN 'confirmed' THEN 'system_rollup_to_confirmed'
    WHEN 'processing' THEN 'system_rollup_to_processing'
    WHEN 'partially_supplied' THEN 'system_rollup_to_partially_supplied'
    WHEN 'supplied' THEN 'system_rollup_to_supplied'
    WHEN 'cancelled' THEN 'system_rollup_to_cancelled'
    ELSE NULL
  END;

  IF transition_key IS NULL THEN
    RETURN order_row;
  END IF;

  RETURN public.transition_site_order_internal(
    target_site_order_id,
    transition_key,
    'system',
    note_text,
    jsonb_build_object(
      'rollup', TRUE,
      'total_items', total_items,
      'awaiting_count', awaiting_count,
      'approval_ready_count', approval_ready_count,
      'supply_ready_count', supply_ready_count,
      'partial_supply_count', partial_supply_count,
      'supplied_count', supplied_count,
      'closed_count', closed_count
    ),
    target_source_module
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_tenant_from_site()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.site_id IS NOT NULL THEN
    SELECT tenant_id INTO NEW.tenant_id
    FROM public.sites
    WHERE id = NEW.site_id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_tenant_from_site_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.site_order_id IS NOT NULL THEN
    SELECT tenant_id INTO NEW.tenant_id
    FROM public.site_orders
    WHERE id = NEW.site_order_id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_platform_event_outbox_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.transition_order_item(target_order_item_id uuid, target_transition_key text, note_text text DEFAULT NULL::text, event_payload jsonb DEFAULT '{}'::jsonb, target_source_module text DEFAULT 'order_workflow'::text)
 RETURNS order_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.transition_order_item_internal(
    target_order_item_id,
    target_transition_key,
    NULL,
    note_text,
    event_payload,
    target_source_module
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.transition_order_item_internal(target_order_item_id uuid, target_transition_key text, actor_scope_override text DEFAULT NULL::text, note_text text DEFAULT NULL::text, event_payload jsonb DEFAULT '{}'::jsonb, target_source_module text DEFAULT 'order_workflow'::text)
 RETURNS order_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  item_row public.order_items;
  transition_row public.state_transition_catalog%ROWTYPE;
  actor_scope TEXT;
  updated_item public.order_items;
  event_id UUID;
  merged_payload JSONB;
BEGIN
  SELECT *
  INTO item_row
  FROM public.order_items
  WHERE id = target_order_item_id;

  IF item_row.id IS NULL THEN
    RAISE EXCEPTION 'Order item not found';
  END IF;

  actor_scope := COALESCE(
    actor_scope_override,
    public.order_workflow_actor_scope(item_row.site_id, item_row.tenant_id)
  );

  IF actor_scope IS NULL THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT *
  INTO transition_row
  FROM public.state_transition_catalog stc
  WHERE stc.entity_type = 'order_item'
    AND stc.transition_key = target_transition_key
    AND stc.allowed_actor_scope = actor_scope
    AND stc.is_active = TRUE
    AND (stc.from_state = item_row.status::TEXT OR stc.from_state = '*')
  ORDER BY CASE WHEN stc.from_state = item_row.status::TEXT THEN 0 ELSE 1 END
  LIMIT 1;

  IF transition_row.id IS NULL THEN
    RAISE EXCEPTION 'Invalid order item transition: % from % as %', target_transition_key, item_row.status, actor_scope;
  END IF;

  UPDATE public.order_items
  SET
    status = transition_row.to_state::public.order_item_status,
    architect_notes = CASE
      WHEN target_transition_key IN ('architect_approve', 'architect_reject')
      THEN COALESCE(note_text, architect_notes)
      ELSE architect_notes
    END,
    architect_reviewed_by = CASE
      WHEN target_transition_key IN ('architect_approve', 'architect_reject')
      THEN public.current_profile_id()
      ELSE architect_reviewed_by
    END,
    architect_reviewed_at = CASE
      WHEN target_transition_key IN ('architect_approve', 'architect_reject')
      THEN NOW()
      ELSE architect_reviewed_at
    END,
    customer_notes = CASE
      WHEN target_transition_key IN ('customer_approve', 'customer_reject', 'accept_substitute', 'reject_substitute')
      THEN COALESCE(note_text, customer_notes)
      ELSE customer_notes
    END,
    customer_reviewed_by = CASE
      WHEN target_transition_key IN ('customer_approve', 'customer_reject', 'accept_substitute', 'reject_substitute')
      THEN public.current_profile_id()
      ELSE customer_reviewed_by
    END,
    customer_reviewed_at = CASE
      WHEN target_transition_key IN ('customer_approve', 'customer_reject', 'accept_substitute', 'reject_substitute')
      THEN NOW()
      ELSE customer_reviewed_at
    END,
    admin_notes = CASE
      WHEN target_transition_key IN ('suggest_substitute', 'record_partial_supply', 'record_full_supply', 'shop_confirm', 'cancel_order_item')
      THEN COALESCE(note_text, admin_notes)
      ELSE admin_notes
    END,
    shop_confirmed_by = CASE
      WHEN target_transition_key IN ('shop_confirm', 'record_partial_supply', 'record_full_supply')
      THEN COALESCE(shop_confirmed_by, public.current_profile_id())
      ELSE shop_confirmed_by
    END,
    shop_confirmed_at = CASE
      WHEN target_transition_key IN ('shop_confirm', 'record_partial_supply', 'record_full_supply')
      THEN COALESCE(shop_confirmed_at, NOW())
      ELSE shop_confirmed_at
    END,
    quantity_supplied = CASE
      WHEN target_transition_key IN ('record_partial_supply', 'record_full_supply')
      THEN COALESCE((event_payload ->> 'new_total_supplied')::NUMERIC, quantity_supplied)
      ELSE quantity_supplied
    END,
    supplied_by = CASE
      WHEN target_transition_key IN ('record_partial_supply', 'record_full_supply')
      THEN public.current_profile_id()
      ELSE supplied_by
    END,
    supplied_at = CASE
      WHEN target_transition_key IN ('record_partial_supply', 'record_full_supply')
      THEN NOW()
      ELSE supplied_at
    END,
    updated_at = NOW()
  WHERE id = item_row.id
  RETURNING * INTO updated_item;

  INSERT INTO public.order_item_status_history (
    order_item_id,
    from_status,
    to_status,
    changed_by,
    change_reason,
    metadata,
    tenant_id
  )
  VALUES (
    item_row.id,
    item_row.status,
    transition_row.to_state::public.order_item_status,
    public.current_profile_id(),
    note_text,
    COALESCE(event_payload, '{}'::jsonb),
    item_row.tenant_id
  );

  merged_payload := COALESCE(event_payload, '{}'::jsonb)
    || jsonb_build_object(
      'transition_key', target_transition_key,
      'from_state', item_row.status::TEXT,
      'to_state', transition_row.to_state,
      'actor_scope', actor_scope,
      'site_order_id', item_row.site_order_id,
      'site_id', item_row.site_id
    );

  event_id := public.insert_system_event(
    item_row.tenant_id,
    'order_item_transition',
    'order_item',
    item_row.id,
    merged_payload,
    gen_random_uuid(),
    target_source_module
  );

  PERFORM public.append_workflow_log(
    item_row.tenant_id,
    transition_row.workflow_name,
    'order_item',
    item_row.id,
    target_transition_key,
    'completed',
    event_id,
    note_text
  );

  PERFORM public.sync_site_order_workflow(
    item_row.site_order_id,
    COALESCE(note_text, 'Order item workflow transition'),
    target_source_module
  );

  RETURN updated_item;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.transition_site_order(target_site_order_id uuid, target_transition_key text, note_text text DEFAULT NULL::text, event_payload jsonb DEFAULT '{}'::jsonb, target_source_module text DEFAULT 'order_workflow'::text)
 RETURNS site_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.transition_site_order_internal(
    target_site_order_id,
    target_transition_key,
    NULL,
    note_text,
    event_payload,
    target_source_module
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.transition_site_order_internal(target_site_order_id uuid, target_transition_key text, actor_scope_override text DEFAULT NULL::text, note_text text DEFAULT NULL::text, event_payload jsonb DEFAULT '{}'::jsonb, target_source_module text DEFAULT 'order_workflow'::text)
 RETURNS site_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  order_row public.site_orders;
  actor_scope TEXT;
  transition_row public.state_transition_catalog%ROWTYPE;
  updated_order public.site_orders;
  event_id UUID;
  merged_payload JSONB;
BEGIN
  SELECT *
  INTO order_row
  FROM public.site_orders
  WHERE id = target_site_order_id;

  IF order_row.id IS NULL THEN
    RAISE EXCEPTION 'Site order not found';
  END IF;

  actor_scope := COALESCE(
    actor_scope_override,
    CASE
      WHEN public.can_administer_tenant(order_row.tenant_id) OR public.is_admin_user() THEN 'admin'
      WHEN order_row.customer_id = public.current_profile_id() THEN 'customer'
      WHEN public.current_profile_role() = 'architect' THEN 'architect'
      WHEN public.current_profile_role() = 'electrician' THEN 'electrician'
      ELSE NULL
    END
  );

  IF actor_scope IS NULL THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT *
  INTO transition_row
  FROM public.state_transition_catalog stc
  WHERE stc.entity_type = 'site_order'
    AND stc.transition_key = target_transition_key
    AND stc.allowed_actor_scope = actor_scope
    AND stc.is_active = TRUE
    AND (stc.from_state = order_row.status::TEXT OR stc.from_state = '*')
  ORDER BY CASE WHEN stc.from_state = order_row.status::TEXT THEN 0 ELSE 1 END
  LIMIT 1;

  IF transition_row.id IS NULL THEN
    RAISE EXCEPTION 'Invalid site order transition: % from % as %', target_transition_key, order_row.status, actor_scope;
  END IF;

  UPDATE public.site_orders
  SET
    status = transition_row.to_state::public.order_status,
    confirmed_at = CASE
      WHEN transition_row.to_state = 'confirmed'
      THEN COALESCE(confirmed_at, NOW())
      ELSE confirmed_at
    END,
    supplied_at = CASE
      WHEN transition_row.to_state = 'supplied'
      THEN COALESCE(supplied_at, NOW())
      ELSE supplied_at
    END,
    cancelled_at = CASE
      WHEN transition_row.to_state = 'cancelled'
      THEN COALESCE(cancelled_at, NOW())
      ELSE cancelled_at
    END,
    updated_at = NOW()
  WHERE id = order_row.id
  RETURNING * INTO updated_order;

  merged_payload := COALESCE(event_payload, '{}'::jsonb)
    || jsonb_build_object(
      'transition_key', target_transition_key,
      'from_state', order_row.status::TEXT,
      'to_state', transition_row.to_state,
      'actor_scope', actor_scope
    );

  event_id := public.insert_system_event(
    order_row.tenant_id,
    'site_order_transition',
    'site_order',
    order_row.id,
    merged_payload,
    gen_random_uuid(),
    target_source_module
  );

  PERFORM public.append_workflow_log(
    order_row.tenant_id,
    transition_row.workflow_name,
    'site_order',
    order_row.id,
    target_transition_key,
    'completed',
    event_id,
    note_text
  );

  RETURN updated_order;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.user_has_tenant_access(target_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.can_access_tenant(target_tenant_id);
$function$
;

CREATE OR REPLACE FUNCTION public.verify_professional_user(target_user_id uuid, approve boolean, admin_note text DEFAULT NULL::text)
 RETURNS users
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result_row public.users;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Only admin can verify users';
  END IF;
  UPDATE public.users
  SET verification_status = CASE WHEN approve THEN 'verified' ELSE 'rejected' END,
      is_admin_verified = approve,
      notes = COALESCE(admin_note, notes),
      updated_at = NOW()
  WHERE id = target_user_id
  RETURNING * INTO result_row;
  RETURN result_row;
END;
$function$
;

-- ── VIEWS ────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_architect_material_tracker AS
SELECT order_item_id,
    site_order_id,
    site_id,
    site_code,
    site_name,
    customer_id,
    customer_name,
    electrician_id,
    electrician_name,
    architect_id,
    architect_name,
    product_id,
    current_product_sku,
    item_name_snapshot,
    category_name_snapshot,
    brand_name_snapshot,
    sku_snapshot,
    unit_snapshot,
    source,
    source_user_id,
    source_user_name,
    parent_order_item_id,
    approval_mode,
    requires_architect_approval,
    quantity_required,
    quantity_approved,
    quantity_supplied,
    unit_price,
    line_subtotal,
    tax_amount,
    line_total,
    electrician_notes,
    architect_notes,
    customer_notes,
    admin_notes,
    status,
    is_substitute,
    substitute_for_order_item_id,
    substitute_status,
    architect_reviewed_by,
    architect_reviewed_by_name,
    architect_reviewed_at,
    customer_reviewed_by,
    customer_reviewed_by_name,
    customer_reviewed_at,
    shop_confirmed_by,
    shop_confirmed_by_name,
    shop_confirmed_at,
    supplied_by,
    supplied_by_name,
    supplied_at,
    created_at,
    updated_at,
    tenant_id,
        CASE
            WHEN (status <> 'cancelled'::order_item_status) THEN true
            ELSE false
        END AS in_master_materials_required_list,
        CASE
            WHEN (status = 'pending_architect_approval'::order_item_status) THEN true
            ELSE false
        END AS in_materials_required_by_electrician,
        CASE
            WHEN (status = 'supplied'::order_item_status) THEN true
            ELSE false
        END AS in_material_already_supplied,
        CASE
            WHEN (status = 'pending_customer_approval'::order_item_status) THEN true
            ELSE false
        END AS in_architect_approved_pending_customer,
        CASE
            WHEN (status = ANY (ARRAY['approved_pending_supply'::order_item_status, 'partially_supplied'::order_item_status])) THEN true
            ELSE false
        END AS in_completely_approved_pending_supply
   FROM vw_site_order_item_enriched v
  WHERE (architect_id IS NOT NULL);;

CREATE OR REPLACE VIEW public.vw_architect_new_projects AS
SELECT s.id AS site_id,
    s.site_code,
    s.site_name,
    s.project_type,
    s.city,
    s.state,
    s.area_sqft,
    s.architect_required,
    s.approval_mode,
    s.estimated_budget,
    s.status,
    s.description,
    s.created_at,
    customer.id AS customer_id,
    customer.full_name AS customer_name,
    customer.phone AS customer_phone,
    s.tenant_id
   FROM (sites s
     JOIN users customer ON ((customer.id = s.customer_id)))
  WHERE ((s.status = 'open_for_bidding'::site_status) AND (s.architect_required = true) AND (NOT (EXISTS ( SELECT 1
           FROM site_assignments sa
          WHERE ((sa.site_id = s.id) AND (sa.role = 'architect'::assignment_role) AND (sa.status = 'active'::assignment_status))))));;

CREATE OR REPLACE VIEW public.vw_architect_ongoing_projects AS
SELECT s.id AS site_id,
    s.site_code,
    s.site_name,
    s.project_type,
    s.city,
    s.state,
    s.area_sqft,
    s.approval_mode,
    s.estimated_budget,
    s.actual_spend,
    s.status AS site_status,
    customer.id AS customer_id,
    customer.full_name AS customer_name,
    sa.user_id AS architect_id,
    architect.full_name AS architect_name,
    electrician.id AS electrician_id,
    electrician.full_name AS electrician_name,
    count(DISTINCT oi.id) AS total_material_items,
    count(DISTINCT oi.id) FILTER (WHERE (oi.status = 'pending_architect_approval'::order_item_status)) AS electrician_requested_items,
    count(DISTINCT oi.id) FILTER (WHERE (oi.status = 'pending_customer_approval'::order_item_status)) AS customer_pending_items,
    count(DISTINCT oi.id) FILTER (WHERE (oi.status = ANY (ARRAY['approved_pending_supply'::order_item_status, 'partially_supplied'::order_item_status]))) AS supply_pending_items,
    count(DISTINCT oi.id) FILTER (WHERE (oi.status = 'supplied'::order_item_status)) AS supplied_items,
    s.tenant_id
   FROM ((((((site_assignments sa
     JOIN sites s ON ((s.id = sa.site_id)))
     JOIN users architect ON ((architect.id = sa.user_id)))
     JOIN users customer ON ((customer.id = s.customer_id)))
     LEFT JOIN site_assignments sa_ele ON (((sa_ele.site_id = s.id) AND (sa_ele.role = 'electrician'::assignment_role) AND (sa_ele.status = 'active'::assignment_status))))
     LEFT JOIN users electrician ON ((electrician.id = sa_ele.user_id)))
     LEFT JOIN order_items oi ON ((oi.site_id = s.id)))
  WHERE ((sa.role = 'architect'::assignment_role) AND (sa.status = 'active'::assignment_status) AND (s.status = ANY (ARRAY['assigned'::site_status, 'in_progress'::site_status, 'on_hold'::site_status])))
  GROUP BY s.id, s.site_code, s.site_name, s.project_type, s.city, s.state, s.area_sqft, s.approval_mode, s.estimated_budget, s.actual_spend, s.status, customer.id, customer.full_name, sa.user_id, architect.full_name, electrician.id, electrician.full_name;;

CREATE OR REPLACE VIEW public.vw_customer_budget_tracker AS
SELECT s.id AS site_id,
    s.customer_id,
    s.site_code,
    s.site_name,
    COALESCE(bt.initial_budget, s.estimated_budget, (0)::numeric) AS initial_budget,
    COALESCE(bt.revised_budget, s.estimated_budget, (0)::numeric) AS revised_budget,
    COALESCE(bt.approved_material_budget, (0)::numeric) AS approved_material_budget,
    COALESCE(bt.actual_material_spend, s.actual_spend, (0)::numeric) AS actual_material_spend,
    GREATEST((COALESCE(bt.revised_budget, s.estimated_budget, (0)::numeric) - COALESCE(bt.actual_material_spend, s.actual_spend, (0)::numeric)), (0)::numeric) AS remaining_budget,
    s.tenant_id
   FROM (sites s
     LEFT JOIN budget_trackers bt ON ((bt.site_id = s.id)));;

CREATE OR REPLACE VIEW public.vw_customer_finance_applications AS
SELECT fa.id,
    fa.customer_id,
    fa.site_id,
    s.site_code,
    s.site_name,
    fa.application_number,
    fa.requested_amount,
    fa.approved_amount,
    fa.tenure_months,
    fa.status,
    fa.remarks,
    fa.submitted_at,
    fa.reviewed_at,
    fa.created_at,
    fa.updated_at,
    fa.tenant_id
   FROM (finance_applications fa
     LEFT JOIN sites s ON ((s.id = fa.site_id)));;

CREATE OR REPLACE VIEW public.vw_customer_items_on_approval AS
SELECT order_item_id,
    site_order_id,
    site_id,
    site_code,
    site_name,
    customer_id,
    customer_name,
    electrician_id,
    electrician_name,
    architect_id,
    architect_name,
    product_id,
    current_product_sku,
    item_name_snapshot,
    category_name_snapshot,
    brand_name_snapshot,
    sku_snapshot,
    unit_snapshot,
    source,
    source_user_id,
    source_user_name,
    parent_order_item_id,
    approval_mode,
    requires_architect_approval,
    quantity_required,
    quantity_approved,
    quantity_supplied,
    unit_price,
    line_subtotal,
    tax_amount,
    line_total,
    electrician_notes,
    architect_notes,
    customer_notes,
    admin_notes,
    status,
    is_substitute,
    substitute_for_order_item_id,
    substitute_status,
    architect_reviewed_by,
    architect_reviewed_by_name,
    architect_reviewed_at,
    customer_reviewed_by,
    customer_reviewed_by_name,
    customer_reviewed_at,
    shop_confirmed_by,
    shop_confirmed_by_name,
    shop_confirmed_at,
    supplied_by,
    supplied_by_name,
    supplied_at,
    created_at,
    updated_at,
    tenant_id
   FROM vw_site_order_item_enriched
  WHERE (status = ANY (ARRAY['pending_customer_approval'::order_item_status, 'substitute_suggested'::order_item_status]));;

CREATE OR REPLACE VIEW public.vw_customer_site_projects AS
SELECT s.id AS site_id,
    s.customer_id,
    s.site_code,
    s.site_name,
    s.project_type,
    s.city,
    s.state,
    s.architect_required,
    s.approval_mode,
    s.estimated_budget,
    s.actual_spend,
    s.status AS site_status,
    electrician.id AS electrician_id,
    electrician.full_name AS electrician_name,
    architect.id AS architect_id,
    architect.full_name AS architect_name,
    count(DISTINCT oi.id) AS total_material_items,
    count(DISTINCT oi.id) FILTER (WHERE (oi.status = ANY (ARRAY['pending_customer_approval'::order_item_status, 'substitute_suggested'::order_item_status]))) AS items_waiting_customer_action,
    count(DISTINCT oi.id) FILTER (WHERE (oi.status = ANY (ARRAY['approved_pending_shop_confirmation'::order_item_status, 'approved_pending_supply'::order_item_status, 'partially_supplied'::order_item_status]))) AS approved_but_not_fully_supplied_items,
    count(DISTINCT oi.id) FILTER (WHERE (oi.status = 'supplied'::order_item_status)) AS supplied_items,
    s.tenant_id
   FROM (((((sites s
     LEFT JOIN site_assignments sa_electrician ON (((sa_electrician.site_id = s.id) AND (sa_electrician.role = 'electrician'::assignment_role) AND (sa_electrician.status = 'active'::assignment_status))))
     LEFT JOIN users electrician ON ((electrician.id = sa_electrician.user_id)))
     LEFT JOIN site_assignments sa_architect ON (((sa_architect.site_id = s.id) AND (sa_architect.role = 'architect'::assignment_role) AND (sa_architect.status = 'active'::assignment_status))))
     LEFT JOIN users architect ON ((architect.id = sa_architect.user_id)))
     LEFT JOIN order_items oi ON ((oi.site_id = s.id)))
  GROUP BY s.tenant_id, s.id, s.customer_id, s.site_code, s.site_name, s.project_type, s.city, s.state, s.architect_required, s.approval_mode, s.estimated_budget, s.actual_spend, s.status, electrician.id, electrician.full_name, architect.id, architect.full_name;;

CREATE OR REPLACE VIEW public.vw_electrician_material_tracker AS
SELECT order_item_id,
    site_order_id,
    site_id,
    site_code,
    site_name,
    customer_id,
    customer_name,
    electrician_id,
    electrician_name,
    architect_id,
    architect_name,
    product_id,
    current_product_sku,
    item_name_snapshot,
    category_name_snapshot,
    brand_name_snapshot,
    sku_snapshot,
    unit_snapshot,
    source,
    source_user_id,
    source_user_name,
    parent_order_item_id,
    approval_mode,
    requires_architect_approval,
    quantity_required,
    quantity_approved,
    quantity_supplied,
    unit_price,
    line_subtotal,
    tax_amount,
    line_total,
    electrician_notes,
    architect_notes,
    customer_notes,
    admin_notes,
    status,
    is_substitute,
    substitute_for_order_item_id,
    substitute_status,
    architect_reviewed_by,
    architect_reviewed_by_name,
    architect_reviewed_at,
    customer_reviewed_by,
    customer_reviewed_by_name,
    customer_reviewed_at,
    shop_confirmed_by,
    shop_confirmed_by_name,
    shop_confirmed_at,
    supplied_by,
    supplied_by_name,
    supplied_at,
    created_at,
    updated_at,
    tenant_id,
        CASE
            WHEN (status <> 'cancelled'::order_item_status) THEN true
            ELSE false
        END AS in_master_requirement_list,
        CASE
            WHEN (status = 'supplied'::order_item_status) THEN true
            ELSE false
        END AS in_material_already_on_site,
        CASE
            WHEN (status = ANY (ARRAY['draft_by_electrician'::order_item_status, 'draft_by_architect'::order_item_status, 'approved_pending_shop_confirmation'::order_item_status, 'approved_pending_supply'::order_item_status, 'partially_supplied'::order_item_status, 'substitute_suggested'::order_item_status, 'substitute_accepted'::order_item_status])) THEN true
            ELSE false
        END AS in_pending_general,
        CASE
            WHEN (status = 'pending_architect_approval'::order_item_status) THEN true
            ELSE false
        END AS in_architect_approval_pending,
        CASE
            WHEN (status = 'pending_customer_approval'::order_item_status) THEN true
            ELSE false
        END AS in_customer_approval_pending,
        CASE
            WHEN (status = ANY (ARRAY['approved_pending_supply'::order_item_status, 'partially_supplied'::order_item_status])) THEN true
            ELSE false
        END AS in_shop_supply_pending
   FROM vw_site_order_item_enriched v
  WHERE (electrician_id IS NOT NULL);;

CREATE OR REPLACE VIEW public.vw_electrician_new_projects AS
SELECT s.id AS site_id,
    s.site_code,
    s.site_name,
    s.project_type,
    s.city,
    s.state,
    s.area_sqft,
    s.architect_required,
    s.approval_mode,
    s.estimated_budget,
    s.status,
    s.description,
    s.created_at,
    customer.id AS customer_id,
    customer.full_name AS customer_name,
    customer.phone AS customer_phone,
    s.tenant_id
   FROM (sites s
     JOIN users customer ON ((customer.id = s.customer_id)))
  WHERE ((s.status = 'open_for_bidding'::site_status) AND (NOT (EXISTS ( SELECT 1
           FROM site_assignments sa
          WHERE ((sa.site_id = s.id) AND (sa.role = 'electrician'::assignment_role) AND (sa.status = 'active'::assignment_status))))));;

CREATE OR REPLACE VIEW public.vw_electrician_ongoing_projects AS
SELECT s.id AS site_id,
    s.site_code,
    s.site_name,
    s.project_type,
    s.city,
    s.state,
    s.area_sqft,
    s.architect_required,
    s.approval_mode,
    s.estimated_budget,
    s.actual_spend,
    s.status AS site_status,
    customer.id AS customer_id,
    customer.full_name AS customer_name,
    sa.user_id AS electrician_id,
    electrician.full_name AS electrician_name,
    architect.id AS architect_id,
    architect.full_name AS architect_name,
    count(DISTINCT oi.id) AS total_material_items,
    count(DISTINCT oi.id) FILTER (WHERE (oi.status = 'pending_architect_approval'::order_item_status)) AS architect_pending_items,
    count(DISTINCT oi.id) FILTER (WHERE (oi.status = 'pending_customer_approval'::order_item_status)) AS customer_pending_items,
    count(DISTINCT oi.id) FILTER (WHERE (oi.status = ANY (ARRAY['approved_pending_supply'::order_item_status, 'partially_supplied'::order_item_status]))) AS supply_pending_items,
    count(DISTINCT oi.id) FILTER (WHERE (oi.status = 'supplied'::order_item_status)) AS supplied_items,
    s.tenant_id
   FROM ((((((site_assignments sa
     JOIN sites s ON ((s.id = sa.site_id)))
     JOIN users electrician ON ((electrician.id = sa.user_id)))
     JOIN users customer ON ((customer.id = s.customer_id)))
     LEFT JOIN site_assignments sa_arch ON (((sa_arch.site_id = s.id) AND (sa_arch.role = 'architect'::assignment_role) AND (sa_arch.status = 'active'::assignment_status))))
     LEFT JOIN users architect ON ((architect.id = sa_arch.user_id)))
     LEFT JOIN order_items oi ON ((oi.site_id = s.id)))
  WHERE ((sa.role = 'electrician'::assignment_role) AND (sa.status = 'active'::assignment_status) AND (s.status = ANY (ARRAY['assigned'::site_status, 'in_progress'::site_status, 'on_hold'::site_status])))
  GROUP BY s.id, s.site_code, s.site_name, s.project_type, s.city, s.state, s.area_sqft, s.architect_required, s.approval_mode, s.estimated_budget, s.actual_spend, s.status, customer.id, customer.full_name, sa.user_id, electrician.full_name, architect.id, architect.full_name;;

CREATE OR REPLACE VIEW public.vw_electrician_projects_assigned_to_others AS
SELECT s.id AS site_id,
    s.site_code,
    s.site_name,
    s.project_type,
    s.city,
    s.state,
    s.area_sqft,
    s.architect_required,
    s.approval_mode,
    s.estimated_budget,
    s.status,
    customer.id AS customer_id,
    customer.full_name AS customer_name,
    assigned_electrician.id AS assigned_electrician_id,
    assigned_electrician.full_name AS assigned_electrician_name,
    s.tenant_id
   FROM (((sites s
     JOIN users customer ON ((customer.id = s.customer_id)))
     JOIN site_assignments sa ON (((sa.site_id = s.id) AND (sa.role = 'electrician'::assignment_role) AND (sa.status = 'active'::assignment_status))))
     JOIN users assigned_electrician ON ((assigned_electrician.id = sa.user_id)))
  WHERE ((s.status = ANY (ARRAY['assigned'::site_status, 'in_progress'::site_status, 'on_hold'::site_status])) AND (assigned_electrician.role = 'electrician'::user_role));;

CREATE OR REPLACE VIEW public.vw_order_workflow_actor_history AS
SELECT se.tenant_id,
    se.actor_user_id,
    actor.full_name AS actor_name,
    se.entity_type,
    count(*) AS event_count,
    max(se.created_at) AS last_event_at
   FROM (system_events se
     LEFT JOIN users actor ON ((actor.id = se.actor_user_id)))
  WHERE ((se.entity_type)::text = ANY ((ARRAY['order_item'::character varying, 'site_order'::character varying, 'substitute_suggestion'::character varying])::text[]))
  GROUP BY se.tenant_id, se.actor_user_id, actor.full_name, se.entity_type;;

CREATE OR REPLACE VIEW public.vw_order_workflow_timeline AS
SELECT se.id AS event_id,
    se.tenant_id,
    se.entity_type,
    se.entity_id,
    se.event_type,
    se.actor_user_id,
    actor.full_name AS actor_name,
    se.source_module,
    se.payload,
    se.created_at,
    oi.site_order_id,
    so.order_number,
    s.site_name,
    oi.item_name_snapshot,
    wl.workflow_name,
    wl.current_step,
    wl.step_status,
    wl.attempt_number,
    wl.notes
   FROM (((((system_events se
     LEFT JOIN workflow_logs wl ON ((wl.event_id = se.id)))
     LEFT JOIN users actor ON ((actor.id = se.actor_user_id)))
     LEFT JOIN order_items oi ON ((((se.entity_type)::text = 'order_item'::text) AND (oi.id = se.entity_id))))
     LEFT JOIN site_orders so ON ((so.id = COALESCE(oi.site_order_id,
        CASE
            WHEN ((se.entity_type)::text = 'site_order'::text) THEN se.entity_id
            ELSE NULL::uuid
        END))))
     LEFT JOIN sites s ON ((s.id = COALESCE(oi.site_id, so.site_id))))
  WHERE ((se.entity_type)::text = ANY ((ARRAY['order_item'::character varying, 'site_order'::character varying, 'substitute_suggestion'::character varying])::text[]))
  ORDER BY se.created_at DESC;;

CREATE OR REPLACE VIEW public.vw_partner_incentive_progress AS
SELECT pbs.tenant_id,
    pbs.partner_id,
    u.full_name AS partner_name,
    (u.role)::text AS partner_type,
    pbs.business_year,
    pbs.scheme_id,
    pis.name AS scheme_name,
    pbs.current_slab_id,
    slab.tier_name AS current_tier,
    slab.color AS current_tier_color,
    slab.icon AS current_tier_icon,
    pbs.wire_business,
    pbs.other_business,
    pbs.total_business,
    pbs.commission_earned,
    COALESCE(ppw.points_balance, 0) AS current_points,
    next_slab.id AS next_slab_id,
    next_slab.tier_name AS next_tier,
    next_slab.min_business AS next_tier_min_business,
    GREATEST((COALESCE(next_slab.min_business, pbs.total_business) - pbs.total_business), (0)::numeric) AS business_to_next_tier
   FROM (((((partner_business_summary pbs
     JOIN users u ON ((u.id = pbs.partner_id)))
     LEFT JOIN partner_incentive_schemes pis ON ((pis.id = pbs.scheme_id)))
     LEFT JOIN partner_incentive_slabs slab ON ((slab.id = pbs.current_slab_id)))
     LEFT JOIN partner_points_wallet ppw ON (((ppw.tenant_id = pbs.tenant_id) AND (ppw.partner_id = pbs.partner_id))))
     LEFT JOIN LATERAL ( SELECT s.id,
            s.tenant_id,
            s.scheme_id,
            s.tier_name,
            s.min_business,
            s.max_business,
            s.wire_commission_percent,
            s.other_commission_percent,
            s.bonus_points,
            s.color,
            s.icon,
            s.description,
            s.sort_order,
            s.is_active,
            s.created_at,
            s.updated_at
           FROM partner_incentive_slabs s
          WHERE ((s.scheme_id = pbs.scheme_id) AND (s.is_active = true) AND (s.min_business > pbs.total_business))
          ORDER BY s.min_business
         LIMIT 1) next_slab ON (true));;

CREATE OR REPLACE VIEW public.vw_partner_incentive_reports AS
SELECT pbs.tenant_id,
    pbs.business_year,
    pbs.partner_id,
    u.full_name AS partner_name,
    (u.role)::text AS partner_type,
    slab.tier_name,
    pbs.total_business,
    pbs.wire_business,
    pbs.other_business,
    pbs.commission_earned,
    pbs.bonus_points_earned,
    COALESCE(ppw.points_balance, 0) AS current_points
   FROM (((partner_business_summary pbs
     JOIN users u ON ((u.id = pbs.partner_id)))
     LEFT JOIN partner_incentive_slabs slab ON ((slab.id = pbs.current_slab_id)))
     LEFT JOIN partner_points_wallet ppw ON (((ppw.tenant_id = pbs.tenant_id) AND (ppw.partner_id = pbs.partner_id))));;

CREATE OR REPLACE VIEW public.vw_product_requests_enriched AS
SELECT pr.id,
    pr.site_id,
    s.site_name,
    s.site_code,
    pr.requested_by_user_id,
    requester.full_name AS requested_by_name,
    pr.title,
    pr.preferred_category,
    pr.preferred_brand,
    pr.description,
    pr.status,
    pr.matched_product_id,
    p.item_name AS matched_product_name,
    pr.admin_notes,
    pr.ordered_at,
    pr.fulfilled_at,
    pr.created_at,
    pr.updated_at,
    pr.tenant_id
   FROM (((product_requests pr
     JOIN sites s ON ((s.id = pr.site_id)))
     JOIN users requester ON ((requester.id = pr.requested_by_user_id)))
     LEFT JOIN products p ON ((p.id = pr.matched_product_id)));;

CREATE OR REPLACE VIEW public.vw_recent_order_workflow_events AS
SELECT se.id,
    se.tenant_id,
    se.event_type,
    se.entity_type,
    se.entity_id,
    se.actor_user_id,
    actor.full_name AS actor_name,
    se.correlation_id,
    se.source_module,
    se.payload,
    se.created_at,
    oi.site_order_id,
    so.order_number,
    s.site_name,
    oi.item_name_snapshot
   FROM ((((system_events se
     LEFT JOIN users actor ON ((actor.id = se.actor_user_id)))
     LEFT JOIN order_items oi ON ((((se.entity_type)::text = 'order_item'::text) AND (oi.id = se.entity_id))))
     LEFT JOIN site_orders so ON ((so.id = COALESCE(oi.site_order_id,
        CASE
            WHEN ((se.entity_type)::text = 'site_order'::text) THEN se.entity_id
            ELSE NULL::uuid
        END))))
     LEFT JOIN sites s ON ((s.id = COALESCE(oi.site_id, so.site_id))))
  WHERE ((se.entity_type)::text = ANY ((ARRAY['order_item'::character varying, 'site_order'::character varying, 'substitute_suggestion'::character varying])::text[]))
  ORDER BY se.created_at DESC;;

CREATE OR REPLACE VIEW public.vw_site_notes_enriched AS
SELECT sn.id,
    sn.site_id,
    s.site_name,
    s.site_code,
    sn.sender_user_id,
    sender.full_name AS sender_name,
    sn.recipient_role,
    sn.recipient_user_id,
    recipient.full_name AS recipient_name,
    sn.note_text,
    sn.created_at,
    sn.updated_at,
    sn.tenant_id
   FROM (((site_notes sn
     JOIN sites s ON ((s.id = sn.site_id)))
     JOIN users sender ON ((sender.id = sn.sender_user_id)))
     LEFT JOIN users recipient ON ((recipient.id = sn.recipient_user_id)));;

CREATE OR REPLACE VIEW public.vw_site_order_item_enriched AS
SELECT oi.id AS order_item_id,
    oi.site_order_id,
    oi.site_id,
    s.site_code,
    s.site_name,
    s.customer_id,
    customer.full_name AS customer_name,
    sa_electrician.user_id AS electrician_id,
    electrician.full_name AS electrician_name,
    sa_architect.user_id AS architect_id,
    architect.full_name AS architect_name,
    oi.product_id,
    p.sku AS current_product_sku,
    oi.item_name_snapshot,
    oi.category_name_snapshot,
    oi.brand_name_snapshot,
    oi.sku_snapshot,
    oi.unit_snapshot,
    oi.source,
    oi.source_user_id,
    source_user.full_name AS source_user_name,
    oi.parent_order_item_id,
    oi.approval_mode,
    oi.requires_architect_approval,
    oi.quantity_required,
    oi.quantity_approved,
    oi.quantity_supplied,
    oi.unit_price,
    oi.line_subtotal,
    oi.tax_amount,
    oi.line_total,
    oi.electrician_notes,
    oi.architect_notes,
    oi.customer_notes,
    oi.admin_notes,
    oi.status,
    oi.is_substitute,
    oi.substitute_for_order_item_id,
    oi.substitute_status,
    oi.architect_reviewed_by,
    arch_reviewer.full_name AS architect_reviewed_by_name,
    oi.architect_reviewed_at,
    oi.customer_reviewed_by,
    cust_reviewer.full_name AS customer_reviewed_by_name,
    oi.customer_reviewed_at,
    oi.shop_confirmed_by,
    shop_confirmer.full_name AS shop_confirmed_by_name,
    oi.shop_confirmed_at,
    oi.supplied_by,
    supplier.full_name AS supplied_by_name,
    oi.supplied_at,
    oi.created_at,
    oi.updated_at,
    oi.tenant_id
   FROM ((((((((((((order_items oi
     JOIN sites s ON ((s.id = oi.site_id)))
     JOIN users customer ON ((customer.id = s.customer_id)))
     LEFT JOIN products p ON ((p.id = oi.product_id)))
     LEFT JOIN users source_user ON ((source_user.id = oi.source_user_id)))
     LEFT JOIN users arch_reviewer ON ((arch_reviewer.id = oi.architect_reviewed_by)))
     LEFT JOIN users cust_reviewer ON ((cust_reviewer.id = oi.customer_reviewed_by)))
     LEFT JOIN users shop_confirmer ON ((shop_confirmer.id = oi.shop_confirmed_by)))
     LEFT JOIN users supplier ON ((supplier.id = oi.supplied_by)))
     LEFT JOIN site_assignments sa_electrician ON (((sa_electrician.site_id = s.id) AND (sa_electrician.role = 'electrician'::assignment_role) AND (sa_electrician.status = 'active'::assignment_status))))
     LEFT JOIN users electrician ON ((electrician.id = sa_electrician.user_id)))
     LEFT JOIN site_assignments sa_architect ON (((sa_architect.site_id = s.id) AND (sa_architect.role = 'architect'::assignment_role) AND (sa_architect.status = 'active'::assignment_status))))
     LEFT JOIN users architect ON ((architect.id = sa_architect.user_id)));;

CREATE OR REPLACE VIEW public.vw_stuck_order_workflows AS
SELECT 'order_item'::text AS entity_type,
    oi.id AS entity_id,
    oi.tenant_id,
    oi.site_order_id,
    so.order_number,
    s.site_name,
    oi.item_name_snapshot AS entity_label,
    (oi.status)::text AS current_status,
    oi.updated_at AS last_changed_at,
    (EXTRACT(epoch FROM (now() - oi.updated_at)) / (3600)::numeric) AS hours_in_state
   FROM ((order_items oi
     JOIN site_orders so ON ((so.id = oi.site_order_id)))
     JOIN sites s ON ((s.id = oi.site_id)))
  WHERE ((oi.status = ANY (ARRAY['pending_architect_approval'::order_item_status, 'pending_customer_approval'::order_item_status, 'approved_pending_shop_confirmation'::order_item_status, 'approved_pending_supply'::order_item_status, 'partially_supplied'::order_item_status, 'substitute_suggested'::order_item_status])) AND (oi.updated_at < (now() - '24:00:00'::interval)))
UNION ALL
 SELECT 'site_order'::text AS entity_type,
    so.id AS entity_id,
    so.tenant_id,
    so.id AS site_order_id,
    so.order_number,
    s.site_name,
    so.order_number AS entity_label,
    (so.status)::text AS current_status,
    so.updated_at AS last_changed_at,
    (EXTRACT(epoch FROM (now() - so.updated_at)) / (3600)::numeric) AS hours_in_state
   FROM (site_orders so
     JOIN sites s ON ((s.id = so.site_id)))
  WHERE ((so.status = ANY (ARRAY['awaiting_approval'::order_status, 'partially_approved'::order_status, 'confirmed'::order_status, 'processing'::order_status, 'partially_supplied'::order_status])) AND (so.updated_at < (now() - '24:00:00'::interval)));;

-- ── INDEXES ──────────────────────────────────────────────────────────────
CREATE INDEX idx_audit_logs_actor_user_id ON public.audit_logs USING btree (actor_user_id);
CREATE INDEX idx_audit_logs_tenant_id ON public.audit_logs USING btree (tenant_id);
CREATE INDEX idx_bids_handyman_id ON public.bids USING btree (handyman_id);
CREATE INDEX idx_bids_task_id ON public.bids USING btree (task_id);
CREATE INDEX idx_budget_trackers_site_id ON public.budget_trackers USING btree (site_id);
CREATE INDEX idx_budget_trackers_tenant_id ON public.budget_trackers USING btree (tenant_id);
CREATE INDEX idx_content_posts_created_by ON public.content_posts USING btree (created_by);
CREATE INDEX idx_content_posts_tenant_id ON public.content_posts USING btree (tenant_id);
CREATE INDEX idx_risk_profiles_user ON public.contractor_risk_profiles USING btree (tenant_id, user_id);
CREATE INDEX idx_credit_limits_contractor_id ON public.credit_limits USING btree (contractor_id);
CREATE INDEX idx_credit_limits_tenant_id ON public.credit_limits USING btree (tenant_id);
CREATE INDEX idx_credit_requests_contractor_id ON public.credit_requests USING btree (contractor_id);
CREATE INDEX idx_credit_requests_reviewer_id ON public.credit_requests USING btree (reviewer_id);
CREATE INDEX idx_credit_requests_site_id ON public.credit_requests USING btree (site_id);
CREATE INDEX idx_credit_requests_status ON public.credit_requests USING btree (tenant_id, status);
CREATE INDEX idx_escrow_accounts_customer_id ON public.escrow_accounts USING btree (customer_id);
CREATE INDEX idx_escrow_accounts_order ON public.escrow_accounts USING btree (site_order_id);
CREATE INDEX idx_escrow_accounts_tenant_id ON public.escrow_accounts USING btree (tenant_id);
CREATE INDEX idx_escrow_transactions_created_by ON public.escrow_transactions USING btree (created_by);
CREATE INDEX idx_escrow_transactions_escrow_account_id ON public.escrow_transactions USING btree (escrow_account_id);
CREATE INDEX idx_escrow_transactions_ledger_tx_id ON public.escrow_transactions USING btree (ledger_tx_id);
CREATE INDEX idx_escrow_transactions_tenant_id ON public.escrow_transactions USING btree (tenant_id);
CREATE INDEX idx_finance_applications_customer_id ON public.finance_applications USING btree (customer_id);
CREATE INDEX idx_finance_applications_decided_by ON public.finance_applications USING btree (decided_by);
CREATE INDEX idx_finance_applications_site_id ON public.finance_applications USING btree (site_id);
CREATE INDEX idx_finance_applications_tenant_id ON public.finance_applications USING btree (tenant_id);
CREATE INDEX idx_leads_product_id ON public.leads USING btree (product_id);
CREATE INDEX idx_leads_requester_user_id ON public.leads USING btree (requester_user_id);
CREATE INDEX idx_leads_status ON public.leads USING btree (status);
CREATE INDEX idx_leads_tenant_id ON public.leads USING btree (tenant_id);
CREATE INDEX idx_leads_tenant_module_created_at ON public.leads USING btree (tenant_id, module, created_at DESC);
CREATE INDEX idx_ledger_accounts_site_id ON public.ledger_accounts USING btree (site_id);
CREATE INDEX idx_ledger_accounts_user ON public.ledger_accounts USING btree (tenant_id, user_id);
CREATE INDEX idx_ledger_accounts_user_id ON public.ledger_accounts USING btree (user_id);
CREATE INDEX idx_ledger_entries_account ON public.ledger_entries USING btree (account_id);
CREATE INDEX idx_ledger_entries_tenant_id ON public.ledger_entries USING btree (tenant_id);
CREATE INDEX idx_ledger_entries_tx ON public.ledger_entries USING btree (transaction_id);
CREATE INDEX idx_ledger_transactions_created_by ON public.ledger_transactions USING btree (created_by);
CREATE INDEX idx_ledger_transactions_tenant_id ON public.ledger_transactions USING btree (tenant_id);
CREATE INDEX idx_lighting_products_tenant_active_brand_name ON public.lighting_products USING btree (tenant_id, is_active, brand, product_name);
CREATE INDEX idx_lighting_products_tenant_id ON public.lighting_products USING btree (tenant_id);
CREATE INDEX idx_notifications_tenant_user ON public.notifications USING btree (tenant_id, user_id);
CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);
CREATE INDEX idx_order_item_history_changed_by ON public.order_item_status_history USING btree (changed_by);
CREATE INDEX idx_order_item_history_order_item_id ON public.order_item_status_history USING btree (order_item_id);
CREATE INDEX idx_order_item_history_tenant_id ON public.order_item_status_history USING btree (tenant_id);
CREATE INDEX idx_order_items_architect_reviewed_by ON public.order_items USING btree (architect_reviewed_by);
CREATE INDEX idx_order_items_customer_reviewed_by ON public.order_items USING btree (customer_reviewed_by);
CREATE INDEX idx_order_items_parent_order_item_id ON public.order_items USING btree (parent_order_item_id);
CREATE INDEX idx_order_items_product_id ON public.order_items USING btree (product_id);
CREATE INDEX idx_order_items_shop_confirmed_by ON public.order_items USING btree (shop_confirmed_by);
CREATE INDEX idx_order_items_site_id ON public.order_items USING btree (site_id);
CREATE INDEX idx_order_items_site_order_id ON public.order_items USING btree (site_order_id);
CREATE INDEX idx_order_items_source_user_id ON public.order_items USING btree (source_user_id);
CREATE INDEX idx_order_items_status ON public.order_items USING btree (status);
CREATE INDEX idx_order_items_substitute_for_id ON public.order_items USING btree (substitute_for_order_item_id);
CREATE INDEX idx_order_items_supplied_by ON public.order_items USING btree (supplied_by);
CREATE INDEX idx_order_items_tenant_id ON public.order_items USING btree (tenant_id);
CREATE INDEX idx_partner_business_summary_tenant_year ON public.partner_business_summary USING btree (tenant_id, business_year, total_business DESC);
CREATE INDEX idx_partner_commission_ledger_order_item ON public.partner_commission_ledger USING btree (order_item_id, partner_id);
CREATE INDEX idx_partner_commission_ledger_partner_posted ON public.partner_commission_ledger USING btree (tenant_id, partner_id, posted_at DESC);
CREATE INDEX idx_partner_incentive_schemes_tenant_status ON public.partner_incentive_schemes USING btree (tenant_id, status, effective_from DESC);
CREATE INDEX idx_partner_incentive_slabs_scheme_order ON public.partner_incentive_slabs USING btree (scheme_id, sort_order, min_business);
CREATE INDEX idx_partner_incentive_slabs_tenant_range ON public.partner_incentive_slabs USING btree (tenant_id, scheme_id, min_business, max_business);
CREATE INDEX idx_partner_reward_redemptions_partner ON public.partner_reward_redemptions USING btree (tenant_id, partner_id, requested_at DESC);
CREATE INDEX idx_payment_guarantees_customer_id ON public.payment_guarantees USING btree (customer_id);
CREATE INDEX idx_payment_guarantees_site_id ON public.payment_guarantees USING btree (site_id);
CREATE INDEX idx_payment_guarantees_tenant_id ON public.payment_guarantees USING btree (tenant_id);
CREATE INDEX idx_platform_event_outbox_event_type ON public.platform_event_outbox USING btree (event_type, occurred_at DESC);
CREATE INDEX idx_platform_event_outbox_status_available ON public.platform_event_outbox USING btree (status, available_at);
CREATE INDEX idx_procurement_fee_entries_ledger_tx_id ON public.procurement_fee_entries USING btree (ledger_tx_id);
CREATE INDEX idx_procurement_fee_entries_site_order_id ON public.procurement_fee_entries USING btree (site_order_id);
CREATE INDEX idx_procurement_fee_entries_tenant_id ON public.procurement_fee_entries USING btree (tenant_id);
CREATE INDEX idx_product_brands_tenant_id ON public.product_brands USING btree (tenant_id);
CREATE INDEX idx_product_categories_commission_type ON public.product_categories USING btree (tenant_id, commission_type);
CREATE INDEX idx_product_categories_tenant_id ON public.product_categories USING btree (tenant_id);
CREATE INDEX idx_product_requests_matched_product_id ON public.product_requests USING btree (matched_product_id);
CREATE INDEX idx_product_requests_requested_by ON public.product_requests USING btree (requested_by_user_id);
CREATE INDEX idx_product_requests_site_id ON public.product_requests USING btree (site_id);
CREATE INDEX idx_product_requests_status ON public.product_requests USING btree (status);
CREATE INDEX idx_product_requests_tenant_id ON public.product_requests USING btree (tenant_id);
CREATE INDEX idx_products_brand_id ON public.products USING btree (brand_id);
CREATE INDEX idx_products_category_id ON public.products USING btree (category_id);
CREATE INDEX idx_products_tenant_category ON public.products USING btree (tenant_id, category_id);
CREATE INDEX idx_project_bids_bidder_user_id ON public.project_bids USING btree (bidder_user_id);
CREATE INDEX idx_project_bids_site_id ON public.project_bids USING btree (site_id);
CREATE INDEX idx_project_bids_tenant_id ON public.project_bids USING btree (tenant_id);
CREATE INDEX idx_project_media_project_created ON public.project_media USING btree (project_id, created_at DESC);
CREATE INDEX idx_project_media_recipient_user ON public.project_media_recipients USING btree (recipient_user_id, media_id);
CREATE INDEX idx_project_members_user_status ON public.project_members USING btree (user_id, status);
CREATE INDEX idx_project_rooms_project ON public.project_rooms USING btree (project_id, sort_order);
CREATE INDEX idx_project_tasks_project_status ON public.project_tasks USING btree (project_id, status, deadline);
CREATE INDEX idx_projects_tenant_status ON public.projects USING btree (tenant_id, status);
CREATE INDEX idx_referral_events_referral_code_id ON public.referral_events USING btree (referral_code_id);
CREATE INDEX idx_referral_events_referral_program_id ON public.referral_events USING btree (referral_program_id);
CREATE INDEX idx_referral_events_tenant_id ON public.referral_events USING btree (tenant_id, created_at DESC);
CREATE INDEX idx_referral_rewards_referral_event_id ON public.referral_rewards USING btree (referral_event_id);
CREATE INDEX idx_referral_rewards_tenant_id ON public.referral_rewards USING btree (tenant_id);
CREATE INDEX idx_referral_rewards_wallet_account_id ON public.referral_rewards USING btree (wallet_account_id);
CREATE INDEX idx_referral_rewards_wallet_ledger_entry_id ON public.referral_rewards USING btree (wallet_ledger_entry_id);
CREATE INDEX idx_repayment_schedules_contractor_id ON public.repayment_schedules USING btree (contractor_id);
CREATE INDEX idx_repayment_schedules_due ON public.repayment_schedules USING btree (tenant_id, due_date, status);
CREATE INDEX idx_repayment_schedules_site_order_id ON public.repayment_schedules USING btree (site_order_id);
CREATE INDEX idx_requirement_batch_dictionary_term ON public.requirement_batch_dictionaries USING btree (tenant_id, term, normalized_term);
CREATE INDEX idx_requirement_batch_candidates_item ON public.requirement_batch_item_candidates USING btree (requirement_batch_item_id, final_score DESC);
CREATE INDEX idx_requirement_batch_items_batch ON public.requirement_batch_items USING btree (requirement_batch_id, review_status, created_at);
CREATE INDEX idx_requirement_batch_items_match ON public.requirement_batch_items USING btree (tenant_id, matched_product_id, match_confidence);
CREATE INDEX idx_requirement_batch_jobs_batch_stage ON public.requirement_batch_processing_jobs USING btree (requirement_batch_id, stage, created_at DESC);
CREATE INDEX idx_requirement_batch_sources_batch ON public.requirement_batch_sources USING btree (requirement_batch_id, created_at);
CREATE INDEX idx_requirement_batches_status ON public.requirement_batches USING btree (tenant_id, status, review_status);
CREATE INDEX idx_requirement_batches_tenant_created ON public.requirement_batches USING btree (tenant_id, created_at DESC);
CREATE INDEX idx_site_assignments_site_id ON public.site_assignments USING btree (site_id);
CREATE INDEX idx_site_assignments_user_id ON public.site_assignments USING btree (user_id);
CREATE INDEX idx_site_notes_site_id ON public.site_notes USING btree (site_id);
CREATE INDEX idx_site_orders_site_id ON public.site_orders USING btree (site_id);
CREATE INDEX idx_sites_customer_id ON public.sites USING btree (customer_id);
CREATE INDEX idx_sites_status ON public.sites USING btree (status);
CREATE UNIQUE INDEX idx_state_transition_catalog_unique ON public.state_transition_catalog USING btree (entity_type, from_state, transition_key, allowed_actor_scope);
CREATE INDEX idx_system_events_entity_created_at ON public.system_events USING btree (tenant_id, entity_type, entity_id, created_at DESC);
CREATE INDEX idx_system_events_tenant_created_at ON public.system_events USING btree (tenant_id, created_at DESC);
CREATE INDEX idx_tasks_category_status ON public.tasks USING btree (tenant_id, category, status);
CREATE INDEX idx_tasks_tenant_status ON public.tasks USING btree (tenant_id, status);
CREATE INDEX idx_wallet_ledger_entries_tenant_id ON public.wallet_ledger_entries USING btree (tenant_id, created_at DESC);
CREATE INDEX idx_wallet_ledger_entries_wallet_account_id ON public.wallet_ledger_entries USING btree (wallet_account_id, created_at DESC);
CREATE INDEX idx_workflow_logs_entity ON public.workflow_logs USING btree (tenant_id, workflow_name, entity_type, entity_id);

-- ── TRIGGERS ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_budget_trackers_updated_at ON public.budget_trackers;
CREATE TRIGGER trg_budget_trackers_updated_at BEFORE UPDATE ON budget_trackers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_content_posts_updated_at ON public.content_posts;
CREATE TRIGGER trg_content_posts_updated_at BEFORE UPDATE ON content_posts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_contractor_risk_profiles_updated_at ON public.contractor_risk_profiles;
CREATE TRIGGER trg_contractor_risk_profiles_updated_at BEFORE UPDATE ON contractor_risk_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_contractor_subscription_plans_updated_at ON public.contractor_subscription_plans;
CREATE TRIGGER trg_contractor_subscription_plans_updated_at BEFORE UPDATE ON contractor_subscription_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_credit_limits_updated_at ON public.credit_limits;
CREATE TRIGGER trg_credit_limits_updated_at BEFORE UPDATE ON credit_limits FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_credit_requests_updated_at ON public.credit_requests;
CREATE TRIGGER trg_credit_requests_updated_at BEFORE UPDATE ON credit_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_escrow_accounts_updated_at ON public.escrow_accounts;
CREATE TRIGGER trg_escrow_accounts_updated_at BEFORE UPDATE ON escrow_accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_finance_applications_updated_at ON public.finance_applications;
CREATE TRIGGER trg_finance_applications_updated_at BEFORE UPDATE ON finance_applications FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_ledger_accounts_updated_at ON public.ledger_accounts;
CREATE TRIGGER trg_ledger_accounts_updated_at BEFORE UPDATE ON ledger_accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_lighting_products_updated_at ON public.lighting_products;
CREATE TRIGGER trg_lighting_products_updated_at BEFORE UPDATE ON lighting_products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_order_items_updated_at ON public.order_items;
CREATE TRIGGER trg_order_items_updated_at BEFORE UPDATE ON order_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_partner_incentive_order_item_supplied ON public.order_items;
CREATE TRIGGER trg_partner_incentive_order_item_supplied AFTER UPDATE OF status ON order_items FOR EACH ROW EXECUTE FUNCTION handle_partner_incentive_order_item_supplied();

DROP TRIGGER IF EXISTS trg_partner_business_summary_updated_at ON public.partner_business_summary;
CREATE TRIGGER trg_partner_business_summary_updated_at BEFORE UPDATE ON partner_business_summary FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_partner_incentive_schemes_updated_at ON public.partner_incentive_schemes;
CREATE TRIGGER trg_partner_incentive_schemes_updated_at BEFORE UPDATE ON partner_incentive_schemes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_partner_incentive_slabs_updated_at ON public.partner_incentive_slabs;
CREATE TRIGGER trg_partner_incentive_slabs_updated_at BEFORE UPDATE ON partner_incentive_slabs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_partner_points_wallet_updated_at ON public.partner_points_wallet;
CREATE TRIGGER trg_partner_points_wallet_updated_at BEFORE UPDATE ON partner_points_wallet FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_payment_guarantees_updated_at ON public.payment_guarantees;
CREATE TRIGGER trg_payment_guarantees_updated_at BEFORE UPDATE ON payment_guarantees FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_platform_event_outbox_updated_at ON public.platform_event_outbox;
CREATE TRIGGER trg_platform_event_outbox_updated_at BEFORE UPDATE ON platform_event_outbox FOR EACH ROW EXECUTE FUNCTION touch_platform_event_outbox_updated_at();

DROP TRIGGER IF EXISTS trg_procurement_fee_entries_updated_at ON public.procurement_fee_entries;
CREATE TRIGGER trg_procurement_fee_entries_updated_at BEFORE UPDATE ON procurement_fee_entries FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_product_brands_updated_at ON public.product_brands;
CREATE TRIGGER trg_product_brands_updated_at BEFORE UPDATE ON product_brands FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_product_categories_updated_at ON public.product_categories;
CREATE TRIGGER trg_product_categories_updated_at BEFORE UPDATE ON product_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_product_inventory_updated_at ON public.product_inventory;
CREATE TRIGGER trg_product_inventory_updated_at BEFORE UPDATE ON product_inventory FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_product_requests_notify ON public.product_requests;
CREATE TRIGGER trg_product_requests_notify AFTER INSERT OR UPDATE OF status, admin_notes, matched_product_id ON product_requests FOR EACH ROW EXECUTE FUNCTION create_product_request_notifications();

DROP TRIGGER IF EXISTS trg_product_requests_updated_at ON public.product_requests;
CREATE TRIGGER trg_product_requests_updated_at BEFORE UPDATE ON product_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_project_bids_updated_at ON public.project_bids;
CREATE TRIGGER trg_project_bids_updated_at BEFORE UPDATE ON project_bids FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_referral_programs_updated_at ON public.referral_programs;
CREATE TRIGGER trg_referral_programs_updated_at BEFORE UPDATE ON referral_programs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_referral_rewards_updated_at ON public.referral_rewards;
CREATE TRIGGER trg_referral_rewards_updated_at BEFORE UPDATE ON referral_rewards FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_repayment_schedules_updated_at ON public.repayment_schedules;
CREATE TRIGGER trg_repayment_schedules_updated_at BEFORE UPDATE ON repayment_schedules FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_savings_installments_updated_at ON public.savings_installments;
CREATE TRIGGER trg_savings_installments_updated_at BEFORE UPDATE ON savings_installments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_savings_plan_subscriptions_updated_at ON public.savings_plan_subscriptions;
CREATE TRIGGER trg_savings_plan_subscriptions_updated_at BEFORE UPDATE ON savings_plan_subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_savings_plan_templates_updated_at ON public.savings_plan_templates;
CREATE TRIGGER trg_savings_plan_templates_updated_at BEFORE UPDATE ON savings_plan_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_site_credit_profiles_updated_at ON public.site_credit_profiles;
CREATE TRIGGER trg_site_credit_profiles_updated_at BEFORE UPDATE ON site_credit_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_site_notes_notify ON public.site_notes;
CREATE TRIGGER trg_site_notes_notify AFTER INSERT ON site_notes FOR EACH ROW EXECUTE FUNCTION create_site_note_notifications();

DROP TRIGGER IF EXISTS trg_site_notes_updated_at ON public.site_notes;
CREATE TRIGGER trg_site_notes_updated_at BEFORE UPDATE ON site_notes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_site_orders_updated_at ON public.site_orders;
CREATE TRIGGER trg_site_orders_updated_at BEFORE UPDATE ON site_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_sites_updated_at ON public.sites;
CREATE TRIGGER trg_sites_updated_at BEFORE UPDATE ON sites FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trigger_set_default_site_code ON public.sites;
CREATE TRIGGER trigger_set_default_site_code BEFORE INSERT ON sites FOR EACH ROW EXECUTE FUNCTION set_default_site_code();

DROP TRIGGER IF EXISTS trg_substitute_suggestions_updated_at ON public.substitute_suggestions;
CREATE TRIGGER trg_substitute_suggestions_updated_at BEFORE UPDATE ON substitute_suggestions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_supplier_subscription_plans_updated_at ON public.supplier_subscription_plans;
CREATE TRIGGER trg_supplier_subscription_plans_updated_at BEFORE UPDATE ON supplier_subscription_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_tenant_branding_updated_at ON public.tenant_branding;
CREATE TRIGGER trg_tenant_branding_updated_at BEFORE UPDATE ON tenant_branding FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_tenant_memberships_updated_at ON public.tenant_memberships;
CREATE TRIGGER trg_tenant_memberships_updated_at BEFORE UPDATE ON tenant_memberships FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_tenants_updated_at ON public.tenants;
CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_urgency_pricing_updated_at ON public.urgency_pricing;
CREATE TRIGGER trg_urgency_pricing_updated_at BEFORE UPDATE ON urgency_pricing FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_user_professional_profiles_updated_at ON public.user_professional_profiles;
CREATE TRIGGER trg_user_professional_profiles_updated_at BEFORE UPDATE ON user_professional_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated AFTER UPDATE OF email, phone, raw_user_meta_data, last_sign_in_at ON auth.users FOR EACH ROW EXECUTE FUNCTION sync_auth_user_profile();

DROP TRIGGER IF EXISTS trg_users_admin_limit ON public.users;
CREATE TRIGGER trg_users_admin_limit BEFORE INSERT OR UPDATE OF role ON users FOR EACH ROW EXECUTE FUNCTION enforce_admin_limit();

DROP TRIGGER IF EXISTS trg_users_identity_uniqueness ON public.users;
CREATE TRIGGER trg_users_identity_uniqueness BEFORE INSERT OR UPDATE ON users FOR EACH ROW EXECUTE FUNCTION enforce_public_user_identity_uniqueness();

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_create_user_wallet ON public.users;
CREATE TRIGGER trg_create_user_wallet AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION handle_new_user_wallet();

DROP TRIGGER IF EXISTS trg_wallet_accounts_updated_at ON public.wallet_accounts;
CREATE TRIGGER trg_wallet_accounts_updated_at BEFORE UPDATE ON wallet_accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS tr_wallet_ledger_update ON public.wallet_ledger_entries;
CREATE TRIGGER tr_wallet_ledger_update AFTER INSERT ON wallet_ledger_entries FOR EACH ROW EXECUTE FUNCTION handle_wallet_ledger_entry();

-- ── ROW LEVEL SECURITY ────────────────────────────────────────────────────
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_trackers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_risk_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escrow_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escrow_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lighting_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_business_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_commission_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_incentive_schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_incentive_slabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_points_wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_reward_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_scheme_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_slab_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_guarantees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_event_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_fee_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_media_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repayment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirement_batch_dictionaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirement_batch_item_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirement_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirement_batch_processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirement_batch_review_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirement_batch_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirement_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_plan_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_plan_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_credit_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.state_transition_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.substitute_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urgency_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_professional_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_balance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated USING (can_administer_tenant(tenant_id));

DROP POLICY IF EXISTS bids_insert ON public.bids;
CREATE POLICY bids_insert ON public.bids FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = bids.task_id) AND can_access_tenant(t.tenant_id)))));

DROP POLICY IF EXISTS bids_select ON public.bids;
CREATE POLICY bids_select ON public.bids FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = bids.task_id) AND can_access_tenant(t.tenant_id)))));

DROP POLICY IF EXISTS bids_update ON public.bids;
CREATE POLICY bids_update ON public.bids FOR UPDATE TO authenticated USING (((current_profile_id() = handyman_id) OR (EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = bids.task_id) AND can_administer_tenant(t.tenant_id)))))) WITH CHECK (((current_profile_id() = handyman_id) OR (EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = bids.task_id) AND can_administer_tenant(t.tenant_id))))));

DROP POLICY IF EXISTS budget_access ON public.budget_trackers;
CREATE POLICY budget_access ON public.budget_trackers FOR SELECT TO authenticated USING (can_access_site(site_id));

DROP POLICY IF EXISTS budget_write ON public.budget_trackers;
CREATE POLICY budget_write ON public.budget_trackers FOR ALL TO authenticated USING ((is_admin_user() OR (EXISTS ( SELECT 1
   FROM sites s
  WHERE ((s.id = budget_trackers.site_id) AND (s.customer_id = current_profile_id())))))) WITH CHECK ((is_admin_user() OR (EXISTS ( SELECT 1
   FROM sites s
  WHERE ((s.id = budget_trackers.site_id) AND (s.customer_id = current_profile_id()))))));

DROP POLICY IF EXISTS content_read ON public.content_posts;
CREATE POLICY content_read ON public.content_posts FOR SELECT TO authenticated USING ((is_admin_user() OR (is_published = true)));

DROP POLICY IF EXISTS content_write ON public.content_posts;
CREATE POLICY content_write ON public.content_posts FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS risk_profiles_select ON public.contractor_risk_profiles;
CREATE POLICY risk_profiles_select ON public.contractor_risk_profiles FOR SELECT TO authenticated USING ((can_access_tenant(tenant_id) AND (is_admin_user() OR (user_id = current_profile_id()))));

DROP POLICY IF EXISTS contractor_plans_select ON public.contractor_subscription_plans;
CREATE POLICY contractor_plans_select ON public.contractor_subscription_plans FOR SELECT TO authenticated USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS contractor_plans_write ON public.contractor_subscription_plans;
CREATE POLICY contractor_plans_write ON public.contractor_subscription_plans FOR ALL TO authenticated USING (can_administer_tenant(tenant_id)) WITH CHECK (can_administer_tenant(tenant_id));

DROP POLICY IF EXISTS credit_limits_select ON public.credit_limits;
CREATE POLICY credit_limits_select ON public.credit_limits FOR SELECT TO authenticated USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS credit_limits_write ON public.credit_limits;
CREATE POLICY credit_limits_write ON public.credit_limits FOR ALL TO authenticated USING (can_administer_tenant(tenant_id)) WITH CHECK (can_administer_tenant(tenant_id));

DROP POLICY IF EXISTS credit_requests_insert ON public.credit_requests;
CREATE POLICY credit_requests_insert ON public.credit_requests FOR INSERT TO authenticated WITH CHECK ((can_access_tenant(tenant_id) AND (contractor_id = current_profile_id())));

DROP POLICY IF EXISTS credit_requests_select ON public.credit_requests;
CREATE POLICY credit_requests_select ON public.credit_requests FOR SELECT TO authenticated USING ((can_access_tenant(tenant_id) AND (is_admin_user() OR (contractor_id = current_profile_id()))));

DROP POLICY IF EXISTS escrow_accounts_select ON public.escrow_accounts;
CREATE POLICY escrow_accounts_select ON public.escrow_accounts FOR SELECT TO authenticated USING ((can_access_tenant(tenant_id) AND (is_admin_user() OR (customer_id = current_profile_id()) OR (EXISTS ( SELECT 1
   FROM site_orders so
  WHERE ((so.id = escrow_accounts.site_order_id) AND ((so.electrician_id = current_profile_id()) OR (so.architect_id = current_profile_id()))))))));

DROP POLICY IF EXISTS escrow_transactions_insert ON public.escrow_transactions;
CREATE POLICY escrow_transactions_insert ON public.escrow_transactions FOR INSERT TO authenticated WITH CHECK (can_administer_tenant(tenant_id));

DROP POLICY IF EXISTS escrow_transactions_select ON public.escrow_transactions;
CREATE POLICY escrow_transactions_select ON public.escrow_transactions FOR SELECT TO authenticated USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS escrow_transactions_update ON public.escrow_transactions;
CREATE POLICY escrow_transactions_update ON public.escrow_transactions FOR UPDATE TO authenticated USING (can_administer_tenant(tenant_id)) WITH CHECK (can_administer_tenant(tenant_id));

DROP POLICY IF EXISTS finance_access ON public.finance_applications;
CREATE POLICY finance_access ON public.finance_applications FOR SELECT TO authenticated USING ((is_admin_user() OR (customer_id = current_profile_id())));

DROP POLICY IF EXISTS finance_write ON public.finance_applications;
CREATE POLICY finance_write ON public.finance_applications FOR ALL TO authenticated USING ((is_admin_user() OR (customer_id = current_profile_id()))) WITH CHECK ((is_admin_user() OR (customer_id = current_profile_id())));

DROP POLICY IF EXISTS leads_insert_accessible ON public.leads;
CREATE POLICY leads_insert_accessible ON public.leads FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.auth_user_id = auth.uid()) AND (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = leads.tenant_id) AND (tm.user_id = u.id) AND (tm.is_active = true)))) AND ((leads.requester_user_id IS NULL) OR (leads.requester_user_id = u.id) OR (u.role = 'admin'::user_role))))));

DROP POLICY IF EXISTS leads_select_own_or_admin ON public.leads;
CREATE POLICY leads_select_own_or_admin ON public.leads FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.auth_user_id = auth.uid()) AND (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = leads.tenant_id) AND (tm.user_id = u.id) AND (tm.is_active = true)))) AND ((u.role = 'admin'::user_role) OR (leads.requester_user_id = u.id))))));

DROP POLICY IF EXISTS leads_update_admin_only ON public.leads;
CREATE POLICY leads_update_admin_only ON public.leads FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.auth_user_id = auth.uid()) AND (u.role = 'admin'::user_role) AND (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = leads.tenant_id) AND (tm.user_id = u.id) AND (tm.is_active = true)))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.auth_user_id = auth.uid()) AND (u.role = 'admin'::user_role) AND (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = leads.tenant_id) AND (tm.user_id = u.id) AND (tm.is_active = true))))))));

DROP POLICY IF EXISTS ledger_accounts_admin_all ON public.ledger_accounts;
CREATE POLICY ledger_accounts_admin_all ON public.ledger_accounts FOR ALL TO authenticated USING (is_admin_user());

DROP POLICY IF EXISTS ledger_accounts_select_policy ON public.ledger_accounts;
CREATE POLICY ledger_accounts_select_policy ON public.ledger_accounts FOR SELECT TO authenticated USING ((can_access_tenant(tenant_id) AND (is_admin_user() OR (user_id = current_profile_id()))));

DROP POLICY IF EXISTS ledger_entries_select ON public.ledger_entries;
CREATE POLICY ledger_entries_select ON public.ledger_entries FOR SELECT TO authenticated USING ((can_access_tenant(tenant_id) AND (is_admin_user() OR (EXISTS ( SELECT 1
   FROM ledger_accounts la
  WHERE ((la.id = ledger_entries.account_id) AND (la.user_id = current_profile_id())))))));

DROP POLICY IF EXISTS ledger_transactions_select ON public.ledger_transactions;
CREATE POLICY ledger_transactions_select ON public.ledger_transactions FOR SELECT TO authenticated USING ((can_access_tenant(tenant_id) AND (is_admin_user() OR (EXISTS ( SELECT 1
   FROM (ledger_entries le
     JOIN ledger_accounts la ON ((la.id = le.account_id)))
  WHERE ((le.transaction_id = ledger_transactions.id) AND (la.user_id = current_profile_id())))))));

DROP POLICY IF EXISTS lighting_products_admin_write ON public.lighting_products;
CREATE POLICY lighting_products_admin_write ON public.lighting_products FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.auth_user_id = auth.uid()) AND (u.role = 'admin'::user_role) AND (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = lighting_products.tenant_id) AND (tm.user_id = u.id) AND (tm.is_active = true)))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.auth_user_id = auth.uid()) AND (u.role = 'admin'::user_role) AND (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = lighting_products.tenant_id) AND (tm.user_id = u.id) AND (tm.is_active = true))))))));

DROP POLICY IF EXISTS lighting_products_select_accessible ON public.lighting_products;
CREATE POLICY lighting_products_select_accessible ON public.lighting_products FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.auth_user_id = auth.uid()) AND ((u.role = 'admin'::user_role) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = lighting_products.tenant_id) AND (tm.user_id = u.id) AND (tm.is_active = true)))))))));

DROP POLICY IF EXISTS notifications_access ON public.notifications;
CREATE POLICY notifications_access ON public.notifications FOR SELECT TO authenticated USING ((is_admin_user() OR (user_id = current_profile_id())));

DROP POLICY IF EXISTS notifications_write ON public.notifications;
CREATE POLICY notifications_write ON public.notifications FOR ALL TO authenticated USING ((is_admin_user() OR (user_id = current_profile_id()))) WITH CHECK ((is_admin_user() OR (user_id = current_profile_id())));

DROP POLICY IF EXISTS order_item_history_access ON public.order_item_status_history;
CREATE POLICY order_item_history_access ON public.order_item_status_history FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM order_items oi
  WHERE ((oi.id = order_item_status_history.order_item_id) AND can_access_site(oi.site_id)))));

DROP POLICY IF EXISTS order_items_access ON public.order_items;
CREATE POLICY order_items_access ON public.order_items FOR SELECT TO authenticated USING (can_access_site(site_id));

DROP POLICY IF EXISTS order_items_supplier_read ON public.order_items;
CREATE POLICY order_items_supplier_read ON public.order_items FOR SELECT TO authenticated USING ((current_profile_role() = 'supplier'::user_role));

DROP POLICY IF EXISTS order_items_supplier_update ON public.order_items;
CREATE POLICY order_items_supplier_update ON public.order_items FOR UPDATE TO authenticated USING ((current_profile_role() = 'supplier'::user_role)) WITH CHECK ((current_profile_role() = 'supplier'::user_role));

DROP POLICY IF EXISTS order_items_write ON public.order_items;
CREATE POLICY order_items_write ON public.order_items FOR ALL TO authenticated USING ((can_manage_site_as_contractor(site_id) OR (EXISTS ( SELECT 1
   FROM sites s
  WHERE ((s.id = order_items.site_id) AND (s.customer_id = current_profile_id())))))) WITH CHECK ((can_manage_site_as_contractor(site_id) OR (EXISTS ( SELECT 1
   FROM sites s
  WHERE ((s.id = order_items.site_id) AND (s.customer_id = current_profile_id()))))));

DROP POLICY IF EXISTS partner_business_summary_admin_write ON public.partner_business_summary;
CREATE POLICY partner_business_summary_admin_write ON public.partner_business_summary FOR ALL TO authenticated USING ((is_admin_user() AND can_access_tenant(tenant_id))) WITH CHECK ((is_admin_user() AND can_access_tenant(tenant_id)));

DROP POLICY IF EXISTS partner_business_summary_read ON public.partner_business_summary;
CREATE POLICY partner_business_summary_read ON public.partner_business_summary FOR SELECT TO authenticated USING ((is_admin_user() OR (partner_id = current_profile_id())));

DROP POLICY IF EXISTS partner_commission_ledger_admin_write ON public.partner_commission_ledger;
CREATE POLICY partner_commission_ledger_admin_write ON public.partner_commission_ledger FOR ALL TO authenticated USING ((is_admin_user() AND can_access_tenant(tenant_id))) WITH CHECK ((is_admin_user() AND can_access_tenant(tenant_id)));

DROP POLICY IF EXISTS partner_commission_ledger_read ON public.partner_commission_ledger;
CREATE POLICY partner_commission_ledger_read ON public.partner_commission_ledger FOR SELECT TO authenticated USING ((is_admin_user() OR (partner_id = current_profile_id())));

DROP POLICY IF EXISTS partner_incentive_schemes_admin_write ON public.partner_incentive_schemes;
CREATE POLICY partner_incentive_schemes_admin_write ON public.partner_incentive_schemes FOR ALL TO authenticated USING ((is_admin_user() AND can_access_tenant(tenant_id))) WITH CHECK ((is_admin_user() AND can_access_tenant(tenant_id)));

DROP POLICY IF EXISTS partner_incentive_schemes_read ON public.partner_incentive_schemes;
CREATE POLICY partner_incentive_schemes_read ON public.partner_incentive_schemes FOR SELECT TO authenticated USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS partner_incentive_slabs_admin_write ON public.partner_incentive_slabs;
CREATE POLICY partner_incentive_slabs_admin_write ON public.partner_incentive_slabs FOR ALL TO authenticated USING ((is_admin_user() AND can_access_tenant(tenant_id))) WITH CHECK ((is_admin_user() AND can_access_tenant(tenant_id)));

DROP POLICY IF EXISTS partner_incentive_slabs_read ON public.partner_incentive_slabs;
CREATE POLICY partner_incentive_slabs_read ON public.partner_incentive_slabs FOR SELECT TO authenticated USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS partner_points_wallet_admin_write ON public.partner_points_wallet;
CREATE POLICY partner_points_wallet_admin_write ON public.partner_points_wallet FOR ALL TO authenticated USING ((is_admin_user() AND can_access_tenant(tenant_id))) WITH CHECK ((is_admin_user() AND can_access_tenant(tenant_id)));

DROP POLICY IF EXISTS partner_points_wallet_read ON public.partner_points_wallet;
CREATE POLICY partner_points_wallet_read ON public.partner_points_wallet FOR SELECT TO authenticated USING ((is_admin_user() OR (partner_id = current_profile_id())));

DROP POLICY IF EXISTS partner_reward_redemptions_admin_update ON public.partner_reward_redemptions;
CREATE POLICY partner_reward_redemptions_admin_update ON public.partner_reward_redemptions FOR UPDATE TO authenticated USING ((is_admin_user() AND can_access_tenant(tenant_id))) WITH CHECK ((is_admin_user() AND can_access_tenant(tenant_id)));

DROP POLICY IF EXISTS partner_reward_redemptions_insert_self ON public.partner_reward_redemptions;
CREATE POLICY partner_reward_redemptions_insert_self ON public.partner_reward_redemptions FOR INSERT TO authenticated WITH CHECK (((partner_id = current_profile_id()) AND can_access_tenant(tenant_id)));

DROP POLICY IF EXISTS partner_reward_redemptions_read ON public.partner_reward_redemptions;
CREATE POLICY partner_reward_redemptions_read ON public.partner_reward_redemptions FOR SELECT TO authenticated USING ((is_admin_user() OR (partner_id = current_profile_id())));

DROP POLICY IF EXISTS partner_scheme_history_admin_read ON public.partner_scheme_history;
CREATE POLICY partner_scheme_history_admin_read ON public.partner_scheme_history FOR SELECT TO authenticated USING ((is_admin_user() AND can_access_tenant(tenant_id)));

DROP POLICY IF EXISTS partner_scheme_history_admin_write ON public.partner_scheme_history;
CREATE POLICY partner_scheme_history_admin_write ON public.partner_scheme_history FOR ALL TO authenticated USING ((is_admin_user() AND can_access_tenant(tenant_id))) WITH CHECK ((is_admin_user() AND can_access_tenant(tenant_id)));

DROP POLICY IF EXISTS partner_slab_history_admin_write ON public.partner_slab_history;
CREATE POLICY partner_slab_history_admin_write ON public.partner_slab_history FOR ALL TO authenticated USING ((is_admin_user() AND can_access_tenant(tenant_id))) WITH CHECK ((is_admin_user() AND can_access_tenant(tenant_id)));

DROP POLICY IF EXISTS partner_slab_history_read ON public.partner_slab_history;
CREATE POLICY partner_slab_history_read ON public.partner_slab_history FOR SELECT TO authenticated USING ((is_admin_user() OR (partner_id = current_profile_id())));

DROP POLICY IF EXISTS payment_guarantees_insert ON public.payment_guarantees;
CREATE POLICY payment_guarantees_insert ON public.payment_guarantees FOR INSERT TO authenticated WITH CHECK (can_administer_tenant(tenant_id));

DROP POLICY IF EXISTS payment_guarantees_select ON public.payment_guarantees;
CREATE POLICY payment_guarantees_select ON public.payment_guarantees FOR SELECT TO authenticated USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS payment_guarantees_update ON public.payment_guarantees;
CREATE POLICY payment_guarantees_update ON public.payment_guarantees FOR UPDATE TO authenticated USING (can_administer_tenant(tenant_id)) WITH CHECK (can_administer_tenant(tenant_id));

DROP POLICY IF EXISTS platform_roles_admin_write ON public.platform_roles;
CREATE POLICY platform_roles_admin_write ON public.platform_roles FOR ALL TO authenticated USING ((is_admin_user() AND can_access_tenant(tenant_id))) WITH CHECK ((is_admin_user() AND can_access_tenant(tenant_id)));

DROP POLICY IF EXISTS platform_roles_read ON public.platform_roles;
CREATE POLICY platform_roles_read ON public.platform_roles FOR SELECT TO authenticated USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS procurement_fee_entries_insert ON public.procurement_fee_entries;
CREATE POLICY procurement_fee_entries_insert ON public.procurement_fee_entries FOR INSERT TO authenticated WITH CHECK (can_administer_tenant(tenant_id));

DROP POLICY IF EXISTS procurement_fee_entries_select ON public.procurement_fee_entries;
CREATE POLICY procurement_fee_entries_select ON public.procurement_fee_entries FOR SELECT TO authenticated USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS product_brands_admin_write ON public.product_brands;
CREATE POLICY product_brands_admin_write ON public.product_brands FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS product_brands_read ON public.product_brands;
CREATE POLICY product_brands_read ON public.product_brands FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS product_categories_admin_write ON public.product_categories;
CREATE POLICY product_categories_admin_write ON public.product_categories FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS product_categories_read ON public.product_categories;
CREATE POLICY product_categories_read ON public.product_categories FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS product_inventory_admin_write ON public.product_inventory;
CREATE POLICY product_inventory_admin_write ON public.product_inventory FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS product_inventory_read ON public.product_inventory;
CREATE POLICY product_inventory_read ON public.product_inventory FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS product_inventory_supplier_update ON public.product_inventory;
CREATE POLICY product_inventory_supplier_update ON public.product_inventory FOR UPDATE TO authenticated USING ((current_profile_role() = 'supplier'::user_role)) WITH CHECK ((current_profile_role() = 'supplier'::user_role));

DROP POLICY IF EXISTS product_requests_access ON public.product_requests;
CREATE POLICY product_requests_access ON public.product_requests FOR SELECT TO authenticated USING ((can_access_site(site_id) OR (requested_by_user_id = current_profile_id())));

DROP POLICY IF EXISTS product_requests_delete ON public.product_requests;
CREATE POLICY product_requests_delete ON public.product_requests FOR DELETE TO authenticated USING ((is_admin_user() OR (requested_by_user_id = current_profile_id())));

DROP POLICY IF EXISTS product_requests_insert ON public.product_requests;
CREATE POLICY product_requests_insert ON public.product_requests FOR INSERT TO authenticated WITH CHECK ((is_admin_user() OR ((requested_by_user_id = current_profile_id()) AND (current_profile_role() = 'architect'::user_role) AND can_manage_site_as_contractor(site_id))));

DROP POLICY IF EXISTS product_requests_update ON public.product_requests;
CREATE POLICY product_requests_update ON public.product_requests FOR UPDATE TO authenticated USING ((is_admin_user() OR (requested_by_user_id = current_profile_id()))) WITH CHECK ((is_admin_user() OR (requested_by_user_id = current_profile_id())));

DROP POLICY IF EXISTS products_admin_write ON public.products;
CREATE POLICY products_admin_write ON public.products FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS products_read ON public.products;
CREATE POLICY products_read ON public.products FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS project_bids_access ON public.project_bids;
CREATE POLICY project_bids_access ON public.project_bids FOR SELECT TO authenticated USING ((is_admin_user() OR (bidder_user_id = current_profile_id()) OR can_access_site(site_id)));

DROP POLICY IF EXISTS project_bids_write ON public.project_bids;
CREATE POLICY project_bids_write ON public.project_bids FOR ALL TO authenticated USING ((is_admin_user() OR (bidder_user_id = current_profile_id()))) WITH CHECK ((is_admin_user() OR (bidder_user_id = current_profile_id())));

DROP POLICY IF EXISTS project_media_insert ON public.project_media;
CREATE POLICY project_media_insert ON public.project_media FOR INSERT TO authenticated WITH CHECK (((uploaded_by = current_profile_id()) AND (shared_by = current_profile_id()) AND can_access_project(project_id) AND can_access_tenant(tenant_id)));

DROP POLICY IF EXISTS project_media_read ON public.project_media;
CREATE POLICY project_media_read ON public.project_media FOR SELECT TO authenticated USING (can_access_project_media(id));

DROP POLICY IF EXISTS project_media_update ON public.project_media;
CREATE POLICY project_media_update ON public.project_media FOR UPDATE TO authenticated USING (((uploaded_by = current_profile_id()) OR (shared_by = current_profile_id()) OR is_admin_user())) WITH CHECK (((uploaded_by = current_profile_id()) OR (shared_by = current_profile_id()) OR is_admin_user()));

DROP POLICY IF EXISTS project_media_recipients_insert ON public.project_media_recipients;
CREATE POLICY project_media_recipients_insert ON public.project_media_recipients FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM project_media media
  WHERE ((media.id = project_media_recipients.media_id) AND ((media.uploaded_by = current_profile_id()) OR (media.shared_by = current_profile_id()) OR is_admin_user())))));

DROP POLICY IF EXISTS project_media_recipients_read ON public.project_media_recipients;
CREATE POLICY project_media_recipients_read ON public.project_media_recipients FOR SELECT TO authenticated USING (can_access_project_media(media_id));

DROP POLICY IF EXISTS project_members_read ON public.project_members;
CREATE POLICY project_members_read ON public.project_members FOR SELECT TO authenticated USING (can_access_project(project_id));

DROP POLICY IF EXISTS project_members_write ON public.project_members;
CREATE POLICY project_members_write ON public.project_members FOR ALL TO authenticated USING (can_access_project(project_id)) WITH CHECK (can_access_project(project_id));

DROP POLICY IF EXISTS project_rooms_access ON public.project_rooms;
CREATE POLICY project_rooms_access ON public.project_rooms FOR ALL TO authenticated USING (can_access_project(project_id)) WITH CHECK (can_access_project(project_id));

DROP POLICY IF EXISTS project_task_assignees_access ON public.project_task_assignees;
CREATE POLICY project_task_assignees_access ON public.project_task_assignees FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM project_tasks pt
  WHERE ((pt.id = project_task_assignees.task_id) AND can_access_project(pt.project_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM project_tasks pt
  WHERE ((pt.id = project_task_assignees.task_id) AND can_access_project(pt.project_id)))));

DROP POLICY IF EXISTS project_tasks_access ON public.project_tasks;
CREATE POLICY project_tasks_access ON public.project_tasks FOR ALL TO authenticated USING (can_access_project(project_id)) WITH CHECK (can_access_project(project_id));

DROP POLICY IF EXISTS projects_insert ON public.projects;
CREATE POLICY projects_insert ON public.projects FOR INSERT TO authenticated WITH CHECK ((can_access_tenant(tenant_id) AND (is_admin_user() OR (created_by = current_profile_id()) OR (customer_id = current_profile_id()))));

DROP POLICY IF EXISTS projects_read ON public.projects;
CREATE POLICY projects_read ON public.projects FOR SELECT TO authenticated USING (can_access_project(id));

DROP POLICY IF EXISTS projects_update ON public.projects;
CREATE POLICY projects_update ON public.projects FOR UPDATE TO authenticated USING (can_access_project(id)) WITH CHECK (can_access_project(id));

DROP POLICY IF EXISTS referral_codes_select ON public.referral_codes;
CREATE POLICY referral_codes_select ON public.referral_codes FOR SELECT TO authenticated USING ((can_access_tenant(tenant_id) AND (can_administer_tenant(tenant_id) OR (user_id = current_profile_id()))));

DROP POLICY IF EXISTS referral_codes_write ON public.referral_codes;
CREATE POLICY referral_codes_write ON public.referral_codes FOR ALL TO authenticated USING ((can_administer_tenant(tenant_id) OR (user_id = current_profile_id()))) WITH CHECK ((can_access_tenant(tenant_id) AND (can_administer_tenant(tenant_id) OR (user_id = current_profile_id()))));

DROP POLICY IF EXISTS referral_events_select ON public.referral_events;
CREATE POLICY referral_events_select ON public.referral_events FOR SELECT TO authenticated USING ((can_access_tenant(tenant_id) AND (can_administer_tenant(tenant_id) OR (referrer_user_id = current_profile_id()) OR (referred_user_id = current_profile_id()))));

DROP POLICY IF EXISTS referral_events_write ON public.referral_events;
CREATE POLICY referral_events_write ON public.referral_events FOR ALL TO authenticated USING (can_administer_tenant(tenant_id)) WITH CHECK (can_administer_tenant(tenant_id));

DROP POLICY IF EXISTS referral_programs_select ON public.referral_programs;
CREATE POLICY referral_programs_select ON public.referral_programs FOR SELECT TO authenticated USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS referral_programs_write ON public.referral_programs;
CREATE POLICY referral_programs_write ON public.referral_programs FOR ALL TO authenticated USING (can_administer_tenant(tenant_id)) WITH CHECK (can_administer_tenant(tenant_id));

DROP POLICY IF EXISTS referral_rewards_select ON public.referral_rewards;
CREATE POLICY referral_rewards_select ON public.referral_rewards FOR SELECT TO authenticated USING ((can_access_tenant(tenant_id) AND (can_administer_tenant(tenant_id) OR (beneficiary_user_id = current_profile_id()))));

DROP POLICY IF EXISTS referral_rewards_write ON public.referral_rewards;
CREATE POLICY referral_rewards_write ON public.referral_rewards FOR ALL TO authenticated USING (can_administer_tenant(tenant_id)) WITH CHECK (can_administer_tenant(tenant_id));

DROP POLICY IF EXISTS repayment_schedules_insert ON public.repayment_schedules;
CREATE POLICY repayment_schedules_insert ON public.repayment_schedules FOR INSERT TO authenticated WITH CHECK (can_administer_tenant(tenant_id));

DROP POLICY IF EXISTS repayment_schedules_select ON public.repayment_schedules;
CREATE POLICY repayment_schedules_select ON public.repayment_schedules FOR SELECT TO authenticated USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS repayment_schedules_update ON public.repayment_schedules;
CREATE POLICY repayment_schedules_update ON public.repayment_schedules FOR UPDATE TO authenticated USING (can_administer_tenant(tenant_id)) WITH CHECK (can_administer_tenant(tenant_id));

DROP POLICY IF EXISTS req_batch_dicts_select ON public.requirement_batch_dictionaries;
CREATE POLICY req_batch_dicts_select ON public.requirement_batch_dictionaries FOR SELECT TO authenticated USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS req_batch_dicts_write ON public.requirement_batch_dictionaries;
CREATE POLICY req_batch_dicts_write ON public.requirement_batch_dictionaries FOR ALL TO authenticated USING (can_administer_tenant(tenant_id)) WITH CHECK (can_administer_tenant(tenant_id));

DROP POLICY IF EXISTS req_batch_candidates_select ON public.requirement_batch_item_candidates;
CREATE POLICY req_batch_candidates_select ON public.requirement_batch_item_candidates FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM requirement_batch_items rbi
  WHERE ((rbi.id = requirement_batch_item_candidates.requirement_batch_item_id) AND can_access_tenant(rbi.tenant_id)))));

DROP POLICY IF EXISTS req_batch_candidates_write ON public.requirement_batch_item_candidates;
CREATE POLICY req_batch_candidates_write ON public.requirement_batch_item_candidates FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM requirement_batch_items rbi
  WHERE ((rbi.id = requirement_batch_item_candidates.requirement_batch_item_id) AND can_access_tenant(rbi.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM requirement_batch_items rbi
  WHERE ((rbi.id = requirement_batch_item_candidates.requirement_batch_item_id) AND can_access_tenant(rbi.tenant_id)))));

DROP POLICY IF EXISTS req_batch_items_select ON public.requirement_batch_items;
CREATE POLICY req_batch_items_select ON public.requirement_batch_items FOR SELECT TO authenticated USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS req_batch_items_write ON public.requirement_batch_items;
CREATE POLICY req_batch_items_write ON public.requirement_batch_items FOR ALL TO authenticated USING (can_access_tenant(tenant_id)) WITH CHECK (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS req_batch_jobs_select ON public.requirement_batch_processing_jobs;
CREATE POLICY req_batch_jobs_select ON public.requirement_batch_processing_jobs FOR SELECT TO authenticated USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS req_batch_jobs_write ON public.requirement_batch_processing_jobs;
CREATE POLICY req_batch_jobs_write ON public.requirement_batch_processing_jobs FOR ALL TO authenticated USING (can_administer_tenant(tenant_id)) WITH CHECK (can_administer_tenant(tenant_id));

DROP POLICY IF EXISTS req_batch_reviews_insert ON public.requirement_batch_review_actions;
CREATE POLICY req_batch_reviews_insert ON public.requirement_batch_review_actions FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM requirement_batches rb
  WHERE ((rb.id = requirement_batch_review_actions.requirement_batch_id) AND can_access_tenant(rb.tenant_id)))));

DROP POLICY IF EXISTS req_batch_reviews_select ON public.requirement_batch_review_actions;
CREATE POLICY req_batch_reviews_select ON public.requirement_batch_review_actions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM requirement_batches rb
  WHERE ((rb.id = requirement_batch_review_actions.requirement_batch_id) AND can_access_tenant(rb.tenant_id)))));

DROP POLICY IF EXISTS req_batch_sources_select ON public.requirement_batch_sources;
CREATE POLICY req_batch_sources_select ON public.requirement_batch_sources FOR SELECT TO authenticated USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS req_batch_sources_write ON public.requirement_batch_sources;
CREATE POLICY req_batch_sources_write ON public.requirement_batch_sources FOR ALL TO authenticated USING (can_access_tenant(tenant_id)) WITH CHECK (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS requirement_batches_delete ON public.requirement_batches;
CREATE POLICY requirement_batches_delete ON public.requirement_batches FOR DELETE TO authenticated USING (can_administer_tenant(tenant_id));

DROP POLICY IF EXISTS requirement_batches_insert ON public.requirement_batches;
CREATE POLICY requirement_batches_insert ON public.requirement_batches FOR INSERT TO authenticated WITH CHECK (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS requirement_batches_select ON public.requirement_batches;
CREATE POLICY requirement_batches_select ON public.requirement_batches FOR SELECT TO authenticated USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS requirement_batches_update ON public.requirement_batches;
CREATE POLICY requirement_batches_update ON public.requirement_batches FOR UPDATE TO authenticated USING (can_access_tenant(tenant_id)) WITH CHECK (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS savings_installments_select ON public.savings_installments;
CREATE POLICY savings_installments_select ON public.savings_installments FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM savings_plan_subscriptions sps
  WHERE ((sps.id = savings_installments.subscription_id) AND can_access_tenant(sps.tenant_id) AND (can_administer_tenant(sps.tenant_id) OR (sps.user_id = current_profile_id()))))));

DROP POLICY IF EXISTS savings_installments_write ON public.savings_installments;
CREATE POLICY savings_installments_write ON public.savings_installments FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM savings_plan_subscriptions sps
  WHERE ((sps.id = savings_installments.subscription_id) AND can_administer_tenant(sps.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM savings_plan_subscriptions sps
  WHERE ((sps.id = savings_installments.subscription_id) AND can_administer_tenant(sps.tenant_id)))));

DROP POLICY IF EXISTS savings_subscriptions_select ON public.savings_plan_subscriptions;
CREATE POLICY savings_subscriptions_select ON public.savings_plan_subscriptions FOR SELECT TO authenticated USING ((can_access_tenant(tenant_id) AND (can_administer_tenant(tenant_id) OR (user_id = current_profile_id()))));

DROP POLICY IF EXISTS savings_subscriptions_write ON public.savings_plan_subscriptions;
CREATE POLICY savings_subscriptions_write ON public.savings_plan_subscriptions FOR ALL TO authenticated USING ((can_administer_tenant(tenant_id) OR (user_id = current_profile_id()))) WITH CHECK ((can_access_tenant(tenant_id) AND (can_administer_tenant(tenant_id) OR (user_id = current_profile_id()))));

DROP POLICY IF EXISTS savings_templates_select ON public.savings_plan_templates;
CREATE POLICY savings_templates_select ON public.savings_plan_templates FOR SELECT TO authenticated USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS savings_templates_write ON public.savings_plan_templates;
CREATE POLICY savings_templates_write ON public.savings_plan_templates FOR ALL TO authenticated USING (can_administer_tenant(tenant_id)) WITH CHECK (can_administer_tenant(tenant_id));

DROP POLICY IF EXISTS site_assignments_access ON public.site_assignments;
CREATE POLICY site_assignments_access ON public.site_assignments FOR SELECT TO authenticated USING (can_access_site(site_id));

DROP POLICY IF EXISTS site_assignments_admin_write ON public.site_assignments;
CREATE POLICY site_assignments_admin_write ON public.site_assignments FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS site_credit_profiles_select ON public.site_credit_profiles;
CREATE POLICY site_credit_profiles_select ON public.site_credit_profiles FOR SELECT TO authenticated USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS site_credit_profiles_write ON public.site_credit_profiles;
CREATE POLICY site_credit_profiles_write ON public.site_credit_profiles FOR ALL TO authenticated USING (can_administer_tenant(tenant_id)) WITH CHECK (can_administer_tenant(tenant_id));

DROP POLICY IF EXISTS site_notes_access ON public.site_notes;
CREATE POLICY site_notes_access ON public.site_notes FOR SELECT TO authenticated USING ((can_access_site(site_id) AND (is_admin_user() OR (sender_user_id = current_profile_id()) OR (recipient_user_id = current_profile_id()) OR (recipient_role IS NULL) OR (recipient_role = current_profile_role()))));

DROP POLICY IF EXISTS site_notes_delete ON public.site_notes;
CREATE POLICY site_notes_delete ON public.site_notes FOR DELETE TO authenticated USING ((is_admin_user() OR (sender_user_id = current_profile_id())));

DROP POLICY IF EXISTS site_notes_insert ON public.site_notes;
CREATE POLICY site_notes_insert ON public.site_notes FOR INSERT TO authenticated WITH CHECK (((sender_user_id = current_profile_id()) AND can_access_site(site_id)));

DROP POLICY IF EXISTS site_notes_update ON public.site_notes;
CREATE POLICY site_notes_update ON public.site_notes FOR UPDATE TO authenticated USING ((is_admin_user() OR (sender_user_id = current_profile_id()))) WITH CHECK ((is_admin_user() OR (sender_user_id = current_profile_id())));

DROP POLICY IF EXISTS site_orders_access ON public.site_orders;
CREATE POLICY site_orders_access ON public.site_orders FOR SELECT TO authenticated USING (can_access_site(site_id));

DROP POLICY IF EXISTS site_orders_supplier_read ON public.site_orders;
CREATE POLICY site_orders_supplier_read ON public.site_orders FOR SELECT TO authenticated USING ((current_profile_role() = 'supplier'::user_role));

DROP POLICY IF EXISTS site_orders_write ON public.site_orders;
CREATE POLICY site_orders_write ON public.site_orders FOR ALL TO authenticated USING ((is_admin_user() OR (customer_id = current_profile_id()))) WITH CHECK ((is_admin_user() OR (customer_id = current_profile_id())));

DROP POLICY IF EXISTS sites_access ON public.sites;
CREATE POLICY sites_access ON public.sites FOR SELECT TO authenticated USING (can_access_site(id));

DROP POLICY IF EXISTS sites_insert ON public.sites;
CREATE POLICY sites_insert ON public.sites FOR INSERT TO authenticated WITH CHECK ((is_admin_user() OR (customer_id = current_profile_id())));

DROP POLICY IF EXISTS sites_update ON public.sites;
CREATE POLICY sites_update ON public.sites FOR UPDATE TO authenticated USING ((is_admin_user() OR (customer_id = current_profile_id()))) WITH CHECK ((is_admin_user() OR (customer_id = current_profile_id())));

DROP POLICY IF EXISTS state_transition_catalog_select_access ON public.state_transition_catalog;
CREATE POLICY state_transition_catalog_select_access ON public.state_transition_catalog FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS substitute_access ON public.substitute_suggestions;
CREATE POLICY substitute_access ON public.substitute_suggestions FOR SELECT TO authenticated USING ((is_admin_user() OR (customer_id = current_profile_id()) OR (EXISTS ( SELECT 1
   FROM order_items oi
  WHERE ((oi.id = substitute_suggestions.original_order_item_id) AND can_access_site(oi.site_id))))));

DROP POLICY IF EXISTS substitute_suggestions_supplier_insert ON public.substitute_suggestions;
CREATE POLICY substitute_suggestions_supplier_insert ON public.substitute_suggestions FOR INSERT TO authenticated WITH CHECK (((current_profile_role() = 'supplier'::user_role) AND (suggested_by = current_profile_id())));

DROP POLICY IF EXISTS substitute_write ON public.substitute_suggestions;
CREATE POLICY substitute_write ON public.substitute_suggestions FOR ALL TO authenticated USING ((is_admin_user() OR (customer_id = current_profile_id()))) WITH CHECK ((is_admin_user() OR (customer_id = current_profile_id())));

DROP POLICY IF EXISTS supplier_plans_select ON public.supplier_subscription_plans;
CREATE POLICY supplier_plans_select ON public.supplier_subscription_plans FOR SELECT TO authenticated USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS supplier_plans_write ON public.supplier_subscription_plans;
CREATE POLICY supplier_plans_write ON public.supplier_subscription_plans FOR ALL TO authenticated USING (can_administer_tenant(tenant_id)) WITH CHECK (can_administer_tenant(tenant_id));

DROP POLICY IF EXISTS system_events_select ON public.system_events;
CREATE POLICY system_events_select ON public.system_events FOR SELECT TO authenticated USING (can_administer_tenant(tenant_id));

DROP POLICY IF EXISTS tasks_insert ON public.tasks;
CREATE POLICY tasks_insert ON public.tasks FOR INSERT TO authenticated WITH CHECK (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS tasks_select ON public.tasks;
CREATE POLICY tasks_select ON public.tasks FOR SELECT TO authenticated USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS tasks_update ON public.tasks;
CREATE POLICY tasks_update ON public.tasks FOR UPDATE TO authenticated USING ((can_access_tenant(tenant_id) AND ((current_profile_id() = created_by) OR can_administer_tenant(tenant_id)))) WITH CHECK (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS tenant_branding_admin_write ON public.tenant_branding;
CREATE POLICY tenant_branding_admin_write ON public.tenant_branding FOR ALL TO authenticated USING (can_administer_tenant(tenant_id)) WITH CHECK (can_administer_tenant(tenant_id));

DROP POLICY IF EXISTS tenant_branding_select_accessible ON public.tenant_branding;
CREATE POLICY tenant_branding_select_accessible ON public.tenant_branding FOR SELECT TO authenticated USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS tenant_memberships_admin_write ON public.tenant_memberships;
CREATE POLICY tenant_memberships_admin_write ON public.tenant_memberships FOR ALL TO authenticated USING (can_administer_tenant(tenant_id)) WITH CHECK (can_administer_tenant(tenant_id));

DROP POLICY IF EXISTS tenant_memberships_select_accessible ON public.tenant_memberships;
CREATE POLICY tenant_memberships_select_accessible ON public.tenant_memberships FOR SELECT TO authenticated USING (((user_id = current_profile_id()) OR can_administer_tenant(tenant_id)));

DROP POLICY IF EXISTS tenants_select_accessible ON public.tenants;
CREATE POLICY tenants_select_accessible ON public.tenants FOR SELECT TO authenticated USING (can_access_tenant(id));

DROP POLICY IF EXISTS urgency_pricing_select ON public.urgency_pricing;
CREATE POLICY urgency_pricing_select ON public.urgency_pricing FOR SELECT TO authenticated USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS urgency_pricing_write ON public.urgency_pricing;
CREATE POLICY urgency_pricing_write ON public.urgency_pricing FOR ALL TO authenticated USING (can_administer_tenant(tenant_id)) WITH CHECK (can_administer_tenant(tenant_id));

DROP POLICY IF EXISTS professional_profiles_read ON public.user_professional_profiles;
CREATE POLICY professional_profiles_read ON public.user_professional_profiles FOR SELECT TO authenticated USING (((user_id = current_profile_id()) OR is_admin_user() OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = user_professional_profiles.user_id) AND (u.verification_status = 'verified'::verification_status) AND (u.is_admin_verified = true))))));

DROP POLICY IF EXISTS professional_profiles_write_self ON public.user_professional_profiles;
CREATE POLICY professional_profiles_write_self ON public.user_professional_profiles FOR ALL TO authenticated USING (((user_id = current_profile_id()) OR is_admin_user())) WITH CHECK (((user_id = current_profile_id()) OR is_admin_user()));

DROP POLICY IF EXISTS users_select_self_or_verified_directory ON public.users;
CREATE POLICY users_select_self_or_verified_directory ON public.users FOR SELECT TO authenticated USING (((auth.uid() = auth_user_id) OR (id = current_profile_id()) OR is_admin_user() OR ((role = ANY (ARRAY['electrician'::user_role, 'architect'::user_role])) AND (status = 'active'::user_status) AND (verification_status = 'verified'::verification_status) AND (is_admin_verified = true))));

DROP POLICY IF EXISTS users_update_self_or_admin ON public.users;
CREATE POLICY users_update_self_or_admin ON public.users FOR UPDATE TO authenticated USING (((id = current_profile_id()) OR is_admin_user())) WITH CHECK (((id = current_profile_id()) OR is_admin_user()));

DROP POLICY IF EXISTS wallet_accounts_select ON public.wallet_accounts;
CREATE POLICY wallet_accounts_select ON public.wallet_accounts FOR SELECT TO authenticated USING ((can_access_tenant(tenant_id) AND (can_administer_tenant(tenant_id) OR (user_id = current_profile_id()))));

DROP POLICY IF EXISTS wallet_accounts_write ON public.wallet_accounts;
CREATE POLICY wallet_accounts_write ON public.wallet_accounts FOR ALL TO authenticated USING (can_administer_tenant(tenant_id)) WITH CHECK (can_administer_tenant(tenant_id));

DROP POLICY IF EXISTS wallet_balance_select ON public.wallet_balance_snapshots;
CREATE POLICY wallet_balance_select ON public.wallet_balance_snapshots FOR SELECT TO authenticated USING ((can_access_tenant(tenant_id) AND (EXISTS ( SELECT 1
   FROM wallet_accounts wa
  WHERE ((wa.id = wallet_balance_snapshots.wallet_account_id) AND (can_administer_tenant(wa.tenant_id) OR (wa.user_id = current_profile_id())))))));

DROP POLICY IF EXISTS wallet_balance_write ON public.wallet_balance_snapshots;
CREATE POLICY wallet_balance_write ON public.wallet_balance_snapshots FOR ALL TO authenticated USING (can_administer_tenant(tenant_id)) WITH CHECK (can_administer_tenant(tenant_id));

DROP POLICY IF EXISTS wallet_ledger_select ON public.wallet_ledger_entries;
CREATE POLICY wallet_ledger_select ON public.wallet_ledger_entries FOR SELECT TO authenticated USING ((can_access_tenant(tenant_id) AND (EXISTS ( SELECT 1
   FROM wallet_accounts wa
  WHERE ((wa.id = wallet_ledger_entries.wallet_account_id) AND (can_administer_tenant(wa.tenant_id) OR (wa.user_id = current_profile_id())))))));

DROP POLICY IF EXISTS wallet_ledger_write ON public.wallet_ledger_entries;
CREATE POLICY wallet_ledger_write ON public.wallet_ledger_entries FOR ALL TO authenticated USING (can_administer_tenant(tenant_id)) WITH CHECK (can_administer_tenant(tenant_id));

DROP POLICY IF EXISTS workflow_logs_select ON public.workflow_logs;
CREATE POLICY workflow_logs_select ON public.workflow_logs FOR SELECT TO authenticated USING (can_access_tenant(tenant_id));

