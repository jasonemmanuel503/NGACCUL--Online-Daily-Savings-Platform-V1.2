-- === Staff Roles & Permissions Expansion ===
-- Idempotent: safe to run more than once.

-- 1. New permission keys
INSERT INTO custom_permissions (id, permission_key, label, description, branch_id)
VALUES
  ('35effb85-faac-4510-b414-bff43466b504', 'manage_loans', 'Manage Loan Applications', 'View branch loan applications and client credit profiles (pending/active/non-paid)', NULL),
  ('7676ea05-b35a-492f-b30b-738e82113a49', 'review_loans', 'Review & Recommend Loans', 'Attach a recommendation to a loan application and notify the Branch Admin (does not approve or escalate)', NULL),
  ('c6e9ca48-8fc6-46dc-b841-5c7143fb2923', 'manage_disputes', 'Manage Disputed Transactions', 'View and respond to the disputed-transaction queue without withdrawal authority', NULL),
  ('e101a111-1001-4000-8000-000000000001', 'accounts.view_full', 'Full Account Access', 'View full account details & financial history', NULL),
  ('e101a111-1001-4000-8000-000000000002', 'ledger.reconcile', 'Reconcile Ledgers', 'Perform ledger reconciliation and audit balance adjustments', NULL),
  ('e101a111-1001-4000-8000-000000000003', 'reports.financial.generate', 'Generate Financial Reports', 'Generate financial balance and margin reports', NULL),
  ('e101a111-1001-4000-8000-000000000004', 'branch.view_all_reports', 'View All Branch Reports', 'Access all branch-wide operational and financial reports', NULL),
  ('e101a111-1001-4000-8000-000000000005', 'staff.performance.view', 'View Staff Performance', 'Inspect staff KPI performance and activity logs', NULL),
  ('e101a111-1001-4000-8000-000000000006', 'loans.override_approve', 'Override Loan Approvals', 'Override standard loan approval limits and guidelines', NULL),
  ('e101a111-1001-4000-8000-000000000007', 'audit.view_all_roles', 'Audit All Roles & Activity', 'Cross-examine role permissions and staff activity logs', NULL),
  ('e101a111-1001-4000-8000-000000000008', 'audit.flag_anomaly', 'Flag Financial Anomalies', 'Mark suspicious transactions or account anomalies for review', NULL),
  ('e101a111-1001-4000-8000-000000000009', 'transactions.view_all_branches', 'Cross-Branch Transaction Audit', 'Read-only inspection of cross-agency transaction streams', NULL),
  ('e101a111-1001-4000-8000-000000000010', 'funds.dispatch', 'Dispatch Funds', 'Execute cash release and teller fund dispatches', NULL),
  ('e101a111-1001-4000-8000-000000000011', 'transactions.record_disbursement', 'Record Disbursements', 'Log over-the-counter cash disbursements', NULL),
  ('e101a111-1001-4000-8000-000000000012', 'loans.recommend', 'Recommend Loan Approvals', 'Submit formal credit evaluation recommendations', NULL),
  ('e101a111-1001-4000-8000-000000000013', 'loans.view_portfolio', 'View Loan Portfolio', 'Inspect active and historic branch loan portfolios', NULL),
  ('e101a111-1001-4000-8000-000000000014', 'disputes.log', 'Log Client Disputes', 'Intake client complaints and transaction disputes (no resolution authority)', NULL),
  ('e101a111-1001-4000-8000-000000000015', 'staff.view_all', 'View All Staff', 'Cross-agency staff directory and roster access', NULL)
ON CONFLICT (id) DO NOTHING;

-- 2. New / updated custom roles
INSERT INTO custom_roles (id, role_name, branch_id, permission_keys)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Financial Secretary / Accountant', NULL, ARRAY['accounts.view_full','ledger.reconcile','reports.financial.generate','view_ledger']),
  ('c6987723-0a7b-465f-b512-8bcc13d2ea7d', 'Assistant General Manager', NULL, ARRAY['branch.view_all_reports','staff.performance.view','loans.override_approve','manage_members','manage_agents','view_ledger','manage_staff','view_company_margin']),
  ('95e4cde8-9976-4bc6-9159-a8ba124b0b47', 'Internal Controller', NULL, ARRAY['audit.view_all_roles','audit.flag_anomaly','transactions.view_all_branches','view_ledger','view_company_margin','accounts.view_readonly']),
  ('a1000000-0000-0000-0000-000000000002', 'Cashier', NULL, ARRAY['funds.dispatch','transactions.record_disbursement']),
  ('79f30f58-f5ae-4163-af77-81b8ecf5c932', 'Loan Officer', NULL, ARRAY['review_loans','loans.recommend','loans.view_portfolio','manage_loans']),
  ('44cc8ffc-d6a3-45fb-a8cc-c7ca8b4e33a7', 'Customer Service', NULL, ARRAY['accounts.view_readonly','disputes.log']),
  ('a1000000-0000-0000-0000-000000000003', 'CAMCCUL Officer', NULL, ARRAY['branch.view_all_reports','transactions.view_all_branches','staff.view_all'])
ON CONFLICT (id) DO UPDATE SET
  role_name = EXCLUDED.role_name,
  permission_keys = EXCLUDED.permission_keys;

-- 3. Accountant's extra permission is NOT stored in a table row anywhere — verified it is only
--    a client-side default preset (see src/views/AdminApp.tsx lines ~11600 and ~15684:
--    `if (val === "accountant") setStaffPermissions(["view_ledger"])`), written per-profile into
--    profiles.permissions (TEXT[]) at staff-creation time. No SQL needed here — see Phase 4.6.

-- 4. Loan Officer recommendation fields on loans
ALTER TABLE loans ADD COLUMN IF NOT EXISTS lo_reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS lo_reviewed_at TIMESTAMPTZ;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS lo_recommendation TEXT CHECK (lo_recommendation IN ('approve', 'reject'));
ALTER TABLE loans ADD COLUMN IF NOT EXISTS lo_recommendation_note TEXT;

-- 5. Per-staff permission override (revoke path). profiles.permissions (TEXT[]) already exists
--    as the additive/grant path (confirm before running: it's referenced throughout db.ts and
--    AdminApp.tsx as Profile.permissions). This adds the mirror-image revoke path.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS revoked_permission_keys TEXT[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en';
