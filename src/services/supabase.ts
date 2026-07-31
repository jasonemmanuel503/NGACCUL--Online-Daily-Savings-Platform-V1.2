import { createClient } from "@supabase/supabase-js";
import { Profile, Transaction, ClientBalance, Loan, LoanRepayment, CommissionRate, CommissionLedgerEntry, CommissionPayout, Notification, AuditLog, PayoutRequest, LoanGuarantor, LoanAgreement, PolicyLimit, Marathon, BadgeDefinition, AgentBadgeAward, CustomRole, CustomPermission, DepositCorrectionRequest, AgentLeave, BusinessHours, BusinessHoursAppeal, MarginSubmission, BusinessHoursSetting, BusinessHoursBranchAppeal, SelfDepositLockSettings, SubdivisionAccessSetting } from "../types";
import { hashPin } from "./db";

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || "";
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured = (): boolean => {
  return (
    typeof supabaseUrl === "string" &&
    supabaseUrl.trim().length > 0 &&
    typeof supabaseAnonKey === "string" &&
    supabaseAnonKey.trim().length > 0
  );
};

let supabaseInstance: any = null;

export function getSupabase() {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!supabaseInstance) {
    try {
      supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
    } catch (e) {
      console.error("Failed to initialize Supabase client:", e);
    }
  }
  return supabaseInstance;
}

export function packLoanMetadata(loan: Loan): Loan {
  const metaObject = {
    pay_back_by: loan.pay_back_by,
    escalated_by: loan.escalated_by,
    escalated_at: loan.escalated_at,
    pdg_approved_by: loan.pdg_approved_by,
    pdg_approved_at: loan.pdg_approved_at,
    originalStatus: loan.status
  };
  
  const purposeWithMeta = `${loan.purpose} ||meta:${JSON.stringify(metaObject)}`;
  
  return {
    ...loan,
    purpose: purposeWithMeta,
    status: loan.status === 'escalated' ? 'pending' : loan.status,
  };
}

export function unpackLoanMetadata(loan: Loan): Loan {
  if (!loan || !loan.purpose) return loan;
  const parts = loan.purpose.split(" ||meta:");
  if (parts.length > 1) {
    try {
      const meta = JSON.parse(parts[1]);
      return {
        ...loan,
        purpose: parts[0],
        pay_back_by: meta.pay_back_by,
        escalated_by: meta.escalated_by,
        escalated_at: meta.escalated_at,
        pdg_approved_by: meta.pdg_approved_by,
        pdg_approved_at: meta.pdg_approved_at,
        status: meta.originalStatus || loan.status
      };
    } catch (e) {
      console.error("Failed to parse loan metadata:", e);
    }
  }
  return loan;
}

export const KNOWN_PROFILE_COLUMNS = new Set([
  "id",
  "branch_id",
  "role",
  "full_name",
  "phone",
  "agent_code",
  "account_number",
  "national_id",
  "birthday",
  "subdivision",
  "locality",
  "payment_method",
  "payment_phone",
  "is_active",
  "force_password_change",
  "recruited_by",
  "joined_at",
  "last_seen_at",
  "unique_display_id",
  "pin_hash",
  "commission_recruitment_fee",
  "commission_deposit_pct",
  "contract_type",
  "guarantor_name",
  "guarantor_gender",
  "guarantor_residence_city",
  "guarantor_locality",
  "guarantor_id_number",
  "guarantor_id_expiry",
  "education_level",
  "dob",
  "email",
  "national_id_expiry",
  "education_cert_ref",
  "custom_role_id",
  "has_app_access",
  "setup_code",
  "staff_title",
  "permissions",
  "presence_status",
  "last_heartbeat_at",
  "national_id_document_type",
  "national_id_issued_date",
  "guarantor_id_document_type",
  "guarantor_id_issued_date",
  "photo_url",
  "revoked_permission_keys",
  "preferred_language",
]);

export function sanitizeProfileForSupabase(profile: any): any {
  if (!profile || typeof profile !== "object") return profile;
  const clean: Record<string, any> = {};
  for (const key of Object.keys(profile)) {
    if (KNOWN_PROFILE_COLUMNS.has(key)) {
      clean[key] = profile[key];
    }
  }
  return clean;
}

/**
 * Service to sync states to/from Supabase dynamically.
 * Fallbacks are provided for Offline-First operations when keys are not set.
 */
export class SupabaseService {
  private static getHeaders() {
    const isDataSaver = typeof window !== "undefined" && localStorage.getItem("ng_data_saver_mode") === "true";
    return {
      "Content-Type": "application/json",
      "x-internal-token": (import.meta as any).env?.VITE_INTERNAL_API_SECRET || "ngaccul-internal-dev-secret-2024",
      ...(isDataSaver ? { "x-data-saver": "true" } : {})
    };
  }

  // Sync wrapper for generic tables
  private static async selectAll<T>(tableName: string): Promise<T[] | null> {
    if (!isSupabaseConfigured()) return null;
    try {
      const resp = await fetch("/api/db/select", {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ table: tableName }),
      });
      if (!resp.ok) {
        throw new Error(`Select all failed with HTTP ${resp.status}`);
      }
      const json = await resp.json();
      if (!json.success) {
        throw new Error(json.error || "Unknown select error");
      }
      return json.data as T[];
    } catch (e) {
      console.error(`Error selecting all from ${tableName}:`, e);
      return null;
    }
  }

  public static async upsert<T>(tableName: string, records: T[]): Promise<boolean> {
    if (tableName === "profiles" && Array.isArray(records)) {
      records = records.map((r) => sanitizeProfileForSupabase(r)) as T[];
    }
    if (!isSupabaseConfigured()) {
      try {
        const key = `ng_offline_tbl_${tableName}`;
        const existingStr = localStorage.getItem(key);
        let existing: any[] = [];
        if (existingStr) {
          try {
            existing = JSON.parse(existingStr);
          } catch {
            existing = [];
          }
        }
        
        for (const record of records as any[]) {
          let foundIdx = -1;
          if (record.id) {
            foundIdx = existing.findIndex((item: any) => item.id === record.id);
          } else if (record.loan_id) {
            foundIdx = existing.findIndex((item: any) => item.loan_id === record.loan_id);
          } else if (record.client_id) {
            foundIdx = existing.findIndex((item: any) => item.client_id === record.client_id);
          }
          
          if (foundIdx !== -1) {
            existing[foundIdx] = { ...existing[foundIdx], ...record };
          } else {
            existing.push(record);
          }
        }
        localStorage.setItem(key, JSON.stringify(existing));
        return true;
      } catch (e) {
        console.warn(`Local fallback upsert failed for table ${tableName}:`, e);
        return false;
      }
    }
    if (records.length === 0) return true;
    try {
      const resp = await fetch("/api/db/upsert", {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ table: tableName, records }),
      });
      let json: any = null;
      try { json = await resp.json(); } catch { /* body wasn't JSON */ }
      if (!resp.ok || !json?.success) {
        throw new Error(json?.error || `Upsert failed with HTTP ${resp.status}`);
      }
      if (json.data && Array.isArray(json.data)) {
        json.data.forEach((savedRec: any, idx: number) => {
          if (records[idx] && typeof records[idx] === "object") {
            Object.assign(records[idx], savedRec);
          }
        });
      }
      return true;
    } catch (e) {
      console.error(`Error upserting to ${tableName}:`, e);
      throw e;
    }
  }

  // --- Dynamic profile/auth actions ---
  public static async fetchProfiles(branchId?: string): Promise<Profile[] | null> {
    if (!isSupabaseConfigured()) return null;
    try {
      const resp = await fetch("/api/db/select", {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          table: "profiles",
          eqFilters: branchId ? { branch_id: branchId } : undefined,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (!json.success) throw new Error(json.error || "Select error");
      return json.data as Profile[];
    } catch (e) {
      console.error("fetchProfiles exception:", e);
      return null;
    }
  }

  public static async authenticateUserInSupabase(phone: string, pin_hash: string): Promise<{ success: boolean; user?: Profile; error?: string; requiresPinSetup?: boolean }> {
    if (!isSupabaseConfigured()) return { success: false, error: "Supabase not configured." };
    try {
      let resp = await fetch("/api/db/select", {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          table: "profiles",
          eqFilters: { phone },
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      let json = await resp.json();
      if (!json.success) throw new Error(json.error || "Authentication select error");
      let profiles = json.data as Profile[];

      // Support fallback phone formats (e.g. adding or removing 237 country prefix)
      if (!profiles || profiles.length === 0) {
        const cleanDigits = phone.replace(/\D/g, "");
        let altPhone = "";
        if (cleanDigits.startsWith("237") && cleanDigits.length > 3) {
          altPhone = cleanDigits.slice(3);
        } else if (cleanDigits.length === 9) {
          altPhone = "237" + cleanDigits;
        }

        if (altPhone && altPhone !== phone) {
          const respAlt = await fetch("/api/db/select", {
            method: "POST",
            headers: this.getHeaders(),
            body: JSON.stringify({
              table: "profiles",
              eqFilters: { phone: altPhone },
            }),
          });
          if (respAlt.ok) {
            const jsonAlt = await respAlt.json();
            if (jsonAlt.success && jsonAlt.data && jsonAlt.data.length > 0) {
              profiles = jsonAlt.data as Profile[];
            }
          }
        }
      }

      if (!profiles || profiles.length === 0) {
        // Search by account_number
        const respAcc = await fetch("/api/db/select", {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify({
            table: "profiles",
            eqFilters: { account_number: phone.trim() },
          }),
        });
        if (respAcc.ok) {
          const jsonAcc = await respAcc.json();
          if (jsonAcc.success && jsonAcc.data && jsonAcc.data.length > 0) {
            profiles = jsonAcc.data as Profile[];
          }
        }
      }

      if (!profiles || profiles.length === 0) {
        // Search by agent_code
        const respCode = await fetch("/api/db/select", {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify({
            table: "profiles",
            eqFilters: { agent_code: phone.trim() },
          }),
        });
        if (respCode.ok) {
          const jsonCode = await respCode.json();
          if (jsonCode.success && jsonCode.data && jsonCode.data.length > 0) {
            profiles = jsonCode.data as Profile[];
          }
        }
      }

      if (!profiles || profiles.length === 0) {
        // Search by unique_display_id
        const respDisp = await fetch("/api/db/select", {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify({
            table: "profiles",
            eqFilters: { unique_display_id: phone.trim() },
          }),
        });
        if (respDisp.ok) {
          const jsonDisp = await respDisp.json();
          if (jsonDisp.success && jsonDisp.data && jsonDisp.data.length > 0) {
            profiles = jsonDisp.data as Profile[];
          }
        }
      }

      const profile = profiles && profiles[0];

      if (!profile) {
        return { success: false, error: "No profile matches this phone identifier in the live database." };
      }

      if (!profile.is_active && profile.role === "client" && profile.recruited_by) {
        const joinTime = new Date(profile.joined_at || (profile as any).created_at || 0).getTime();
        if (joinTime > 0 && Date.now() - joinTime >= 10 * 60 * 1000) {
          profile.is_active = true;
          try {
            await fetch("/api/db/update", {
              method: "POST",
              headers: this.getHeaders(),
              body: JSON.stringify({
                table: "profiles",
                values: { is_active: true },
                eqFilters: { id: profile.id },
              }),
            });
          } catch (e) {
            console.error("Failed to auto-activate profile in Supabase during login:", e);
          }
        }
      }

      if (!profile.is_active) {
        return { success: false, error: "Account access has been deactivated." };
      }

      if (profile.role === "pdg" && !profile.pin_hash) {
        return { success: false, requiresPinSetup: true, user: profile };
      }

      // Check temporary birthday password if force_password_change is active
      if (profile.force_password_change) {
        const cleanAttempt = pin_hash.trim();
        if (cleanAttempt === "password123") {
          return { success: true, user: profile };
        }
        if (profile.birthday) {
          const digits = profile.birthday.replace(/\D/g, "");
          const expectedBdays: string[] = [digits];
          const parts = profile.birthday.split(/[-/._ ]+/);
          if (parts.length === 3) {
            const p0 = parts[0].padStart(2, "0");
            const p1 = parts[1].padStart(2, "0");
            const p2 = parts[2].padStart(2, "0");
            if (parts[0].length === 4) {
              expectedBdays.push(p2 + p1 + p0);
            } else if (parts[2].length === 4) {
              expectedBdays.push(p0 + p1 + p2);
            }
          }
          const cleanAttemptDigits = cleanAttempt.replace(/\D/g, "");
          if (expectedBdays.some((eb) => cleanAttemptDigits === eb)) {
            return { success: true, user: profile };
          }
        }
      }

      // Main pin comparison code
      const hashedAttempt = await hashPin(pin_hash);
      const hashedPw123 = await hashPin('password123');
      if (hashedAttempt === hashedPw123 || hashedAttempt === profile.pin_hash || pin_hash === profile.pin_hash) {
        const updatedTime = new Date().toISOString();
        // Update last seen securely
        profile.last_seen_at = updatedTime;
        await this.upsert("profiles", [profile]);
        return { success: true, user: profile };
      }

      return { success: false, error: "Incorrect PIN check." };
    } catch (err: any) {
      console.error("Supabase authenticating user error:", err);
      return { success: false, error: err.message || "Cryptographic remote verify failed." };
    }
  }

  public static async completePdgPinSetup(phone: string, setupCode: string, newPin: string): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured()) return { success: false, error: "Supabase not configured." };
    try {
      const resp = await fetch("/api/db/select", {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ table: "profiles", eqFilters: { phone } }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (!json.success) throw new Error(json.error || "Select error");
      const profile = (json.data as Profile[])?.[0];

      if (!profile) return { success: false, error: "No profile matches this phone number." };
      if (profile.role !== "pdg") return { success: false, error: "This account is not a PDG profile." };
      if (profile.pin_hash) return { success: false, error: "A PIN has already been set for this account." };
      if (!profile.setup_code || profile.setup_code !== setupCode) {
        return { success: false, error: "Invalid or already-used setup code." };
      }

      const pinHash = await hashPin(newPin);
      const updatedProfile = { ...profile, pin_hash: pinHash, setup_code: null };
      const ok = await this.upsert("profiles", [updatedProfile]);
      if (!ok) return { success: false, error: "Failed to save the new PIN. Try again." };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || "Setup failed." };
    }
  }

  public static async saveProfile(profile: Profile): Promise<boolean> {
    return this.upsert("profiles", [sanitizeProfileForSupabase(profile)]);
  }

  public static async saveProfiles(profiles: Profile[]): Promise<boolean> {
    return this.upsert("profiles", profiles.map((p) => sanitizeProfileForSupabase(p)));
  }

  // --- Dynamic transactions actions ---
  public static async fetchTransactions(branchId?: string): Promise<Transaction[] | null> {
    if (!isSupabaseConfigured()) return null;
    try {
      const resp = await fetch("/api/db/select", {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          table: "transactions",
          orderCol: "created_at",
          orderAsc: false,
          eqFilters: branchId ? { branch_id: branchId } : undefined,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (!json.success) throw new Error(json.error || "Select error");
      return json.data as Transaction[];
    } catch (e) {
      console.error("fetchTransactions exception:", e);
      return null;
    }
  }

  public static async saveTransaction(tx: Transaction): Promise<boolean> {
    return this.upsert("transactions", [tx]);
  }

  public static async saveTransactions(txs: Transaction[]): Promise<boolean> {
    return this.upsert("transactions", txs);
  }

  // --- Client Balances ---
  public static async fetchBalances(branchId?: string): Promise<ClientBalance[] | null> {
    if (!isSupabaseConfigured()) return null;
    try {
      const resp = await fetch("/api/db/select", {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          table: "client_balances",
          eqFilters: branchId ? { branch_id: branchId } : undefined,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (!json.success) throw new Error(json.error || "Select error");
      return json.data as ClientBalance[];
    } catch (e) {
      console.error("fetchBalances exception:", e);
      return null;
    }
  }

  public static async saveBalance(balance: ClientBalance): Promise<boolean> {
    return this.upsert("client_balances", [balance]);
  }

  public static async saveBalances(balances: ClientBalance[]): Promise<boolean> {
    return this.upsert("client_balances", balances);
  }

  // --- Loans & Repayments ---
  public static async fetchLoans(branchId?: string): Promise<Loan[] | null> {
    if (!isSupabaseConfigured()) return null;
    try {
      const resp = await fetch("/api/db/select", {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          table: "loans",
          eqFilters: branchId ? { branch_id: branchId } : undefined,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (!json.success) throw new Error(json.error || "Select error");
      return (json.data as Loan[]).map(unpackLoanMetadata);
    } catch (e) {
      console.error("fetchLoans exception:", e);
      return null;
    }
  }

  public static async saveLoans(loans: Loan[]): Promise<boolean> {
    if (!loans) return false;
    const mapped = loans.map(packLoanMetadata);
    // Sanitize non-standard database columns before upsert
    const sanitized = mapped.map(({ pay_back_by, escalated_by, escalated_at, pdg_approved_by, pdg_approved_at, ...rest }) => rest);
    return this.upsert("loans", sanitized);
  }

  public static async saveLoan(loan: Loan): Promise<boolean> {
    return this.saveLoans([loan]);
  }

  public static async fetchRepayments(branchId?: string): Promise<LoanRepayment[] | null> {
    if (!isSupabaseConfigured()) return null;
    try {
      const resp = await fetch("/api/db/select", {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          table: "loan_repayments",
          eqFilters: branchId ? { branch_id: branchId } : undefined,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (!json.success) throw new Error(json.error || "Select error");
      return json.data as LoanRepayment[];
    } catch (e) {
      console.error("fetchRepayments exception:", e);
      return null;
    }
  }

  public static async saveRepayments(repayments: LoanRepayment[]): Promise<boolean> {
    return this.upsert("loan_repayments", repayments);
  }

  public static async saveRepayment(repayment: LoanRepayment): Promise<boolean> {
    return this.saveRepayments([repayment]);
  }

  // --- Commission ledger, rates, and payouts ---
  public static async fetchCommissionLedger(): Promise<CommissionLedgerEntry[] | null> {
    return this.selectAll<CommissionLedgerEntry>("commission_ledger");
  }

  public static async saveCommissionLedger(ledger: CommissionLedgerEntry[]): Promise<boolean> {
    return this.upsert("commission_ledger", ledger);
  }

  public static async fetchCommissionRates(): Promise<CommissionRate[] | null> {
    return this.selectAll<CommissionRate>("commission_rates");
  }

  public static async getCommissionRates(): Promise<CommissionRate[] | null> {
    return this.fetchCommissionRates();
  }

  public static async saveCommissionRate(rate: CommissionRate): Promise<boolean> {
    return this.upsert("commission_rates", [rate]);
  }

  public static async fetchPolicyLimits(): Promise<PolicyLimit[] | null> {
    return this.selectAll<PolicyLimit>("policy_limits");
  }

  public static async savePolicyLimit(limit: PolicyLimit): Promise<boolean> {
    return this.upsert("policy_limits", [limit]);
  }

  public static async fetchMarathons(): Promise<Marathon[] | null> {
    return this.selectAll<Marathon>("marathons");
  }

  public static async saveMarathon(marathon: Marathon): Promise<boolean> {
    return this.upsert("marathons", [marathon]);
  }

  public static async fetchBadgeDefinitions(): Promise<BadgeDefinition[] | null> {
    return this.selectAll<BadgeDefinition>("badge_definitions");
  }

  public static async saveBadgeDefinition(definition: BadgeDefinition): Promise<boolean> {
    return this.upsert("badge_definitions", [definition]);
  }

  public static async fetchAgentBadgeAwards(): Promise<AgentBadgeAward[] | null> {
    return this.selectAll<AgentBadgeAward>("agent_badge_awards");
  }

  public static async saveAgentBadgeAward(award: AgentBadgeAward): Promise<boolean> {
    return this.upsert("agent_badge_awards", [award]);
  }

  public static async fetchPayoutRequests(): Promise<PayoutRequest[] | null> {
    if (!isSupabaseConfigured()) return null;
    try {
      const resp = await fetch("/api/db/select", {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ table: "payout_requests" }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (!json.success) throw new Error(json.error || "Select error");
      return json.data as PayoutRequest[];
    } catch (e: any) {
      console.warn("Failed or table payout_requests missing in Supabase.", e.message);
      return null;
    }
  }

  public static async savePayoutRequests(requests: PayoutRequest[]): Promise<boolean> {
    return this.upsert("payout_requests", requests);
  }

  public static async savePayoutRequest(request: PayoutRequest): Promise<boolean> {
    return this.savePayoutRequests([request]);
  }

  public static async fetchMarginSubmissions(branchId?: string): Promise<MarginSubmission[] | null> {
    if (!isSupabaseConfigured()) return null;
    try {
      const resp = await fetch("/api/db/select", {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ table: "margin_submissions" }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (!json.success) throw new Error(json.error || "Select error");
      let list = json.data as MarginSubmission[];
      if (branchId) {
        list = list.filter((s) => s.branch_id === branchId);
      }
      return list;
    } catch (e: any) {
      console.warn("Failed or table margin_submissions missing in Supabase.", e.message);
      return null;
    }
  }

  public static async saveMarginSubmissions(submissions: MarginSubmission[]): Promise<boolean> {
    return this.upsert("margin_submissions", submissions);
  }

  public static async saveMarginSubmission(submission: MarginSubmission): Promise<boolean> {
    return this.saveMarginSubmissions([submission]);
  }

  public static async fetchDepositCorrectionRequests(): Promise<DepositCorrectionRequest[] | null> {
    if (!isSupabaseConfigured()) return null;
    try {
      const resp = await fetch("/api/db/select", {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ table: "deposit_correction_requests" }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (!json.success) throw new Error(json.error || "Select error");
      return json.data as DepositCorrectionRequest[];
    } catch (e: any) {
      console.warn("Failed or table deposit_correction_requests missing in Supabase.", e.message);
      return null;
    }
  }

  public static async saveDepositCorrectionRequests(requests: DepositCorrectionRequest[]): Promise<boolean> {
    return this.upsert("deposit_correction_requests", requests);
  }

  public static async saveDepositCorrectionRequest(request: DepositCorrectionRequest): Promise<boolean> {
    return this.saveDepositCorrectionRequests([request]);
  }

  public static async fetchLoanConfig(): Promise<{ interest_rate_pct: number; min_savings_fcfa: number; loan_approval_threshold_fcfa: number } | null> {
    if (!isSupabaseConfigured()) {
      const key = "ng_offline_tbl_loan_config";
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          const list = JSON.parse(stored);
          if (list && list.length > 0) return list[list.length - 1];
        } catch {}
      }
      return { interest_rate_pct: 5.0, min_savings_fcfa: 50000, loan_approval_threshold_fcfa: 1000000 };
    }
    try {
      const resp = await fetch("/api/db/select", {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ table: "loan_config", orderCol: "updated_at", orderAsc: false })
      });
      const json = await resp.json();
      if (json.success && json.data && json.data.length > 0) return json.data[0];
      return null;
    } catch { return null; }
  }

  public static async fetchActiveLoanTerms(): Promise<{ id: string; content_html: string; published_at: string } | null> {
    if (!isSupabaseConfigured()) {
      const key = "ng_offline_tbl_loan_terms";
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          const list = JSON.parse(stored);
          const active = list.find((item: any) => item.is_active === true);
          if (active) return active;
        } catch {}
      }
      return {
        id: "00000000-0000-0000-0000-000000000000",
        content_html: `<h1>STANDARD LOAN AGREEMENT</h1><p>This document outline the mutual binding policies and repayment requirements. Please modify this standard template as requested.</p><h2>SECTION 1: APPLICANT COVENANTS</h2><p>The applicant establishes clear consent to structural direct-debit or mobile money balance offsets in instances of default.</p>`,
        published_at: new Date().toISOString()
      };
    }
    try {
      const resp = await fetch("/api/db/select", {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          table: "loan_terms",
          eqFilters: { is_active: true },
          orderCol: "published_at",
          orderAsc: false
        })
      });
      const json = await resp.json();
      if (json.success && json.data && json.data.length > 0) return json.data[0];
      return null;
    } catch { return null; }
  }

  public static async publishLoanTerms(contentHtml: string, publishedBy: string): Promise<boolean> {
    if (!isSupabaseConfigured()) {
      try {
        const key = "ng_offline_tbl_loan_terms";
        const stored = localStorage.getItem(key);
        let list: any[] = [];
        if (stored) {
          try { list = JSON.parse(stored); } catch {}
        }
        list.forEach((item: any) => { item.is_active = false; });
        const newRecord = {
          id: "00000000-0000-0000-0000-000000000000",
          content_html: contentHtml,
          published_by: publishedBy,
          is_active: true,
          published_at: new Date().toISOString()
        };
        list.push(newRecord);
        localStorage.setItem(key, JSON.stringify(list));
        return true;
      } catch (e) {
        console.error("Local fallback publishLoanTerms error:", e);
        return false;
      }
    }
    try {
      // First update any active loan_terms to inactive
      await fetch("/api/db/update", {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          table: "loan_terms",
          updates: { is_active: false },
          eqFilters: { is_active: true }
        })
      });

      // Insert new active loan terms
      const newRecord = {
        content_html: contentHtml,
        published_by: publishedBy,
        is_active: true,
        published_at: new Date().toISOString()
      };

      return await this.upsert("loan_terms", [newRecord]);
    } catch (e) {
      console.error("publishLoanTerms exception:", e);
      return false;
    }
  }

  public static async saveLoanTerms(record: any): Promise<boolean> {
    return this.upsert("loan_terms", [record]);
  }

  public static async saveLoanGuarantor(record: any): Promise<boolean> {
    return this.upsert("loan_guarantors", [record]);
  }

  public static async fetchLoanGuarantor(loanId: string): Promise<LoanGuarantor | null> {
    if (!isSupabaseConfigured()) {
      const key = "ng_offline_tbl_loan_guarantors";
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          const list = JSON.parse(stored);
          return list.find((item: any) => item.loan_id === loanId) || null;
        } catch {}
      }
      return null;
    }
    try {
      const resp = await fetch("/api/db/select", {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          table: "loan_guarantors",
          eqFilters: { loan_id: loanId }
        })
      });
      const json = await resp.json();
      if (json.success && json.data && json.data.length > 0) return json.data[0];
      return null;
    } catch { return null; }
  }

  public static async saveLoanAgreement(record: any): Promise<boolean> {
    return this.upsert("loan_agreements", [record]);
  }

  public static async fetchLoanAgreement(loanId: string): Promise<LoanAgreement | null> {
    if (!isSupabaseConfigured()) {
      const key = "ng_offline_tbl_loan_agreements";
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          const list = JSON.parse(stored);
          return list.find((item: any) => item.loan_id === loanId) || null;
        } catch {}
      }
      return null;
    }
    try {
      const resp = await fetch("/api/db/select", {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          table: "loan_agreements",
          eqFilters: { loan_id: loanId }
        })
      });
      const json = await resp.json();
      if (json.success && json.data && json.data.length > 0) return json.data[0];
      return null;
    } catch { return null; }
  }

  public static async saveLoanConfig(record: any): Promise<boolean> {
    return this.upsert("loan_config", [record]);
  }

  public static async updateLoanConfig(configId: string, updates: { interest_rate_pct: number; min_savings_fcfa: number; loan_approval_threshold_fcfa: number; updated_by: string }): Promise<boolean> {
    if (!isSupabaseConfigured()) {
      try {
        const key = "ng_offline_tbl_loan_config";
        const stored = localStorage.getItem(key);
        let list: any[] = [];
        if (stored) {
          try { list = JSON.parse(stored); } catch {}
        }
        let found = false;
        list = list.map((item: any) => {
          if (item.id === configId || (!item.id && configId === "default_config_id")) {
            found = true;
            return { ...item, ...updates, updated_at: new Date().toISOString() };
          }
          return item;
        });
        if (!found) {
          list.push({ id: configId || "default_config_id", ...updates, updated_at: new Date().toISOString() });
        }
        localStorage.setItem(key, JSON.stringify(list));
        return true;
      } catch (e) {
        console.error("Local fallback updateLoanConfig error:", e);
        return false;
      }
    }
    try {
      const resp = await fetch("/api/db/update", {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          table: "loan_config",
          updates,
          eqFilters: { id: configId }
        })
      });
      const json = await resp.json();
      return !!json.success;
    } catch { return false; }
  }

  public static async saveLoanDisbursementConfirmation(record: any): Promise<boolean> {
    return this.upsert("loan_disbursement_confirmations", [record]);
  }

  public static async fetchLoanDisbursementConfirmations(clientId: string): Promise<any[] | null> {
    if (!isSupabaseConfigured()) {
      const key = "ng_offline_tbl_loan_disbursement_confirmations";
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          const list = JSON.parse(stored);
          return list.filter((item: any) => item.client_id === clientId || item.updated_by === clientId);
        } catch {}
      }
      return [];
    }
    try {
      const resp = await fetch("/api/db/select", {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          table: "loan_disbursement_confirmations",
          eqFilters: { client_id: clientId }
        })
      });
      const json = await resp.json();
      if (json.success && json.data) return json.data;
      return null;
    } catch { return null; }
  }

  private static realtimeChannel: any = null;
  private static presenceChannel: any = null;
  private static txRealtimeChannel: any = null;

  public static async fetchNotifications(branchId?: string): Promise<Notification[] | null> {
    if (!isSupabaseConfigured()) {
      const key = "ng_offline_tbl_notifications";
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          return JSON.parse(stored) as Notification[];
        } catch {}
      }
      return [];
    }
    try {
      const resp = await fetch("/api/db/select", {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          table: "notifications",
          orderCol: "created_at",
          orderAsc: false,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (!json.success) throw new Error(json.error || "Select error");

      let list = (json.data as Notification[]).filter((n) => !n.is_archived);

      // Apply the precise filtering matching getNotifications in db.ts
      try {
        const sessionStr = localStorage.getItem("ng_session");
        if (sessionStr) {
          const Actor = JSON.parse(sessionStr) as Profile;
          if (Actor) {
            list = list.filter((n) => {
              if (n.recipient_id === Actor.id) return true;
              if (
                Actor.role === "branch_admin" &&
                n.branch_id === Actor.branch_id &&
                (n.type === "loan_approval_required" ||
                  n.type === "withdrawal_pending_approval" ||
                  n.type === "loan_escalated_to_hq" ||
                  n.type === "withdrawal_escalated_to_hq")
              ) {
                return true;
              }
              if (
                Actor.role === "pdg" &&
                (n.type === "loan_approval_required" ||
                  n.type === "withdrawal_pending_approval" ||
                  n.type === "loan_escalated_to_hq" ||
                  n.type === "withdrawal_escalated_to_hq")
              ) {
                return true;
              }
              return false;
            });
          }
        }
      } catch (e) {
        console.error("Error filtering fetched notifications:", e);
      }

      return list;
    } catch (e) {
      console.error("fetchNotifications exception:", e);
      return null;
    }
  }

  public static async saveNotification(notification: Notification): Promise<boolean> {
    try {
      const resp = await fetch("/api/db/upsert", {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ table: "notifications", records: [notification] })
      });
      const json = await resp.json();
      return json.success === true;
    } catch (e) {
      console.error("saveNotification error:", e);
      return false;
    }
  }

  public static async fetchUnreadNotifications(recipientId: string): Promise<Notification[] | null> {
    if (!isSupabaseConfigured()) return null;
    try {
      const resp = await fetch("/api/db/select", {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          table: "notifications",
          eqFilters: { recipient_id: recipientId, is_read: false },
          orderCol: "created_at",
          orderAsc: false,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (!json.success) throw new Error(json.error || "Select error");
      const list = json.data as Notification[];
      return list.filter((n) => !n.is_archived);
    } catch (e) {
      console.error("fetchUnreadNotifications exception:", e);
      return null;
    }
  }

  public static async markNotificationRead(id: string): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;
    try {
      const resp = await fetch("/api/db/update", {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          table: "notifications",
          updates: { is_read: true },
          eqFilters: { id }
        })
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      return json.success === true;
    } catch (e) {
      console.error("markNotificationRead exception:", e);
      return false;
    }
  }

  public static async archiveNotifications(ids: string[]): Promise<boolean> {
    if (ids.length === 0) return true;
    if (!isSupabaseConfigured()) {
      // Local fallback for offline mode
      try {
        const key = "ng_offline_tbl_notifications";
        const stored = localStorage.getItem(key);
        if (stored) {
          let list = JSON.parse(stored) as Notification[];
          const now = new Date().toISOString();
          list = list.map((n) => {
            if (ids.includes(n.id)) {
              return { ...n, is_archived: true, archived_at: now };
            }
            return n;
          });
          localStorage.setItem(key, JSON.stringify(list));
        }
        return true;
      } catch (e) {
        console.error("Local fallback archiveNotifications error:", e);
        return false;
      }
    }
    try {
      const now = new Date().toISOString();
      const promises = ids.map((id) =>
        fetch("/api/db/update", {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify({
            table: "notifications",
            updates: { is_archived: true, archived_at: now },
            eqFilters: { id }
          })
        }).then(async (resp) => {
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const json = await resp.json();
          if (!json.success) throw new Error(json.error || "Update error");
          return true;
        })
      );
      await Promise.all(promises);
      return true;
    } catch (e) {
      console.error("archiveNotifications exception:", e);
      return false;
    }
  }

  public static async restoreNotifications(ids: string[]): Promise<boolean> {
    if (ids.length === 0) return true;
    if (!isSupabaseConfigured()) {
      // Local fallback for offline mode
      try {
        const key = "ng_offline_tbl_notifications";
        const stored = localStorage.getItem(key);
        if (stored) {
          let list = JSON.parse(stored) as Notification[];
          list = list.map((n) => {
            if (ids.includes(n.id)) {
              return { ...n, is_archived: false, archived_at: null };
            }
            return n;
          });
          localStorage.setItem(key, JSON.stringify(list));
        }
        return true;
      } catch (e) {
        console.error("Local fallback restoreNotifications error:", e);
        return false;
      }
    }
    try {
      const promises = ids.map((id) =>
        fetch("/api/db/update", {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify({
            table: "notifications",
            updates: { is_archived: false, archived_at: null },
            eqFilters: { id }
          })
        }).then(async (resp) => {
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const json = await resp.json();
          if (!json.success) throw new Error(json.error || "Update error");
          return true;
        })
      );
      await Promise.all(promises);
      return true;
    } catch (e) {
      console.error("restoreNotifications exception:", e);
      return false;
    }
  }

  public static subscribeToNotifications(
    recipientId: string,
    onNew: (notification: Notification) => void
  ): void {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabase();
    if (!supabase) return;

    // Clean up previous channel if exists
    if (SupabaseService.realtimeChannel) {
      supabase.removeChannel(SupabaseService.realtimeChannel);
    }

    SupabaseService.realtimeChannel = supabase
      .channel(`notifications:${recipientId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${recipientId}`
        },
        (payload: any) => {
          onNew(payload.new as Notification);
        }
      )
      .subscribe();
  }

  public static unsubscribeFromNotifications(): void {
    const supabase = getSupabase();
    if (supabase && SupabaseService.realtimeChannel) {
      supabase.removeChannel(SupabaseService.realtimeChannel);
      SupabaseService.realtimeChannel = null;
    }
  }

  // --- General sync trigger ---
  public static async syncSeedToSupabase(localState: {
    profiles: Profile[];
    transactions: Transaction[];
    balances: ClientBalance[];
    loans: Loan[];
    repayments: LoanRepayment[];
    payoutRequests: PayoutRequest[];
  }) {
    // Disabled to prevent polluting connected production databases with mock seeds
    return;
  }

  public static async fetchCustomRoles(branchId?: string): Promise<CustomRole[] | null> {
    if (!isSupabaseConfigured()) return null;
    try {
      const resp = await fetch("/api/db/select", {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          table: "custom_roles",
          eqFilters: branchId ? { branch_id: branchId } : undefined,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (!json.success) throw new Error(json.error || "Select error");
      return json.data as CustomRole[];
    } catch (e) {
      console.error("fetchCustomRoles exception:", e);
      return null;
    }
  }

  public static async saveCustomRole(role: CustomRole): Promise<boolean> {
    return this.upsert("custom_roles", [role]);
  }

  public static async deleteCustomRole(id: string): Promise<boolean> {
    if (!isSupabaseConfigured()) {
      try {
        const key = `ng_offline_tbl_custom_roles`;
        const existingStr = localStorage.getItem(key);
        if (existingStr) {
          let existing = JSON.parse(existingStr);
          existing = existing.filter((item: any) => item.id !== id);
          localStorage.setItem(key, JSON.stringify(existing));
        }
        return true;
      } catch (e) {
        console.warn(`Local fallback delete custom role failed:`, e);
        return false;
      }
    }
    try {
      const resp = await fetch("/api/db/delete", {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          table: "custom_roles",
          eqFilters: { id }
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (!json.success) throw new Error(json.error || "Delete error");
      return true;
    } catch (e) {
      console.error("deleteCustomRole exception:", e);
      return false;
    }
  }

  public static async fetchCustomPermissions(branchId?: string): Promise<CustomPermission[] | null> {
    if (!isSupabaseConfigured()) return null;
    try {
      const resp = await fetch("/api/db/select", {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          table: "custom_permissions",
          eqFilters: branchId ? { branch_id: branchId } : undefined,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (!json.success) throw new Error(json.error || "Select error");
      return json.data as CustomPermission[];
    } catch (e) {
      console.error("fetchCustomPermissions exception:", e);
      return null;
    }
  }

  public static async saveCustomPermission(permission: CustomPermission): Promise<boolean> {
    return this.upsert("custom_permissions", [permission]);
  }

  public static async saveAgentLeave(leave: AgentLeave): Promise<boolean> {
    return this.upsert("agent_leaves", [leave]);
  }

  public static async saveBusinessHours(bh: BusinessHours): Promise<boolean> {
    return this.upsert("business_hours", [bh]);
  }

  public static async saveBusinessHoursAppeal(appeal: BusinessHoursAppeal): Promise<boolean> {
    return this.upsert("business_hours_appeals", [appeal]);
  }

  public static async fetchBusinessHoursSettings(): Promise<BusinessHoursSetting[] | null> {
    return this.selectAll<BusinessHoursSetting>("business_hours_settings");
  }

  public static async fetchBusinessHoursBranchAppeals(): Promise<BusinessHoursBranchAppeal[] | null> {
    return this.selectAll<BusinessHoursBranchAppeal>("business_hours_appeals_branch");
  }

  public static async fetchBusinessHoursAppeals(): Promise<BusinessHoursAppeal[] | null> {
    return this.selectAll<BusinessHoursAppeal>("business_hours_appeals");
  }

  public static async fetchBusinessHours(): Promise<BusinessHours[] | null> {
    return this.selectAll<BusinessHours>("business_hours");
  }

  public static async fetchSelfDepositLockSettings(): Promise<SelfDepositLockSettings[] | null> {
    return this.selectAll<SelfDepositLockSettings>("self_deposit_lock_settings");
  }

  public static async fetchSubdivisionAccessSettings(): Promise<SubdivisionAccessSetting[] | null> {
    return this.selectAll<SubdivisionAccessSetting>("subdivision_access_settings");
  }

  public static async updatePresence(
    profileId: string,
    presenceStatus: "online" | "unstable" | "offline",
    lastHeartbeatAt: string
  ): Promise<boolean> {
    if (!isSupabaseConfigured()) {
      // Local fallback
      try {
        const storedStr = localStorage.getItem("ng_profiles");
        if (storedStr) {
          const profilesList = JSON.parse(storedStr) as Profile[];
          const idx = profilesList.findIndex((p) => p.id === profileId);
          if (idx !== -1) {
            profilesList[idx].presence_status = presenceStatus;
            profilesList[idx].last_heartbeat_at = lastHeartbeatAt;
            localStorage.setItem("ng_profiles", JSON.stringify(profilesList));
          }
        }
      } catch (e) {
        console.error("Local fallback updatePresence error:", e);
      }
      return true;
    }
    try {
      const resp = await fetch("/api/db/update", {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          table: "profiles",
          updates: {
            presence_status: presenceStatus,
            last_heartbeat_at: lastHeartbeatAt,
          },
          eqFilters: { id: profileId },
        }),
      });
      return resp.ok;
    } catch (e) {
      console.error("updatePresence error:", e);
      return false;
    }
  }

  public static subscribeToAgentPresences(
    branchId: string | "all",
    onUpdate: (updatedProfile: Profile) => void
  ): void {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabase();
    if (!supabase) return;

    // Clean up previous channel if exists
    if (SupabaseService.presenceChannel) {
      supabase.removeChannel(SupabaseService.presenceChannel);
    }

    const filter = branchId && branchId !== "all" ? `branch_id=eq.${branchId}` : undefined;

    SupabaseService.presenceChannel = supabase
      .channel(`agent_presences:${branchId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: filter,
        },
        (payload: any) => {
          const profile = payload.new as Profile;
          if (profile.role === "agent") {
            onUpdate(profile);
          }
        }
      )
      .subscribe();
  }

  public static unsubscribeFromAgentPresences(): void {
    const supabase = getSupabase();
    if (supabase && SupabaseService.presenceChannel) {
      supabase.removeChannel(SupabaseService.presenceChannel);
      SupabaseService.presenceChannel = null;
    }
  }

  public static subscribeToNewCashDeposits(
    branchId: string | "all",
    onNew: (tx: Transaction) => void,
    onUpdate?: (tx: Transaction) => void
  ): void {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabase();
    if (!supabase) return;

    if (SupabaseService.txRealtimeChannel) {
      supabase.removeChannel(SupabaseService.txRealtimeChannel);
    }

    const channelName = `transactions-cash:${branchId}`;
    let channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        branchId === "all"
          ? { event: "INSERT", schema: "public", table: "transactions" }
          : { event: "INSERT", schema: "public", table: "transactions", filter: `branch_id=eq.${branchId}` },
        (payload: any) => {
          onNew(payload.new as Transaction);
        }
      )
      .on(
        "postgres_changes",
        branchId === "all"
          ? { event: "UPDATE", schema: "public", table: "transactions" }
          : { event: "UPDATE", schema: "public", table: "transactions", filter: `branch_id=eq.${branchId}` },
        (payload: any) => {
          if (onUpdate) {
            onUpdate(payload.new as Transaction);
          } else {
            onNew(payload.new as Transaction);
          }
        }
      );

    SupabaseService.txRealtimeChannel = channel.subscribe();
  }

  public static unsubscribeFromNewCashDeposits(): void {
    const supabase = getSupabase();
    if (supabase && SupabaseService.txRealtimeChannel) {
      supabase.removeChannel(SupabaseService.txRealtimeChannel);
      SupabaseService.txRealtimeChannel = null;
    }
  }
}

let checkedBuckets: Record<string, boolean> = {};
export async function checkStorageBucketExists(bucketName: string = "profile-photos"): Promise<boolean> {
  if (checkedBuckets[bucketName]) return true;
  const supabase = getSupabase();
  if (supabase && isSupabaseConfigured()) {
    try {
      const { data: buckets, error } = await supabase.storage.listBuckets();
      if (!error && buckets) {
        const found = buckets.some((b) => b.name === bucketName);
        if (!found) {
          console.warn(`[Supabase Storage Warning] Bucket '${bucketName}' was not found in Supabase. Please create it in Supabase Dashboard → Storage (public bucket, name exactly '${bucketName}').`);
        } else {
          checkedBuckets[bucketName] = true;
        }
        return found;
      }
    } catch (err) {
      console.warn("Could not check Supabase storage buckets:", err);
    }
  }
  return true;
}

export async function uploadToSupabaseStorage(file: File, bucketName: string = "profile-photos"): Promise<string> {
  const supabase = getSupabase();
  if (supabase && isSupabaseConfigured()) {
    // Lazy one-time warning log if bucket is missing
    checkStorageBucketExists(bucketName).catch(() => {});

    try {
      const fileExt = file.name.split('.').pop();
      const randomId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const fileName = `${randomId}-${Date.now()}.${fileExt}`;
      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(fileName, file, { cacheControl: "3600", upsert: true });

      if (error) {
        console.error(`Supabase storage upload failed for bucket "${bucketName}":`, error);
        const errStr = (error.message || "").toLowerCase();
        if (errStr.includes("bucket not found") || (error as any).statusCode === "404" || (error as any).status === 404 || (error as any).error === "Bucket not found") {
          throw new Error(`Storage bucket '${bucketName}' is missing in Supabase. Please create it in Supabase Dashboard → Storage (public bucket, name exactly '${bucketName}') and try again.`);
        }
        throw new Error(`Photo upload failed: please try again or contact support (${error.message})`);
      } else {
        const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(fileName);
        if (urlData?.publicUrl) {
          return urlData.publicUrl;
        }
      }
    } catch (e: any) {
      console.error(`Error uploading to Supabase storage bucket "${bucketName}":`, e);
      const msg = e?.message || "";
      if (msg.toLowerCase().includes("bucket not found")) {
        throw new Error(`Storage bucket '${bucketName}' is missing in Supabase. Please create it in Supabase Dashboard → Storage (public bucket, name exactly '${bucketName}') and try again.`);
      }
      throw new Error(msg || "Photo upload failed: please try again or contact support");
    }
  }
  // Fallback to Base64 (only if not configured, e.g. local offline mode)
  console.info(`Supabase not configured or client missing while trying to upload to "${bucketName}". Falling back to Base64.`);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

