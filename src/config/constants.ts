export const CONFIG = {
  // Fraud control
  DEPOSIT_DISPUTE_WINDOW_HOURS: 1, // e.g., 24h in production. We simulate with 0.05h (3 mins) or 1h for testing
  REGISTRATION_CONFIRM_WINDOW_HOURS: 2, // e.g., 48h in production. 

  // Approval thresholds
  WITHDRAWAL_OTP_THRESHOLD_FCFA: 2000000,      // above this requires OTP verification.
                                                 // Raised from 50,000 - no current member withdraws
                                                 // this much via self-service, so the SMS-OTP gate is
                                                 // effectively dormant for now rather than removed outright,
                                                 // in case a future client needs it live at a lower amount.
  WITHDRAWAL_PDG_ESCALATION_THRESHOLD_FCFA: 500000, // above this, branch admin notifications are flagged
                                                       // "(PDG Escalation Level)". Kept independent of the OTP
                                                       // threshold above so raising one doesn't silently move the other.
  LOAN_BRANCH_APPROVAL_THRESHOLD_FCFA: 1000000, // above 1,000,000 FCFA routes directly to PDG

  // Anomaly detection
  ANOMALY_SINGLE_TXN_THRESHOLD_FCFA: 500000,  // flags single transaction above this

  // Session security
  SESSION_TIMEOUT_MINUTES: 15,
  AGENT_SESSION_TIMEOUT_MINUTES: 10,
  MAX_LOGIN_ATTEMPTS: 5,
  LOGIN_LOCKOUT_WINDOW_MINUTES: 10,
  REMEMBER_ME_DAYS: 7,

  // Commission defaults (can be overridden per-agent)
  DEFAULT_RECRUITMENT_FEE_FCFA: 1000,
  DEFAULT_DEPOSIT_PCT: 0.2000, // 20%

  // Policy Limit Default Fallbacks (Placeholders to be confirmed by client)
  DEFAULT_AGENT_COMMISSION_MIN_WITHDRAWAL: 5000,
  DEFAULT_CLIENT_SAVINGS_MIN_WITHDRAWAL: 1000,
  DEFAULT_LOAN_MIN_AMOUNT: 10000,
  DEFAULT_LOAN_MAX_AMOUNT: 2000000,
  DEFAULT_LOAN_MIN_TENURE_DAYS: 90,
  DEFAULT_LOAN_MIN_SAVINGS_FCFA: 5000,
} as const;
