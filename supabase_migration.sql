-- NGACCUL Savings & Credit Platform - Database Migration (Supabase Postgres)
-- v3.0 Schema & Row Level Security (RLS) Configuration

-- 1. EXTENSIONS (For UUID generation)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. CORE STATIC TABLES
-- Branches (static seed data, read-only via application interface)
CREATE TABLE branches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  phone TEXT NOT NULL
);

-- 3. PROFILES TABLE (Extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY, -- References auth.users(id)
  branch_id TEXT REFERENCES branches(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('client', 'agent', 'branch_admin', 'pdg', 'staff')),
  full_name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  agent_code TEXT UNIQUE,
  account_number TEXT UNIQUE,
  national_id TEXT,
  birthday DATE,
  subdivision TEXT NOT NULL CHECK (subdivision IN ('Ngaoundéré', 'Ngaoundal', 'Meiganga', 'Tibati', 'Tignéré')),
  locality TEXT NOT NULL DEFAULT 'Center',
  payment_method TEXT CHECK (payment_method IN ('mtn', 'orange')),
  payment_phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  force_password_change BOOLEAN NOT NULL DEFAULT true,
  recruited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ,
  unique_display_id TEXT UNIQUE NOT NULL,
  pin_hash TEXT, -- Encrypted local PIN for second-factor biometric fallback
  commission_recruitment_fee NUMERIC(14,2),
  commission_deposit_pct NUMERIC(5,4)
);

-- 4. FINANCIAL LEDGER TABLES
-- Transactions (Deposits, Withdrawals)
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  agent_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  withdrawal_fee NUMERIC(14,2),
  net_payout NUMERIC(14,2),
  payment_method TEXT NOT NULL, -- 'cash', 'mtn_momo', 'orange_money'
  payment_ref TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'disputed', 'resolved', 'rejected')),
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  dispute_window_expires_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  disputed_at TIMESTAMPTZ,
  dispute_note TEXT
);

-- Client Balances (Derived but cached for query speed and ledger sanity)
CREATE TABLE client_balances (
  client_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total_deposits NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total_withdrawals NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. LOANS MODULE
CREATE TABLE loans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  requested_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  purpose TEXT NOT NULL,
  term_months INTEGER NOT NULL CHECK (term_months > 0),
  interest_rate_pct NUMERIC(5,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'escalated', 'approved', 'active', 'rejected', 'closed')),
  disbursed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Repayments schedule
CREATE TABLE loan_repayments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  due_date DATE NOT NULL,
  amount_due NUMERIC(14,2) NOT NULL CHECK (amount_due > 0),
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  paid_at TIMESTAMPTZ,
  payment_ref TEXT,
  logged_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'disputed', 'resolved', 'missed'))
);

-- 6. AGENT COMMISSION ENGINE
-- Configurations
CREATE TABLE commission_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  agent_id UUID REFERENCES profiles(id) ON DELETE CASCADE, -- NULL means default rate for branch
  recruitment_fee_fcfa NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (recruitment_fee_fcfa >= 0),
  deposit_pct NUMERIC(5,4) NOT NULL DEFAULT 0.0000 CHECK (deposit_pct >= 0 AND deposit_pct <= 1),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  set_by UUID NOT NULL REFERENCES profiles(id)
);

-- Append-only Commission Ledger Accruals
CREATE TABLE commission_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  agent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('recruitment', 'deposit_pct', 'withdrawal_pct', 'badge_bonus')),
  reference_id UUID NOT NULL, -- profile_id (who joined) or transaction_id (the deposit)
  amount_fcfa NUMERIC(14,2) NOT NULL CHECK (amount_fcfa >= 0),
  accrued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rate_snapshot JSONB NOT NULL -- Snapshot of {recruitment_fee, deposit_pct} at event instance
);

-- Paid payouts logged by Branch Admin
CREATE TABLE commission_payouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  agent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  amount_fcfa NUMERIC(14,2) NOT NULL CHECK (amount_fcfa > 0),
  payment_method TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  disbursed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  disbursed_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  note TEXT
);

-- payout_requests table for agent payout management
CREATE TABLE IF NOT EXISTS payout_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  agent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  amount_fcfa NUMERIC(14,2) NOT NULL CHECK (amount_fcfa > 0),
  request_type TEXT NOT NULL CHECK (request_type IN ('total', 'custom')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  payment_method TEXT NOT NULL,
  payment_phone TEXT
);

-- 7. NOTIFICATIONS & INVOICES (Append-Only client feed)
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'deposit_pending', 'deposit_confirmed', 'withdrawal_status' etc.
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  reference_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. AUDIT SYSTEMS & ACCESS MANAGEMENT
-- Audit logs (Append-only, no updates or deletes)
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id TEXT REFERENCES branches(id) ON DELETE RESTRICT, -- Nullable for PDG scope
  actor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL, -- e.g. 'deposit.confirm'
  target_type TEXT NOT NULL, -- 'transaction', 'profile' etc
  target_id UUID NOT NULL,
  old_value JSONB,
  new_value JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PDG Cross-branch grant permissions
CREATE TABLE cross_branch_grants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  granted_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  granted_to UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  target_branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  scope JSONB NOT NULL, -- e.g. {"members": true, "ledger": true}
  reason TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

-- Offline Synchronizations queues
CREATE TABLE sync_queue (
  id UUID PRIMARY KEY,
  branch_id TEXT NOT NULL,
  actor_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_offline_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'synced', 'failed'))
);


-- 9. ROW-LEVEL SECURITY (RLS) POLICIES (DISABLED FOR CUSTOM AUTH COMPATIBILITY / LAUNCH DEADLINE)
-- Known Security Debt: This application manages its own robust application-layer security in `db.ts`
-- using phone + PIN authentication with direct client queries. Standard Supabase RLS policies utilizing
-- auth.uid() or custom claims evaluate to false due to custom auth. Row-level security is explicitly
-- disabled for now to ensure proper operational synchronizations pending a native Supabase Auth migration.

ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE client_balances DISABLE ROW LEVEL SECURITY;
ALTER TABLE loans DISABLE ROW LEVEL SECURITY;
ALTER TABLE loan_repayments DISABLE ROW LEVEL SECURITY;
ALTER TABLE commission_rates DISABLE ROW LEVEL SECURITY;
ALTER TABLE commission_ledger DISABLE ROW LEVEL SECURITY;
ALTER TABLE commission_payouts DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE cross_branch_grants DISABLE ROW LEVEL SECURITY;

-- Dynamic helpers to get authenticated token claims
-- Claim 'role' and 'branch_id' embedded in auth JWT token
CREATE OR REPLACE FUNCTION get_auth_branch() RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'branch_id', '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION get_auth_role() RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
$$ LANGUAGE sql STABLE;

-- RLS: Profiles policy
CREATE POLICY branch_scope_profiles ON profiles
  FOR ALL TO authenticated
  USING (
    get_auth_role() = 'pdg' OR 
    (branch_id = get_auth_branch())
  );

-- RLS: Transactions policy
CREATE POLICY branch_scope_transactions ON transactions
  FOR ALL TO authenticated
  USING (
    get_auth_role() = 'pdg' OR 
    (branch_id = get_auth_branch())
  );

-- RLS: Client Balances
CREATE POLICY branch_scope_balances ON client_balances
  FOR ALL TO authenticated
  USING (
    get_auth_role() = 'pdg' OR 
    (branch_id = get_auth_branch())
  );

-- RLS: Loans & Repayments
CREATE POLICY branch_scope_loans ON loans
  FOR ALL TO authenticated
  USING (get_auth_role() = 'pdg' OR branch_id = get_auth_branch());

CREATE POLICY branch_scope_repayments ON loan_repayments
  FOR ALL TO authenticated
  USING (get_auth_role() = 'pdg' OR branch_id = get_auth_branch());

-- RLS: Commission Ledger (Agents only see their records, Admins see all)
CREATE POLICY agent_scope_commissions ON commission_ledger
  FOR ALL TO authenticated
  USING (
    get_auth_role() = 'pdg' OR 
    (get_auth_role() = 'branch_admin' AND branch_id = get_auth_branch()) OR
    (get_auth_role() = 'agent' AND agent_id = auth.uid())
  );

CREATE POLICY agent_scope_payouts ON commission_payouts
  FOR ALL TO authenticated
  USING (
    get_auth_role() = 'pdg' OR
    (get_auth_role() = 'branch_admin' AND branch_id = get_auth_branch()) OR
    (get_auth_role() = 'agent' AND agent_id = auth.uid())
  );

-- RLS: Audit Trails (Branch Admin scoped, PDG sees all, others blocked)
CREATE POLICY audit_view_policy ON audit_log
  FOR SELECT TO authenticated
  USING (
    get_auth_role() = 'pdg' OR
    (get_auth_role() = 'branch_admin' AND branch_id = get_auth_branch())
  );

-- Block insert/delete on Audit Logs except system trigger
CREATE POLICY audit_block_mutate ON audit_log FOR UPDATE USING (false);
CREATE POLICY audit_block_delete ON audit_log FOR DELETE USING (false);


-- 10. PRE-SEEDING DATA
-- Insertion into static tables
INSERT INTO branches (id, name, location, phone) VALUES
  ('ngde', 'Ngaoundéré', 'Carrefour 140, à côté de la Pharmacie de l''Espérance', '+237 222 25 23 88'),
  ('ngdl', 'Ngaoundal', 'Face Place de Fête', '+237 677 30 33 52'),
  ('meig', 'Meiganga', 'Face Lamidat', '+237 678 69 85 22'),
  ('tiba', 'Tibati', 'Entrée Lamidat', '+237 655 01 12 90'),
  ('tign', 'Tignéré', 'Face Marché de Dimanche', '+237 675 97 47 53');

-- 11. CLIENT SELF-SERVICE DIRECT DEPOSITS SCHEMA
CREATE TABLE client_savings_deposits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('mtn_momo', 'orange_money', 'express_union')),
  payment_phone TEXT NOT NULL,
  payment_ref TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status = 'confirmed'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS for client_savings_deposits (DISABLED FOR CUSTOM AUTH COMPATIBILITY)
ALTER TABLE client_savings_deposits DISABLE ROW LEVEL SECURITY;

-- 12. DATABASE MIGRATION ENGINE / SCHEMA UPGRADE UTILITIES (CRITICAL-03 Fixes)
-- Ensure missing columns are applied if migrating an existing schema.

-- Add to transactions table:
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS disputed_at TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS dispute_note TEXT;

-- Add to profiles table:
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS commission_recruitment_fee NUMERIC(14,2);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS commission_deposit_pct NUMERIC(5,4);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contract_type TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS guarantor_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS guarantor_gender TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS guarantor_residence_city TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS guarantor_locality TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS guarantor_id_number TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS guarantor_id_expiry TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS education_level TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dob TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS national_id_expiry TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS education_cert_ref TEXT;

-- Fix loans status constraint (drop and recreate):
ALTER TABLE loans DROP CONSTRAINT IF EXISTS loans_status_check;
ALTER TABLE loans ADD CONSTRAINT loans_status_check 
  CHECK (status IN ('pending', 'escalated', 'approved', 'active', 'rejected', 'closed'));

-- Ensure payout_requests has security disabled explicitly
ALTER TABLE payout_requests DISABLE ROW LEVEL SECURITY;

-- 13. PDG MASTER ACCESS PIN SCHEMA (DEPRECATED / UNUSED as of v7.5 - to be dropped in a later migration once confirmed safe)
CREATE TABLE IF NOT EXISTS pdg_master_pin (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pin_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE pdg_master_pin DISABLE ROW LEVEL SECURITY;

-- 14. LOAN MULTI-PHASE SURVEY & DISBURSEMENT TABLES
CREATE TABLE IF NOT EXISTS loan_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  interest_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  min_savings_fcfa NUMERIC(14,2) NOT NULL DEFAULT 50000.00,
  loan_approval_threshold_fcfa NUMERIC(14,2) NOT NULL DEFAULT 1000000.00,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);
ALTER TABLE loan_config DISABLE ROW LEVEL SECURITY;

-- Seed default values
INSERT INTO loan_config (interest_rate_pct, min_savings_fcfa, loan_approval_threshold_fcfa)
VALUES (5.00, 50000.00, 1000000.00)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS loan_guarantors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  relationship TEXT NOT NULL,
  locality TEXT NOT NULL,
  national_id_number TEXT NOT NULL,
  national_id_expiry TEXT NOT NULL,
  client_signature TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE loan_guarantors DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS loan_terms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_html TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT true
);
ALTER TABLE loan_terms DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS loan_agreements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  loan_terms_id UUID NOT NULL REFERENCES loan_terms(id),
  agreed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  client_ip TEXT,
  client_location_text TEXT
);
ALTER TABLE loan_agreements DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS loan_disbursement_confirmations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE loan_disbursement_confirmations DISABLE ROW LEVEL SECURITY;

-- 15. CUSTOM ROLES & PERMISSIONS SCHEMA (RBAC REDESIGN)
CREATE TABLE IF NOT EXISTS custom_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  permission_key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  branch_id UUID,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE custom_permissions DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS custom_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_name TEXT NOT NULL,
  branch_id UUID,
  permission_keys TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE custom_roles DISABLE ROW LEVEL SECURITY;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS custom_role_id UUID REFERENCES custom_roles(id) ON DELETE SET NULL;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_app_access BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS setup_code TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS client_had_app_access BOOLEAN;

CREATE TABLE IF NOT EXISTS deposit_correction_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  requested_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  requested_amount NUMERIC(14,2),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES profiles(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT
);
ALTER TABLE deposit_correction_requests DISABLE ROW LEVEL SECURITY;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('client', 'agent', 'branch_admin', 'pdg', 'staff'));

-- 16. STAFF CUSTOM-ROLE COLUMNS (missing from earlier migration rounds)
-- These are written by addBranchStaff() in db.ts but the columns were never created,
-- so every staff/custom-role profile upsert to Supabase was silently failing.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS staff_title TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS permissions TEXT[];

-- 17. POLICY LIMITS (branch-configurable minimums/maximums)
CREATE TABLE IF NOT EXISTS policy_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id TEXT NOT NULL, -- 'all' or a specific branch id (no FK: 'all' is not a row in branches)
  scope TEXT NOT NULL CHECK (scope IN (
    'agent_commission_min_withdrawal',
    'client_savings_min_withdrawal',
    'loan_min_amount',
    'loan_max_amount',
    'loan_min_tenure_days',
    'loan_min_savings_fcfa'
  )),
  value NUMERIC(14,2) NOT NULL,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  set_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  UNIQUE (branch_id, scope)
);
ALTER TABLE policy_limits DISABLE ROW LEVEL SECURITY;

-- 18. MARATHON CAMPAIGNS (agent recruitment growth pushes)
CREATE TABLE IF NOT EXISTS marathons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT,
  start_date DATE NOT NULL,
  planned_end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'active', 'paused', 'closed')),
  pause_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  proposed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE marathons DISABLE ROW LEVEL SECURITY;

-- 19. BADGE DEFINITIONS (per-marathon, per-branch agent bonus tiers)
CREATE TABLE IF NOT EXISTS badge_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  marathon_id UUID NOT NULL REFERENCES marathons(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL, -- 'all' or a specific branch id (no FK, same reason as policy_limits)
  tier TEXT NOT NULL CHECK (tier IN ('hero', 'elite')),
  min_new_clients_per_month INTEGER NOT NULL CHECK (min_new_clients_per_month > 0),
  bonus_amount_fcfa NUMERIC(14,2) NOT NULL CHECK (bonus_amount_fcfa >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  set_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE badge_definitions DISABLE ROW LEVEL SECURITY;

-- 20. AGENT BADGE AWARDS (earned badges + bonus payout linkage)
CREATE TABLE IF NOT EXISTS agent_badge_awards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  marathon_id UUID NOT NULL REFERENCES marathons(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_definition_id UUID NOT NULL REFERENCES badge_definitions(id) ON DELETE RESTRICT,
  tier TEXT NOT NULL CHECK (tier IN ('hero', 'elite')),
  period_month TEXT NOT NULL, -- 'YYYY-MM'
  new_clients_count INTEGER NOT NULL,
  bonus_amount_fcfa NUMERIC(14,2) NOT NULL,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ledger_entry_id UUID,
  UNIQUE (agent_id, marathon_id, period_month)
);
ALTER TABLE agent_badge_awards DISABLE ROW LEVEL SECURITY;

-- 21. ENABLE REALTIME ON NOTIFICATIONS
-- Creating a table does NOT automatically stream its changes over Supabase Realtime —
-- it must be explicitly added to the 'supabase_realtime' publication, or the app's
-- postgres_changes subscription (see subscribeToNotifications in supabase.ts) will
-- connect successfully but silently never receive any INSERT events.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;

-- 23. ENABLE REALTIME ON TRANSACTIONS
-- Required for the admin dashboard's "new agent cash deposit" live pulse indicator
-- (see subscribeToNewCashDeposits in supabase.ts). Without this, the channel
-- connects successfully but silently never receives INSERT events, exactly
-- like the notifications table before it was added below.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
  END IF;
END $$;

-- 22. BETA INCREMENTAL SCHEMA CHANGES (merged from BETA supabase_migration.sql)
-- The block below was originally a separate, standalone incremental migration file
-- shipped with the BETA app version. It assumes the base schema above already exists
-- and only adds new columns/tables on top of it. Merged here so the whole schema can
-- be provisioned from a single file, in the correct order, against a fresh database.

-- Migration: Add is_archived and archived_at to notifications table
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;

-- Create an index to optimize unread/non-archived notifications queries
CREATE INDEX IF NOT EXISTS idx_notifications_unread_non_archived 
ON notifications (recipient_id, is_read, is_archived) 
WHERE is_read = FALSE AND is_archived = FALSE;

-- Migration: Add business_hours and business_hours_appeals tables
CREATE TABLE IF NOT EXISTS business_hours (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    days_active TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Africa/Douala',
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    set_by TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_hours_appeals (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    client_name TEXT NOT NULL,
    transaction_type TEXT NOT NULL,
    amount_fcfa NUMERIC,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by TEXT,
    review_notes TEXT
);

-- Migration: Add presence tracking to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS presence_status TEXT NOT NULL DEFAULT 'offline';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ DEFAULT NULL;

-- Migration: Add ID Document types and issued dates to profiles and loan_guarantors
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS national_id_document_type TEXT DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS national_id_issued_date TEXT DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS guarantor_id_document_type TEXT DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS guarantor_id_issued_date TEXT DEFAULT NULL;

ALTER TABLE loan_guarantors ADD COLUMN IF NOT EXISTS national_id_document_type TEXT DEFAULT NULL;
ALTER TABLE loan_guarantors ADD COLUMN IF NOT EXISTS national_id_issued_date TEXT DEFAULT NULL;

-- Migration: Cash remittance confirmation checkpoint for agent cash deposits
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cash_remittance_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cash_remittance_confirmed_by TEXT DEFAULT NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cash_remittance_confirmed_at TIMESTAMPTZ DEFAULT NULL;

-- Migration: Branch margin reconciliation submissions
CREATE TABLE IF NOT EXISTS margin_submissions (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL,
    submitted_by TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    total_margin_fcfa NUMERIC NOT NULL,
    itemized_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'submitted',
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    acknowledged_by TEXT,
    acknowledged_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_margin_submissions_branch ON margin_submissions (branch_id);

-- Migration: Ensure profiles has photo_url column for all roles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS photo_url TEXT DEFAULT NULL;

-- Demo credentials listed in developer environment documentation:
-- PDG: pdg@ngaccul.com
-- Admin Ngaoundere: admin.ngde@ngaccul.com
-- Field Collector agent.ngde@ngaccul.com
-- Client client.ngde@ngaccul.com

-- Migration: Add business_hours_settings and business_hours_appeals_branch tables
-- (distinct from business_hours / business_hours_appeals above — these back the
-- branch-level settings + branch appeal workflow in db.ts)
CREATE TABLE IF NOT EXISTS business_hours_settings (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL UNIQUE, -- 'global' or a BranchID
    workdays TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    set_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE business_hours_settings DROP CONSTRAINT IF EXISTS business_hours_settings_scope_unique;
ALTER TABLE business_hours_settings ADD CONSTRAINT business_hours_settings_scope_unique UNIQUE (scope);

CREATE TABLE IF NOT EXISTS business_hours_appeals_branch (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    proposed_workdays TEXT NOT NULL,
    proposed_start_time TEXT NOT NULL,
    proposed_end_time TEXT NOT NULL,
    justification TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_by TEXT,
    decision_note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_business_hours_appeals_branch_branch ON business_hours_appeals_branch (branch_id);

-- Ensure agent_code, account_number, and preferred_language columns exist on profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS agent_code TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_number TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en';

-- Self-Deposit Padlock Toggle Settings table
CREATE TABLE IF NOT EXISTS self_deposit_lock_settings (
    id TEXT PRIMARY KEY DEFAULT 'global',
    client_locked BOOLEAN NOT NULL DEFAULT FALSE,
    agent_locked BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE self_deposit_lock_settings DISABLE ROW LEVEL SECURITY;

-- Subdivision Access Padlock Settings table
CREATE TABLE IF NOT EXISTS subdivision_access_settings (
    branch_id TEXT PRIMARY KEY,       -- 'ngdl' | 'meig' | 'tiba' | 'tign'
    locked BOOLEAN NOT NULL DEFAULT TRUE,
    pin_hash TEXT NOT NULL,           -- SHA-256
    unlocked_by TEXT,
    unlocked_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subdivision_access_settings DISABLE ROW LEVEL SECURITY;

INSERT INTO subdivision_access_settings (branch_id, locked, pin_hash)
VALUES
  ('ngdl', true, 'a6ea08cf9c707b6bb1792f4a634306c714bb9dc5f9297756b80f80a7ddc2a7ed'),
  ('meig', true, '00e6b849361111a6581e9b574d2bcdc30a799fedc14ae1beed20c9a4ce7dc3b3'),
  ('tiba', true, '416126984ede4282c6da8a786baa984e6b609f49dad74dfbe3f5ae7a0b4a3c55'),
  ('tign', true, 'a59be0418c6dc2a4b58e03e3bf77a5cab6262c9d9ad4dbe04e65050a52f33b1f')
ON CONFLICT (branch_id) DO NOTHING;

-- ==========================================================
-- STORAGE: profile-photos bucket (public, used by
-- uploadToSupabaseStorage() in src/services/supabase.ts)
-- ==========================================================
insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do nothing;

create policy "Public read profile-photos"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'profile-photos');

create policy "Anon insert profile-photos"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'profile-photos');

create policy "Anon update profile-photos"
on storage.objects for update
to anon, authenticated
using (bucket_id = 'profile-photos');

-- Migration: add archive/reconciliation-batch tracking columns to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS archive_batch_id TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_archive_batch_id ON transactions (archive_batch_id) WHERE archive_batch_id IS NOT NULL;

-- Migration: update commission_ledger type check constraint
ALTER TABLE commission_ledger DROP CONSTRAINT IF EXISTS commission_ledger_type_check;
ALTER TABLE commission_ledger ADD CONSTRAINT commission_ledger_type_check
  CHECK (type IN ('recruitment', 'deposit_pct', 'withdrawal_pct', 'badge_bonus'));

-- Migration: add unique index to prevent duplicate daily PDG activity digests per branch per recipient per day
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pdg_digest_per_branch_per_day
ON notifications (branch_id, recipient_id, (created_at::date))
WHERE type = 'pdg_branch_activity_digest';

-- Migration: add correction tracking columns to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS original_amount NUMERIC DEFAULT NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS corrected_amount NUMERIC DEFAULT NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS corrected_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

