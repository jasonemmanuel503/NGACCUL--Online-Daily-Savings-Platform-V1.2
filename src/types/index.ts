export type BranchID = 'ngde' | 'ngdl' | 'meig' | 'tiba' | 'tign';

export interface Branch {
  id: BranchID;
  name: string;
  location: string;
  phone: string;
}

export type UserRole = 'client' | 'agent' | 'branch_admin' | 'pdg' | 'staff';

export interface CustomPermission {
  id: string;
  permission_key: string;
  label: string;
  description?: string;
  branch_id?: string | null;
  created_by?: string;
  created_at?: string;
}

export interface CustomRole {
  id: string;
  role_name: string;
  branch_id?: string | null;
  permission_keys: string[];
  created_by?: string;
  created_at?: string;
}

export interface Profile {
  id: string; // UUID matches Supabase Auth UID
  branch_id: BranchID;
  role: UserRole;
  full_name: string;
  phone: string;
  national_id?: string;
  national_id_document_type?: 'card' | 'receipt';
  national_id_issued_date?: string;
  birthday?: string; // YYYY-MM-DD or DDMMYYYY depending on input
  subdivision: string; // Ngaoundéré, Ngaoundal, Meiganga, Tibati, Tignéré
  locality: string; // Specific neighborhood or sub-locality where client was acquired
  payment_method?: 'mtn' | 'orange';
  payment_phone?: string;
  is_active: boolean;
  account_status?: 'active' | 'inactive' | 'frozen' | 'paused';
  force_password_change: boolean;
  recruited_by?: string; // agent profile ID
  joined_at: string; // ISO String
  last_seen_at?: string; // ISO String
  unique_display_id: string; // e.g. NGC-CLIENT-00042, NGC-AGENT-00007
  account_number?: string; // 4-digit, unique, clients only
  agent_code?: string; // 4-digit, unique, agents only
  pin_hash?: string; // Encrypted or hashed offline pin
  setup_code?: string | null; // One-time code required to set the initial PIN; null once used
  commission_recruitment_fee?: number; // Override rate
  commission_deposit_pct?: number; // Override rate e.g. 0.02
  commission_withdrawal_commission_pct?: number; // Override rate e.g. 0.35
  contract_type?: 'partial' | 'full_time';
  guarantor_name?: string;
  guarantor_gender?: string;
  guarantor_residence_city?: string;
  guarantor_locality?: string;
  guarantor_id_number?: string;
  guarantor_id_document_type?: 'card' | 'receipt';
  guarantor_id_issued_date?: string;
  guarantor_id_expiry?: string;
  education_level?: string;
  dob?: string;
  email?: string;
  national_id_expiry?: string;
  education_cert_ref?: string;
  staff_title?: 'principal' | 'secretary' | 'finance' | 'accountant' | 'cashier' | 'custom';
  custom_role_id?: string | null;
  permissions?: string[];
  preferred_language?: 'en' | 'fr' | 'ff';
  photo_url?: string;
  has_app_access?: boolean;
  presence_status?: 'online' | 'unstable' | 'offline';
  last_heartbeat_at?: string | null;
  revoked_permission_keys?: string[];
}

export type TransactionType = 'deposit' | 'withdrawal';
export type TransactionStatus = 'pending' | 'confirmed' | 'disputed' | 'resolved' | 'rejected' | 'escalated';

export interface Transaction {
  id: string; // UUID
  branch_id: BranchID;
  client_id: string;
  agent_id?: string; // if collected by agent
  type: TransactionType;
  amount: number;
  payment_method?: string; // cash, mtn, orange
  payment_ref?: string;
  note?: string;
  status: TransactionStatus;
  withdrawal_fee?: number;
  net_payout?: number;
  approved_by?: string; // Profile ID
  rejection_reason?: string;
  created_at: string;
  confirmed_at?: string;
  dispute_window_expires_at?: string;
  created_by: string; // Operator who recorded it
  disputed_at?: string;
  dispute_note?: string;
  client_had_app_access?: boolean;
  purpose?: 'savings' | 'loan_repayment' | string;
  cash_remittance_confirmed?: boolean;      // true once a branch admin/cashier explicitly confirms physical cash was received
  cash_remittance_confirmed_by?: string;    // profiles.id of the branch admin/staff who confirmed
  cash_remittance_confirmed_at?: string;    // ISO timestamp
  is_archived?: boolean;
  archived_at?: string;
  archived_by?: string; // Profile id of the branch_admin/pdg who archived it
  archive_batch_id?: string; // groups all txns archived together in one click, for audit lookup
}

export interface ClientBalance {
  client_id: string;
  branch_id: BranchID;
  balance: number;
  total_deposits: number;
  total_withdrawals: number;
  locked_amount?: number;
  updated_at: string;
}

export type LoanStatus = 'pending' | 'escalated' | 'approved' | 'active' | 'rejected' | 'closed';

export interface Loan {
  id: string;
  branch_id: BranchID;
  client_id: string;
  requested_by: string;
  approved_by?: string;
  amount: number;
  purpose: string;
  term_months: number;
  interest_rate_pct: number;
  status: LoanStatus;
  disbursed_at?: string;
  created_at: string;
  pay_back_by?: string; // Target repayment date (e.g. YYYY-MM-DD)
  escalated_by?: string; // Profile ID of Admin who escalated
  escalated_at?: string;
  pdg_approved_by?: string; // Profile ID of PDG who gave final signoff
  pdg_approved_at?: string;
  lo_reviewed_by?: string;
  lo_reviewed_at?: string;
  lo_recommendation?: 'approve' | 'reject';
  lo_recommendation_note?: string;
}

export type RepaymentStatus = 'pending' | 'confirmed' | 'disputed' | 'resolved' | 'missed';

export interface LoanRepayment {
  id: string;
  loan_id: string;
  branch_id: BranchID;
  due_date: string; // YYYY-MM-DD
  amount_due: number;
  amount_paid: number;
  paid_at?: string;
  payment_ref?: string;
  logged_by?: string; // profiles.id who logged it
  status: RepaymentStatus;
}

export interface CommissionRate {
  id: string;
  branch_id: BranchID;
  agent_id: string | null; // null = branch default
  recruitment_fee_fcfa: number;
  deposit_pct: number;
  withdrawal_commission_pct: number;
  effective_from: string;
  set_by: string;
}

export interface PolicyLimit {
  id: string;
  branch_id: BranchID | 'all';
  scope: 'agent_commission_min_withdrawal' | 'client_savings_min_withdrawal' 
       | 'loan_min_amount' | 'loan_max_amount' | 'loan_min_tenure_days' 
       | 'loan_min_savings_fcfa' | 'loan_collateral_coverage_pct'
       | 'deposit_dispute_window_hours';
  value: number;
  effective_from: string;
  set_by: string;
}

export interface CommissionLedgerEntry {
  id: string;
  branch_id: BranchID;
  agent_id: string;
  type: 'recruitment' | 'deposit_pct' | 'withdrawal_pct' | 'badge_bonus';
  reference_id: string; // transaction_id or profiles.id that triggered it
  amount_fcfa: number;
  accrued_at: string;
  rate_snapshot: {
    recruitment_fee: number;
    deposit_pct: number;
    withdrawal_commission_pct?: number;
  };
}

export interface Marathon {
  id: string;
  name?: string;
  start_date: string;
  planned_end_date: string;
  status: 'pending_approval' | 'active' | 'paused' | 'closed';
  pause_history: {
    paused_at: string;
    paused_by: string;
    resumed_at?: string;
    resumed_by?: string;
  }[];
  proposed_by?: string;
  approved_by?: string;
  created_at: string;
}

export interface BadgeDefinition {
  id: string;
  marathon_id: string;
  branch_id: BranchID | 'all';
  tier: 'hero' | 'elite';
  min_new_clients_per_month: number;
  bonus_amount_fcfa: number;
  is_active: boolean;
  set_by: string;
  effective_from: string;
}

export interface AgentBadgeAward {
  id: string;
  marathon_id: string;
  agent_id: string;
  badge_definition_id: string;
  tier: 'hero' | 'elite';
  period_month: string;
  new_clients_count: number;
  bonus_amount_fcfa: number;
  awarded_at: string;
  ledger_entry_id: string;
}

export interface CommissionPayout {
  id: string;
  branch_id: BranchID;
  agent_id: string;
  amount_fcfa: number;
  payment_method: string;
  period_start: string; // YYYY-MM-DD
  period_end: string;   // YYYY-MM-DD
  disbursed_at: string;
  disbursed_by: string;
  note?: string;
}

export interface Notification {
  id: string;
  branch_id: BranchID;
  recipient_id: string;
  type: string; // e.g. deposit_pending, deposit_confirmed, loan_event, rate_change, etc.
  title: string;
  body: string;
  reference_id?: string;
  is_read: boolean;
  created_at: string;
  is_archived?: boolean;
  archived_at?: string | null;
}

export interface AuditLog {
  id: string;
  branch_id: BranchID | null; // null for PDG
  actor_id: string;
  actor_role: string;
  action: string; // e.g. deposit.confirm
  target_type: string;
  target_id: string;
  old_value?: any;
  new_value?: any;
  metadata?: any;
  created_at: string;
}

export interface CrossBranchGrant {
  id: string;
  granted_by: string;
  granted_to: string;
  target_branch_id: BranchID;
  scope: {
    members?: boolean;
    ledger?: boolean;
  };
  reason: string;
  expires_at: string;
  created_at: string;
  revoked_at?: string;
}

export interface OfflineQueueItem {
  id: string; // UUID generated offline
  branch_id: BranchID;
  actor_id: string;
  action_type: 'deposit' | 'register_client' | 'loan_repayment' | 'commission_ledger';
  payload: any;
  created_offline_at: string;
  synced_at?: string;
  status: 'queued' | 'synced' | 'failed';
  error_message?: string;
}

export type PayoutRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface PayoutRequest {
  id: string;
  branch_id: BranchID;
  agent_id: string;
  amount_fcfa: number;
  request_type: 'total' | 'custom';
  status: PayoutRequestStatus;
  requested_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  rejection_reason?: string;
  payment_method: string;
  payment_phone?: string;
  destination?: 'cash' | 'savings';
}

export interface LoanGuarantor {
  id: string;
  loan_id: string;
  branch_id: string;
  full_name: string;
  phone: string;
  relationship: string;
  locality: string;
  national_id_number: string;
  national_id_document_type?: 'card' | 'receipt';
  national_id_issued_date?: string;
  national_id_expiry: string;
  client_signature: string;
  created_at: string;
}

export interface LoanAgreement {
  id: string;
  loan_id: string;
  client_id: string;
  loan_terms_id: string;
  agreed_at: string;
  client_location_text: string;
}

export type DepositCorrectionRequestStatus = 'pending' | 'approved' | 'rejected';

export interface DepositCorrectionRequest {
  id: string;
  branch_id: BranchID;
  transaction_id: string;      // the deposit being flagged
  requested_by: string;        // agent profile id
  reason: string;               // agent's free-text explanation
  requested_amount?: number;    // agent's suggested correct amount, optional
  status: DepositCorrectionRequestStatus;
  requested_at: string;
  reviewed_by?: string;         // branch_admin profile id
  reviewed_at?: string;
  rejection_reason?: string;
}

export interface AgentLeave {
  id: string;
  branch_id: BranchID;
  agent_id: string;            // agent going on leave
  covering_agent_id: string;   // agent temporarily taking over
  start_date: string;          // YYYY-MM-DD
  expected_return_date: string; // YYYY-MM-DD
  set_by: string;              // branch_admin or pdg profile id
  created_at: string;
  ended_at?: string;           // set when manually closed early or auto-closed on return
  end_date?: string;           // alias for expected_return_date
  created_by?: string;         // alias for set_by
}

export interface BusinessHours {
  id: string;
  branch_id: BranchID | 'all';
  start_time: string; // "08:00"
  end_time: string; // "16:00"
  days_active: string; // comma-separated days, e.g. "Monday,Tuesday,Wednesday,Thursday,Friday,Saturday"
  timezone: string; // "Africa/Douala"
  is_enabled: boolean;
  set_by: string;
  updated_at: string;
}

export interface BusinessHoursAppeal {
  id: string;
  branch_id: BranchID;
  client_id: string;
  client_name: string;
  transaction_type: 'deposit' | 'withdrawal' | 'registration';
  amount_fcfa?: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'used';
  submitted_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  review_notes?: string;
}

export interface BusinessHoursSetting {
  id: string;
  scope: 'global' | BranchID;
  workdays: string; // Comma-separated days, e.g. "Monday,Tuesday,Wednesday,Thursday,Friday,Saturday"
  start_time: string; // e.g. "08:00"
  end_time: string; // e.g. "16:00"
  enabled: boolean;
  set_by: string; // user id
  created_at: string;
  updated_at: string;
}

export interface BusinessHoursBranchAppeal {
  id: string;
  branch_id: BranchID;
  requested_by: string; // user id
  proposed_workdays: string; // comma-separated days
  proposed_start_time: string; // e.g. "08:00"
  proposed_end_time: string; // e.g. "16:00"
  justification: string;
  status: 'pending' | 'approved' | 'declined';
  reviewed_by: string | null;
  decision_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export type MarginSubmissionStatus = 'submitted' | 'acknowledged';

export interface MarginSubmission {
  id: string;
  branch_id: BranchID;
  submitted_by: string;          // profiles.id of the branch admin who sent it
  period_start: string;          // ISO date, start of the range covered
  period_end: string;            // ISO date, end of the range covered
  total_margin_fcfa: number;     // the total 3% fee figure for that range, as computed at submission time
  itemized_breakdown: {
    transaction_id: string;
    client_id: string;
    agent_id?: string;
    amount: number;
    fee: number;
    date: string;
  }[];                            // full snapshot of every withdrawal row behind the total, captured at submission time
  status: MarginSubmissionStatus;
  submitted_at: string;
  acknowledged_by?: string;       // pdg profile id, if/when acknowledged
  acknowledged_at?: string;
}

export interface IdValidationSettings {
  enabled: boolean;                 // master toggle — see semantics below
  card_digit_length: number;        // default 17
  card_duration_years: number;      // default 10
  receipt_char_length_min: number;  // default 19
  receipt_char_length_max: number;  // default 20
  receipt_duration_months: number;  // default 3
  updated_by: string;
  updated_at: string;
}

export interface SelfDepositLockSettings {
  client_locked: boolean;   // true = clients cannot self-deposit
  agent_locked: boolean;    // true = agents cannot deposit into their own account
  updated_by: string;
  updated_at: string;
}

export interface SubdivisionAccessSetting {
  branch_id: string; // 'ngdl' | 'meig' | 'tiba' | 'tign'
  locked: boolean;
  pin_hash?: string;
  unlocked_by?: string;
  unlocked_at?: string;
  updated_at?: string;
}





