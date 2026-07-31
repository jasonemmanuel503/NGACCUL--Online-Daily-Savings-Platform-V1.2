import React, { useState, useEffect } from "react";
import { GlobalLoading } from "../components/GlobalLoading";
import { ValidatedInput } from "../components/ValidatedInput";
import {
  Home,
  History,
  ArrowDownToLine,
  ArrowUpToLine,
  User,
  Users,
  PlusCircle,
  CircleDollarSign,
  Calendar,
  Bell,
  CheckCircle,
  Clock,
  AlertTriangle,
  Send,
  Lock,
  KeyRound,
  Wifi,
  WifiOff,
  Search,
  FileText,
  TrendingUp,
  X,
  XCircle,
  HelpCircle,
  Sun,
  Moon,
  Check,
  Copy,
  Smartphone,
  Info,
  Trophy,
  Award,
  Trash2,
  Archive,
} from "lucide-react";
import { motion } from "motion/react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  Profile,
  Transaction,
  ClientBalance,
  Loan,
  LoanRepayment,
  Notification,
  OfflineQueueItem,
  PayoutRequest,
  BusinessHoursAppeal,
  IdValidationSettings,
  SelfDepositLockSettings,
} from "../types";
import { dbService, STATIC_BRANCHES, formatCameroonPhone, generateUUID, checkBusinessHours, validateNationalID } from "../services/db";
import { ClassifiedPaymentError, classifyPaymentError } from "../utils/paymentErrors";
import { isSupabaseConfigured, SupabaseService, uploadToSupabaseStorage } from "../services/supabase";
import { T } from "../config/translations";
import { CONFIG } from "../config/constants";
import { LiquidSavingsCard } from "../components/LiquidSavingsCard";
import { GlassmorphismSelect } from "../components/GlassmorphismSelect";
import { LoanTimer } from "../components/LoanTimer";
import { DashboardHeader } from "../components/DashboardHeader";
import { PasswordInput } from "../components/PasswordInput";
import { CustomDateInput } from "../components/CustomDateInput";
import { NotificationCenter } from "../components/NotificationCenter";

const isDev = (import.meta as any).env?.DEV || false;

const ensureSafeLinks = (html: string): string => {
  if (!html) return "";
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const anchors = doc.querySelectorAll("a");
    let changed = false;
    anchors.forEach((anchor) => {
      if (anchor.getAttribute("target") !== "_blank") {
        anchor.setAttribute("target", "_blank");
        anchor.setAttribute("rel", "noopener noreferrer");
        changed = true;
      }
    });
    return changed ? doc.body.innerHTML : html;
  } catch (e) {
    return html.replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"([^>]*)>/gi, (match, href, rest) => {
      if (!/target=/i.test(match)) {
        return `<a href="${href}" target="_blank" rel="noopener noreferrer"${rest}>`;
      }
      return match;
    });
  }
};

const Confetti: React.FC = () => {
  const particles = Array.from({ length: 40 });
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {particles.map((_, i) => {
        const x = Math.random() * 100;
        const delay = Math.random() * 2;
        const duration = 2 + Math.random() * 3;
        const size = 6 + Math.random() * 8;
        const colors = ["#E8B649", "#a384d6", "#ffffff", "#7c4dcc", "#2ac075"];
        const color = colors[Math.floor(Math.random() * colors.length)];
        return (
          <motion.div
            key={i}
            initial={{ y: -20, x: `${x}%`, rotate: 0, opacity: 1 }}
            animate={{
              y: "110%",
              rotate: 360 * (Math.random() > 0.5 ? 1 : -1),
              opacity: [1, 1, 0]
            }}
            transition={{
              duration: duration,
              repeat: Infinity,
              delay: delay,
              ease: "easeOut"
            }}
            className="absolute rounded-full"
            style={{
              width: size,
              height: size,
              backgroundColor: color,
            }}
          />
        );
      })}
    </div>
  );
};

interface MobileAppProps {
  user: Profile;
  onLogout: () => void;
  language: "en" | "fr" | "ff";
  onChangeLanguage: (lang: "en" | "fr" | "ff") => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onUpdateUser?: (user: Profile) => void;
  onCredentialsChanged?: () => void;
}

export const MobileApp: React.FC<MobileAppProps> = ({
  user,
  onLogout,
  language,
  onChangeLanguage,
  theme,
  onToggleTheme,
  onUpdateUser,
  onCredentialsChanged,
}) => {
  const [activeTab, setActiveTab] = useState<
    | "home"
    | "history"
    | "withdraw"
    | "account"
    | "clients"
    | "deposit"
    | "commissions"
  >("home");
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [dataSaverMode, setDataSaverMode] = useState<boolean>(() => {
    return localStorage.getItem("ngaccul_data_saver_enabled") === "true" || localStorage.getItem("ng_data_saver_mode") === "true";
  });

  // Storage and Live State sync
  const [profile, setProfile] = useState<Profile>(user);
  const [myBalance, setMyBalance] = useState<ClientBalance | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [archivedNotifIds, setArchivedNotifIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(`ng_archived_notifs_${user.id}`) || "[]");
    } catch {
      return [];
    }
  });
  const [notifContextMenu, setNotifContextMenu] = useState<{ x: number; y: number; notifId: string } | null>(null);
  const [notifSelectionMode, setNotifSelectionMode] = useState<boolean>(false);
  const [selectedNotifIds, setSelectedNotifIds] = useState<string[]>([]);
  const [viewingArchivedNotifs, setViewingArchivedNotifs] = useState<boolean>(false);

  const archiveNotifications = async (ids: string[]) => {
    await dbService.archiveNotifications(ids);
    const updated = Array.from(new Set([...archivedNotifIds, ...ids]));
    setArchivedNotifIds(updated);
    localStorage.setItem(`ng_archived_notifs_${user.id}`, JSON.stringify(updated));
    setSelectedNotifIds([]);
    setNotifSelectionMode(false);
    setNotifications(dbService.getNotifications(profile));
  };

  const restoreNotifications = async (ids: string[]) => {
    await dbService.restoreNotifications(ids);
    const updated = archivedNotifIds.filter(id => !ids.includes(id));
    setArchivedNotifIds(updated);
    localStorage.setItem(`ng_archived_notifs_${user.id}`, JSON.stringify(updated));
    setSelectedNotifIds([]);
    setNotifSelectionMode(false);
    setNotifications(dbService.getNotifications(profile));
  };
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [myClients, setMyClients] = useState<Profile[]>([]);
  const [accruedCommissions, setAccruedCommissions] = useState(0);
  const [payoutsTotal, setPayoutsTotal] = useState(0);
  const [payoutRequests, setPayoutRequests] = useState<PayoutRequest[]>([]);
  const [syncQueueCount, setSyncQueueCount] = useState(
    dbService.getSyncQueueCount(),
  );

let mobileAudioCtx: AudioContext | null = null;
function getMobileAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!mobileAudioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      mobileAudioCtx = new AudioContextClass();
    }
  }
  if (mobileAudioCtx && mobileAudioCtx.state === "suspended") {
    mobileAudioCtx.resume().catch(() => {});
  }
  return mobileAudioCtx;
}

  const playMobileNotificationSound = async () => {
    try {
      const ctx = getMobileAudioContext();
      if (!ctx) return;
      if (ctx.state === "suspended") {
        await ctx.resume().catch(() => {});
      }
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.1); // A5 chime
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    } catch (e) {
      console.warn("Audio Context could not start:", e);
    }
  };

  useEffect(() => {
    if (notifications.length > 0) {
      const prevUnreadIdsStr = localStorage.getItem("mobile_prev_unread_ids");
      const currentUnreadList = notifications.filter(n => !n.is_read);
      const currentUnreadIds = currentUnreadList.map(n => n.id);

      if (prevUnreadIdsStr) {
        try {
          const prevUnreadIds = JSON.parse(prevUnreadIdsStr) as string[];
          const prevSet = new Set(prevUnreadIds);
          const hasNewUnread = currentUnreadIds.some(id => !prevSet.has(id));
          if (hasNewUnread) {
            playMobileNotificationSound();
          }
        } catch (e) {
          // Fallback to simple count
          const prevCount = parseInt(prevUnreadIdsStr, 10);
          if (!isNaN(prevCount) && currentUnreadList.length > prevCount) {
            playMobileNotificationSound();
          }
        }
      } else {
        // First initialization, if there are unread ones, also play sound
        if (currentUnreadList.length > 0) {
          playMobileNotificationSound();
        }
      }
      localStorage.setItem("mobile_prev_unread_ids", JSON.stringify(currentUnreadIds));
    }
  }, [notifications]);

  // Forms & Modal states
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawMethod, setWithdrawMethod] = useState<"mtn" | "orange">("mtn");
  const [withdrawPhone, setWithdrawPhone] = useState(
    myPhoneCleanup(profile.payment_phone || ""),
  );
  const [withdrawNote, setWithdrawNote] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [enteredOtp, setEnteredOtp] = useState("");

  const [loanAmount, setLoanAmount] = useState("");
  const [withdrawSubTab, setWithdrawSubTab] = useState<
    "withdrawing" | "loaning"
  >("withdrawing");
  const [loanPurpose, setLoanPurpose] = useState("");
  const [loanTerm, setLoanTerm] = useState("6");
  const [loanPaybackDate, setLoanPaybackDate] = useState(
    new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
  );

  // Multiphase loan states
  const [loanPhase, setLoanPhase] = useState<1 | 2 | 3>(1);
  const [loanConfig, setLoanConfig] = useState<{ interest_rate_pct: number; min_savings_fcfa: number } | null>(null);
  const [confirmedLoanIds, setConfirmedLoanIds] = useState<string[]>([]);
  
  const [guarantorName, setGuarantorName] = useState("");
  const [guarantorPhone, setGuarantorPhone] = useState("");
  const [guarantorRelationship, setGuarantorRelationship] = useState("");
  const [guarantorLocality, setGuarantorLocality] = useState("");
  const [guarantorNationalId, setGuarantorNationalId] = useState("");
  const [guarantorDocType, setGuarantorDocType] = useState<'card' | 'receipt'>("card");
  const [guarantorIssuedDate, setGuarantorIssuedDate] = useState("");
  const [guarantorIdExpiry, setGuarantorIdExpiry] = useState("");
  const [clientSignature, setClientSignature] = useState("");
  const [idValidationSettings, setIdValidationSettings] = useState<IdValidationSettings>(() => dbService.getIdValidationSettings());
  const [selfDepositLockSettings, setSelfDepositLockSettings] = useState<SelfDepositLockSettings>(() => dbService.getSelfDepositLockSettings());

  const [subdivisionChecked, setSubdivisionChecked] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [activeLoanTerms, setActiveLoanTerms] = useState<{ id: string; content_html: string } | null>(null);
  const [termsScrolledToBottom, setTermsScrolledToBottom] = useState(false);

  // Agent form states
  const [depClientId, setDepClientId] = useState("");
  const [depAmount, setDepAmount] = useState("");
  const [depMethod, setDepMethod] = useState("cash");
  const [depNote, setDepNote] = useState("");

  // Client direct deposit states
  const [clientDepAmount, setClientDepAmount] = useState("");
  const [clientDepMethod, setClientDepMethod] = useState("mtn_momo");
  const [clientDepPhone, setClientDepPhone] = useState(profile.phone || "");
  const [clientDepNote, setClientDepNote] = useState("");
  const [isDepositing, setIsDepositing] = useState(false);

  // Agent Payout Request states
  const [payoutModalOpen, setPayoutModalOpen] = useState(false);
  const [payoutFormType, setPayoutFormType] = useState<"total" | "custom">(
    "total",
  );
  const [customPayoutAmount, setCustomPayoutAmount] = useState("");
  const [payoutFormMethod, setPayoutFormMethod] = useState<
    "mtn_momo" | "orange_money"
  >("mtn_momo");
  const [payoutFormPhone, setPayoutFormPhone] = useState(
    profile.payment_phone || profile.phone || "",
  );
  const [payoutFormDestination, setPayoutFormDestination] = useState<"cash" | "savings">("cash");
  const [payoutChartDays, setPayoutChartDays] = useState<7 | 30>(7);
  const [tappedPhotos, setTappedPhotos] = useState<Record<string, boolean>>({});

  // Campay Mobile Money integration states
  const [campayTxRef, setCampayTxRef] = useState<string | null>(null);
  const [campayTxMethod, setCampayTxMethod] = useState<string | null>(null);
  const [campayTxAmount, setCampayTxAmount] = useState<number>(0);
  const [classifiedError, setClassifiedError] = useState<ClassifiedPaymentError | null>(null);
  const [campayPolling, setCampayPolling] = useState(false);
  const [campayTimer, setCampayTimer] = useState(60);
  const [campayStatusText, setCampayStatusText] = useState("");
  const [agentCampayPhone, setAgentCampayPhone] = useState("");
  const [campayEnvironmentName, setCampayEnvironmentName] = useState("sandbox");
  const [campayResultState, setCampayResultState] = useState<"polling" | "success" | "failed" | "expired">("polling");
  const [locallyCancelledRefs, setLocallyCancelledRefs] = useState<string[]>([]);

  const dismissCampayOverlay = () => {
    setCampayPolling(false);
    setCampayTxRef(null);
    setCampayTxMethod(null);
    setCampayResultState("polling");
    setCampayTxAmount(0);
    setClassifiedError(null);
  };

  const [regFullName, setRegFullName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regId, setRegId] = useState("");
  const [regDocType, setRegDocType] = useState<'card' | 'receipt'>("card");
  const [regIssuedDate, setRegIssuedDate] = useState("");
  const [regBday, setRegBday] = useState("");
  const [regSubdiv, setRegSubdiv] = useState(profile.subdivision);
  const [regLocality, setRegLocality] = useState("");
  const [regNoAppAccess, setRegNoAppAccess] = useState(false);
  const [regPhotoUrl, setRegPhotoUrl] = useState("");
  const [isRegisteringClient, setIsRegisteringClient] = useState(false);
  const [clientFilter, setClientFilter] = useState<"all" | "no_app_access">("all");
  const [noAppAccessReceipt, setNoAppAccessReceipt] = useState<{
    clientName: string;
    clientDisplayId: string;
    amount: number;
    date: string;
    agentName: string;
    branchName: string;
  } | null>(null);

  // Business hours active check
  const { within: isBusinessHours, message: businessHoursMessage } = checkBusinessHours(undefined, profile.id);

  // Selected details
  const [badgeAwards, setBadgeAwards] = useState<any[]>([]);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [repayAmount, setRepayAmount] = useState("");
  const [repaySource, setRepaySource] = useState<"account_balance" | "new_deposit">("account_balance");
  const [repayMethod, setRepayMethod] = useState<"mtn" | "orange">("mtn");
  const [repayPhone, setRepayPhone] = useState(profile.phone || "");
  const [isRepaying, setIsRepaying] = useState(false);
  const [repayError, setRepayError] = useState("");
  const [repaySuccess, setRepaySuccess] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [disputeNote, setDisputeNote] = useState("");
  const [disputeTxId, setDisputeTxId] = useState<string | null>(null);

  // Correction request states
  const [correctionTxId, setCorrectionTxId] = useState<string | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionAmount, setCorrectionAmount] = useState("");

  // Business hours appeal states
  const [appealReason, setAppealReason] = useState("");
  const [appealAmount, setAppealAmount] = useState("");
  const [showAppealForm, setShowAppealForm] = useState<string | null>(null);
  const [myAppeals, setMyAppeals] = useState<BusinessHoursAppeal[]>(() => dbService.getBusinessHoursAppeals(profile));

  // Client registration credential preview states
  const [showClientCredentialsModal, setShowClientCredentialsModal] = useState(false);
  const [createdClientCredentials, setCreatedClientCredentials] = useState<{
    profile: Profile;
    tempPin: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // First-Login PIN force fields
  const [forceCurrentPin, setForceCurrentPin] = useState("");
  const [forceNewPin, setForceNewPin] = useState("");
  const [forceConfirmPin, setForceConfirmPin] = useState("");

  // Self-Service PIN Reset fields
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");

  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [simulatedSms, setSimulatedSms] = useState<{
    to: string;
    body: string;
  } | null>(null);

  const strings = T[language] || T.en;

  const getStatusLabel = (status: string, strings: any, txRef?: string | null): string => {
    if (txRef && locallyCancelledRefs.includes(txRef)) {
      return strings.status_display_cancel || "Cancel";
    }
    switch (status) {
      case "confirmed": return strings.status_display_successful || "Successful";
      case "rejected": return strings.status_display_cancel || "Cancel";
      default: return strings.status_pending || "Pending";
    }
  };

  function myPhoneCleanup(p: string) {
    return p.replace(/[^0-9]/g, "");
  }

  // Network offline state checkers
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      showBanner(
        strings.offline_mode_active.replace(/[()]/g, "") + " Restored!",
        "success",
      );
      // Trigger auto synchronization
      handleSyncAction();
    };
    const handleOffline = () => {
      setIsOffline(true);
      showBanner(strings.offline_mode_active, "error");
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "SYNC_TRIGGER_ACTIVE") {
        console.log("[MobileApp] Received SYNC_TRIGGER_ACTIVE from Service Worker");
        setIsOffline(false);
        handleSyncAction();
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", handleMessage);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", handleMessage);
      }
    };
  }, [language]);

  // Initial Sync Data loaders
  useEffect(() => {
    loadMyServiceData();
    // Run evaluation tick once to auto finalize deposits
    dbService.runCronEvaluationTick();

    // Setup an interval to auto finalize deposits during user test session! (Every 10 seconds checking window, extended to 60 seconds if Data Saver is enabled)
    const intervalTime = dataSaverMode ? 60000 : 10000;
    const interval = setInterval(async () => {
      dbService.runCronEvaluationTick();
      if (isSupabaseConfigured()) {
        try {
          await dbService.syncFromSupabase();
        } catch (e) {
          console.error("Interval Supabase sync failed:", e);
        }
      }
      loadMyServiceData();
    }, intervalTime);

    return () => clearInterval(interval);
  }, [profile.id, dataSaverMode]);

  // Real-time subscription for transaction creation and status updates (§11c)
  useEffect(() => {
    if (isSupabaseConfigured() && profile.role === "agent") {
      SupabaseService.subscribeToNewCashDeposits(
        profile.branch_id,
        (_newTx) => {
          loadMyServiceData();
        },
        (updatedTx) => {
          const localTx = dbService.getTransactions(profile).find((t) => t.id === updatedTx.id);
          if (localTx) {
            Object.assign(localTx, updatedTx);
          }
          loadMyServiceData();
        }
      );
    }
  }, [profile.id, profile.branch_id, profile.role]);

  // Agent Heartbeat Loop
  const lastRoundTripTimeRef = React.useRef<number>(0);

  useEffect(() => {
    if (profile.role !== "agent") return;

    const runHeartbeat = async () => {
      if (document.visibilityState !== "visible") return;

      const startTime = Date.now();
      const conn = (navigator as any).connection;
      const effectiveType = conn?.effectiveType; // '4g', '3g', '2g', 'slow-2g'

      let presenceStatus: "online" | "unstable" | "offline" = "online";
      if (effectiveType === "2g" || effectiveType === "slow-2g" || lastRoundTripTimeRef.current > 3000) {
        presenceStatus = "unstable";
      }

      const lastHeartbeat = new Date().toISOString();
      const success = await SupabaseService.updatePresence(profile.id, presenceStatus, lastHeartbeat);

      if (success) {
        lastRoundTripTimeRef.current = Date.now() - startTime;
      }
    };

    // Run immediately on active/mount
    runHeartbeat();

    const intervalTime = dataSaverMode ? 120000 : 20000;
    const interval = setInterval(runHeartbeat, intervalTime);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        runHeartbeat();
      }
    };

    window.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [profile.id, profile.role, dataSaverMode]);

  // Real-time notification subscription
  useEffect(() => {
    const unsubscribe = dbService.onNotification((notif) => {
      const activeUser = dbService.getProfiles(profile).find((p) => p.id === profile.id) || profile;
      const isRelevant = 
        notif.recipient_id === activeUser.id ||
        (activeUser.role === "branch_admin" &&
         notif.branch_id === activeUser.branch_id &&
         (notif.type === "loan_approval_required" ||
          notif.type === "withdrawal_pending_approval" ||
          notif.type === "loan_escalated_to_hq" ||
          notif.type === "withdrawal_escalated_to_hq")) ||
        (activeUser.role === "pdg" &&
         (notif.type === "loan_approval_required" ||
          notif.type === "withdrawal_pending_approval" ||
          notif.type === "loan_escalated_to_hq" ||
          notif.type === "withdrawal_escalated_to_hq"));
      
      if (isRelevant) {
        setNotifications((prev) => {
          if (prev.some((n) => n.id === notif.id)) return prev;
          return [notif, ...prev];
        });
        loadMyServiceData();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [profile.id]);

  // Load Campay environment configurations on startup
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch("/api/campay/config");
        if (res.ok) {
          const config = await res.json();
          setCampayEnvironmentName(config.environment || "sandbox");
        }
      } catch (e) {
        if (isDev) {
          console.warn("Could not query Campay server configuration:", e);
        }
      }
    };
    fetchConfig();
  }, []);

  // Item 6b: Re-check pending transactions on app reopen / tab focus / tab navigation
  const recheckPendingTransaction = async (txRef: string, paymentMethod?: string) => {
    try {
      const method = paymentMethod || "campay";
      const res = await fetch(`/api/payments/status/${txRef}?paymentMethod=${method}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === "SUCCESSFUL") {
          await dbService.handleCampayNotification(txRef, "SUCCESSFUL");
          showBanner(
            "🎉 A pending transaction was successfully reconciled & confirmed!",
            "success"
          );
          loadMyServiceData();
          return true;
        } else if (data.status === "FAILED") {
          await dbService.handleCampayNotification(txRef, "FAILED");
          showBanner(
            "❌ A pending transaction was marked as failed after reconciliation check.",
            "error"
          );
          loadMyServiceData();
          return true;
        }
      }
    } catch (err) {
      if (isDev) {
        console.warn("Error re-checking transaction:", err);
      }
    }
    return false;
  };

  const checkAllPendingTransactions = async () => {
    const pendingTxs = transactions.filter((t) => t.status === "pending" && t.payment_ref);
    for (const tx of pendingTxs) {
      if (tx.payment_ref) {
        await recheckPendingTransaction(tx.payment_ref, tx.payment_method);
      }
    }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (isDev) {
          console.log("[NGACCUL] Tab focus / app reopen. Triggering pending payments sweep...");
        }
        checkAllPendingTransactions();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [transactions]);

  useEffect(() => {
    if (activeTab === "history" || activeTab === "deposit") {
      if (isDev) {
        console.log(`[NGACCUL] Switched to tab: ${activeTab}. Re-checking pending transactions...`);
      }
      checkAllPendingTransactions();
    }
  }, [activeTab, transactions]);

  // Polling Campay transaction status
  useEffect(() => {
    let pollInterval: any;
    let timerInterval: any;

    if (campayPolling && campayTxRef && campayResultState === "polling") {
      setCampayTimer(60);
      setCampayStatusText(
        strings.campay_initiated,
      );

      timerInterval = setInterval(() => {
        setCampayTimer((prev) => {
          if (prev <= 1) {
            clearInterval(timerInterval);
            clearInterval(pollInterval);
            // One last authoritative check before declaring expired/failed
            fetch(`/api/payments/status/${campayTxRef}?paymentMethod=${campayTxMethod || "campay"}`)
              .then(res => res.ok ? res.json() : null)
              .then(data => {
                if (data?.status === "SUCCESSFUL") {
                  setCampayResultState("success");
                  dbService.handleCampayNotification(campayTxRef, "SUCCESSFUL");
                  loadMyServiceData();
                } else {
                  setCampayResultState("expired");
                  showBanner(strings.campay_timeout, "error");
                }
              })
              .catch(() => {
                setCampayResultState("expired");
                showBanner(strings.campay_timeout, "error");
              });
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      pollInterval = setInterval(async () => {
        try {
          const res = await fetch(`/api/payments/status/${campayTxRef}?paymentMethod=${campayTxMethod || "campay"}`);
          if (res.ok) {
            const data = await res.json();
            if (isDev) {
              console.log("Polled Campay status:", data);
            }

            if (data.status === "SUCCESSFUL") {
              clearInterval(pollInterval);
              clearInterval(timerInterval);
              setCampayResultState("success");

              await dbService.handleCampayNotification(campayTxRef, "SUCCESSFUL");

              showBanner(
                "🎉 Mobile Money USSD Deposit Confirmed! Account Credited Successfully.",
                "success",
              );

              setClientDepAmount("");
              setClientDepNote("");
              setDepAmount("");
              setDepNote("");
              setAgentCampayPhone("");
              loadMyServiceData();
            } else if (data.status === "FAILED") {
              clearInterval(pollInterval);
              clearInterval(timerInterval);
              setClassifiedError(classifyPaymentError(data.message || "FAILED"));
              setCampayResultState("failed");

              await dbService.handleCampayNotification(campayTxRef, "FAILED");

              showBanner(
                "❌ FuturaPay USSD push rejected/failed. Verify PIN or funds and try again.",
                "error",
              );
              loadMyServiceData();
            } else {
              setCampayStatusText(
                strings.campay_ussd_sent,
              );
            }
          }
        } catch (err) {
          if (isDev) {
            console.error("Polling error:", err);
          }
        }
      }, 3000);
    }

    return () => {
      clearInterval(pollInterval);
      clearInterval(timerInterval);
    };
  }, [
    campayPolling,
    campayTxRef,
    campayResultState,
    clientDepAmount,
    depAmount,
    clientDepPhone,
    agentCampayPhone,
    clientDepMethod,
    depMethod,
    depClientId,
  ]);

  const loadMyServiceData = () => {
    try {
      const activeUser =
        dbService.getProfiles(profile).find((p) => p.id === profile.id) ||
        profile;
      setProfile(activeUser);
      setIdValidationSettings(dbService.getIdValidationSettings());
      setSelfDepositLockSettings(dbService.getSelfDepositLockSettings());

      // Load balances
      let myBalRec = null;
      if (activeUser.role === "client" || activeUser.role === "agent") {
        myBalRec = dbService.getAgentSavingsBalance(activeUser.id) || null;
      }
      if (myBalRec) {
        setMyBalance(myBalRec);
      } else {
        setMyBalance({
          client_id: activeUser.id,
          branch_id: activeUser.branch_id,
          balance: 0,
          total_deposits: 0,
          total_withdrawals: 0,
          updated_at: new Date().toISOString(),
        });
      }

      // Load transactions
      let txs = dbService.getTransactions(activeUser);
      const offlineQueue = dbService.syncQueue || [];
      const queuedDeposits = offlineQueue
        .filter((q) => q.status !== "synced" && q.action_type === "deposit")
        .map((q) => {
          const tx: Transaction = {
            id: q.id,
            branch_id: q.branch_id,
            client_id: q.payload.client_id,
            agent_id: q.actor_id,
            type: "deposit",
            amount: Number(q.payload.amount),
            payment_method: q.payload.method,
            note: q.payload.note || "[Offline Queue]",
            status: q.status === "failed" ? "disputed" : "pending",
            created_at: q.created_offline_at,
            created_by: q.actor_id,
          };
          return tx;
        });
      txs = [...queuedDeposits, ...txs];
      txs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setTransactions(txs);

      // Load loans
      const lns = dbService.getLoans(activeUser);
      setLoans(lns);

      // Fetch dynamic loan configuration, active terms and user disbursement confirmations
      SupabaseService.fetchLoanConfig().then((cfg) => {
        if (cfg) {
          setLoanConfig({
            interest_rate_pct: Number(cfg.interest_rate_pct),
            min_savings_fcfa: Number(cfg.min_savings_fcfa)
          });
        }
      }).catch(() => {});

      SupabaseService.fetchActiveLoanTerms().then((terms) => {
        if (terms) {
          setActiveLoanTerms(terms);
        }
      }).catch(() => {});

      SupabaseService.fetchLoanDisbursementConfirmations(activeUser.id).then((confList) => {
        if (confList) {
          setConfirmedLoanIds(confList.map((c: any) => c.loan_id));
        }
      }).catch(() => {});

      // Load notifications
      const notifs = dbService.getNotifications(activeUser);
      setNotifications(notifs);

      // Offline queue
      setSyncQueueCount(dbService.getSyncQueueCount());

      if (activeUser.role === "agent") {
        // Load agent badge awards
        setBadgeAwards(dbService.getAgentBadgeAwards(activeUser));
        // Load Agent specific portfolios
        let clients = dbService.getProfiles(activeUser);
        const queuedClients = offlineQueue
          .filter((q) => q.status !== "synced" && q.action_type === "register_client")
          .map((q) => {
            const tempProfile: Profile = {
              id: q.id,
              unique_display_id: "PENDING_SYNC",
              full_name: q.payload.name,
              phone: q.payload.phone,
              national_id: q.payload.national_id,
              birthday: q.payload.birthday,
              subdivision: q.payload.subdivision,
              locality: q.payload.locality,
              role: "client",
              branch_id: q.branch_id,
              joined_at: q.created_offline_at,
              recruited_by: q.actor_id,
              is_active: false,
              force_password_change: false,
            };
            return tempProfile;
          });
        clients = [...queuedClients, ...clients];
        clients.sort((a, b) => new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime());
        setMyClients(clients);

        // Load agent commissions from ledger
        const ledger = dbService.getCommissionLedger(activeUser);
        const totalEarned = ledger.reduce(
          (sum, item) => sum + Number(item.amount_fcfa),
          0,
        );
        setAccruedCommissions(totalEarned);

        const payouts = dbService.getCommissionPayouts(activeUser);
        const totalPaid = payouts.reduce(
          (sum, item) => sum + Number(item.amount_fcfa),
          0,
        );
        setPayoutsTotal(totalPaid);

        // Load agent payout requests
        setPayoutRequests(dbService.getPayoutRequests(activeUser));
      }
    } catch (err: any) {
      if (isDev) {
        console.error("Context synchronization error", err);
      }
    }
  };

  const checkPendingTransactionsStatus = async () => {
    // Clients check their own pending deposit transactions
    // Agents check pending deposit transactions under their active depClientId/portfolio
    const pendingTxs = transactions.filter((t) => {
      if (t.type !== "deposit" || t.status !== "pending" || !t.payment_ref) return false;
      
      if (profile.role === "client") {
        return t.client_id === profile.id;
      } else if (profile.role === "agent") {
        return t.created_by === profile.id || t.agent_id === profile.id;
      }
      return false;
    });

    if (pendingTxs.length === 0) return;

    if (isDev) {
      console.log(`[Re-check Pending] Found ${pendingTxs.length} pending transaction(s) to re-verify.`);
    }

    let updated = false;
    for (const tx of pendingTxs) {
      if (!tx.payment_ref) continue;
      try {
        const res = await fetch(`/api/payments/status/${tx.payment_ref}?paymentMethod=${tx.payment_method || "campay"}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === "SUCCESSFUL") {
            await dbService.handleCampayNotification(tx.payment_ref, "SUCCESSFUL");
            updated = true;
            if (isDev) {
              console.log(`[Re-check Pending] Transaction ${tx.payment_ref} confirmed.`);
            }
          } else if (data.status === "FAILED") {
            await dbService.handleCampayNotification(tx.payment_ref, "FAILED");
            updated = true;
            if (isDev) {
              console.log(`[Re-check Pending] Transaction ${tx.payment_ref} failed.`);
            }
          }
        }
      } catch (err) {
        if (isDev) {
          console.warn(`[Re-check Pending] Error checking ${tx.payment_ref}:`, err);
        }
      }
    }

    if (updated) {
      loadMyServiceData();
    }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkPendingTransactionsStatus();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [transactions, profile]);

  useEffect(() => {
    if (activeTab === "history" || activeTab === "deposit") {
      checkPendingTransactionsStatus();
    }
  }, [activeTab]);

  const showBanner = (msg: string, type: "success" | "error") => {
    if (type === "success") {
      setSuccessBanner(msg);
      setTimeout(() => setSuccessBanner(null), 4000);
    } else {
      setErrorBanner(msg);
      setTimeout(() => setErrorBanner(null), 4000);
    }
  };

  useEffect(() => {
    (window as any).showAppBanner = showBanner;
    return () => {
      delete (window as any).showAppBanner;
    };
  }, []);

  const handleSyncAction = async () => {
    if (!navigator.onLine) {
      showBanner("Could not sync: Device remains offline.", "error");
      return;
    }
    const processedCount = await dbService.processOfflineSyncQueue(profile);
    if (processedCount > 0) {
      showBanner(
        `Successfully synchronized ${processedCount} queued offline activities of field collection.`,
        "success",
      );
      loadMyServiceData();
    } else {
      showBanner(
        strings.sync_complete,
        "success",
      );
    }
  };

  const handleResetAndRetry = async (itemId: string) => {
    dbService.resetQueueItemStatus(itemId);
    await handleSyncAction();
  };

  // CLIENT FUNCTIONS //
  const handleWithdrawalRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(withdrawAmount);
    if (!amt || amt < 500) {
      showBanner("Minimum withdrawal is 500 FCFA.", "error");
      return;
    }

    if (myBalance && myBalance.balance < amt) {
      showBanner(strings.insufficient_balance, "error");
      return;
    }

    // Trigger OTP check if threshold passed
    if (amt >= (CONFIG.WITHDRAWAL_OTP_THRESHOLD_FCFA || 50000) && !otpSent) {
      fetch("/api/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: profile.phone, amount: amt }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setOtpSent(true);
            // Set custom simulatedSms notification overlay instead of native alert
            setSimulatedSms({
              to: profile.phone,
              body: strings.sms_withdrawal_otp
                .replace("{amount}", withdrawAmount)
                .replace("{otp}", data.simulated_otp),
            });
            showBanner(strings.otp_dispatched, "success");
          } else {
            showBanner(
              data.error || "Failed to dispatch verification code.",
              "error",
            );
          }
        })
        .catch((err) => {
          if (isDev) {
            console.error(err);
          }
          showBanner("Network error requesting verification code.", "error");
        });
      return;
    }

    const noteText = withdrawNote.trim();
    if (noteText.length > 150) {
      showBanner(
        "Withdrawal note/remarks must be 150 characters or less.",
        "error",
      );
      return;
    }

    // Complete request
    try {
      dbService.requestWithdrawal(
        profile,
        amt,
        withdrawMethod,
        withdrawPhone,
        noteText,
      );
      showBanner(strings.withdrawn_submitted_success, "success");

      // Reset
      setWithdrawAmount("");
      setWithdrawNote("");
      setOtpSent(false);
      setEnteredOtp("");
      loadMyServiceData();
      setActiveTab("home");
    } catch (err: any) {
      showBanner(err.message || "Failed.", "error");
    }
  };

  const handleVerifyOtpThenSubmit = () => {
    if (!enteredOtp.trim()) {
      showBanner("Please enter the verification code.", "error");
      return;
    }

    fetch("/api/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber: profile.phone, otp: enteredOtp }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          handleWithdrawalRequestSubmit({ preventDefault: () => {} } as any);
        } else {
          showBanner(
            data.error || strings.otp_incorrect,
            "error",
          );
        }
      })
      .catch((err) => {
        if (isDev) {
          console.error(err);
        }
        showBanner("Network error verifying code.", "error");
      });
  };

  const handleAppealSubmit = async (transactionType: 'deposit' | 'withdrawal' | 'registration') => {
    if (!appealReason.trim()) {
      showBanner("Please explain the reason for your lockout bypass appeal.", "error");
      return;
    }
    try {
      const amtNum = appealAmount ? Number(appealAmount) : undefined;
      await dbService.submitBusinessHoursAppeal(profile, {
        transaction_type: transactionType,
        amount_fcfa: amtNum,
        reason: appealReason.trim(),
      });
      showBanner("Emergency lockout appeal submitted to administrators. You will be notified of their review shortly.", "success");
      setAppealReason("");
      setAppealAmount("");
      setShowAppealForm(null);
      setMyAppeals(dbService.getBusinessHoursAppeals(profile));
    } catch (err: any) {
      showBanner(err.message || "Failed to submit appeal.", "error");
    }
  };

  const handleLoanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(loanAmount);
    const purposeText = loanPurpose.trim();

    // Verification check
    if (profile.is_active !== true || profile.force_password_change !== false) {
      showBanner("Your account must be fully verified and have completed password reset PIN updates.", "error");
      return;
    }

    // Savings check
    const minSavings = loanConfig?.min_savings_fcfa ?? 50000;
    if ((myBalance?.balance ?? 0) < minSavings) {
      showBanner(`You must have saved at least ${minSavings.toLocaleString()} FCFA before applying.`, "error");
      return;
    }

    // Active loan check
    const hasOutstandingLoan = loans.some((l) =>
      ["pending", "escalated", "approved", "active"].includes(l.status)
    );
    if (hasOutstandingLoan) {
      showBanner(strings.loan_active_exists, "error");
      return;
    }

    // Input checks
    if (!amt || amt <= 5000) {
      showBanner("Minimum loan amount is 5,000 FCFA.", "error");
      return;
    }
    if (!purposeText) {
      showBanner(strings.loan_purpose_required, "error");
      return;
    }

    // Step 2 validations - Guarantor
    if (!guarantorName.trim() || !guarantorPhone.trim() || !guarantorRelationship || !guarantorLocality.trim() || !guarantorNationalId.trim() || !guarantorIssuedDate) {
      showBanner("Please fill out all guarantor fields in Step 2.", "error");
      return;
    }

    const validation = validateNationalID(guarantorDocType, guarantorNationalId, guarantorIssuedDate, dbService.getIdValidationSettings());
    if (!validation.success) {
      showBanner(`Guarantor ID Validation: ${validation.error}`, "error");
      return;
    }
    const calculatedExpiry = validation.expiry || "";

    if (clientSignature.trim().toLowerCase() !== profile.full_name.trim().toLowerCase()) {
      showBanner("Signature verification failed: Type your exact legal name.", "error");
      return;
    }

    // Step 3 validations - Location & terms
    if (!subdivisionChecked) {
      showBanner("Please confirm your registered subdivision.", "error");
      return;
    }
    if (!termsChecked) {
      showBanner("Please agree to the loan terms and conditions.", "error");
      return;
    }

    try {
      // 1. Create client loan request with dynamic interest rate from config if loaded
      const rateSecured = loanConfig?.interest_rate_pct ?? 5.0;
      const loan = await dbService.createLoanRequest(
        profile,
        amt,
        purposeText,
        Number(loanTerm),
        loanPaybackDate,
        rateSecured
      );

      // 2. Save guarantor details
      await SupabaseService.saveLoanGuarantor({
        loan_id: loan.id,
        branch_id: profile.branch_id,
        full_name: guarantorName.trim(),
        phone: guarantorPhone.trim(),
        relationship: guarantorRelationship,
        locality: guarantorLocality.trim(),
        national_id_number: guarantorNationalId.trim(),
        national_id_document_type: guarantorDocType,
        national_id_issued_date: guarantorIssuedDate,
        national_id_expiry: calculatedExpiry,
        client_signature: clientSignature.trim()
      });

      // 3. Save loan agreement details
      await SupabaseService.saveLoanAgreement({
        loan_id: loan.id,
        client_id: profile.id,
        loan_terms_id: activeLoanTerms?.id || "00000000-0000-0000-0000-000000000000",
        client_location_text: profile.subdivision
      });

      // 4. Overwrite existing notification trigger body so it includes client subdivision
      showBanner("Cooperative loan application submitted successfully!", "success");
      setLoanAmount("");
      setLoanPurpose("");
      setGuarantorName("");
      setGuarantorPhone("");
      setGuarantorRelationship("");
      setGuarantorLocality("");
      setGuarantorNationalId("");
      setGuarantorDocType("card");
      setGuarantorIssuedDate("");
      setGuarantorIdExpiry("");
      setClientSignature("");
      setSubdivisionChecked(false);
      setTermsChecked(false);
      setTermsScrolledToBottom(false);
      setLoanPhase(1);
      
      loadMyServiceData();
      setActiveTab("home");
    } catch (err: any) {
      showBanner(err.message || strings.loan_purpose_required, "error");
    }
  };

  const handleConfirmLoanReceipt = async (loanId: string) => {
    try {
      const resp = await SupabaseService.saveLoanDisbursementConfirmation({
        loan_id: loanId,
        client_id: profile.id,
        confirmed_at: new Date().toISOString()
      });
      if (resp) {
        setConfirmedLoanIds((prev) => [...prev, loanId]);
        showBanner("Disbursement successfully acknowledged! Thank you for banking with NGACCUL.", "success");
        
        // Notify the branch admin
        const matchingLoan = loans.find(l => l.id === loanId);
        if (matchingLoan) {
          const bAdmins = dbService.getProfiles(profile).filter(p => p.role === 'branch_admin' && p.branch_id === profile.branch_id);
          bAdmins.forEach(admin => {
            const notif = {
              id: generateUUID(),
              branch_id: profile.branch_id,
              recipient_id: admin.id,
              type: 'loan_receipt_confirmed',
              title: 'Client Confirmed Loan Receipt',
              body: `Client ${profile.full_name} has acknowledged receipt of their approved loan of ${matchingLoan.amount.toLocaleString()} FCFA.`,
              reference_id: loanId,
              is_read: false,
              created_at: new Date().toISOString(),
            };
            dbService.getNotifications(admin).unshift(notif);
            if (isSupabaseConfigured()) {
              SupabaseService.saveNotification(notif).catch(() => {});
            }
          });
        }
        loadMyServiceData();
        setSelectedLoan(null);
      } else {
        showBanner("Failed to register confirmation online.", "error");
      }
    } catch (err: any) {
      showBanner(err.message, "error");
    }
  };

  const handleSelfServiceRepay = async (repaymentId: string) => {
    if (!selectedLoan) return;
    const amountVal = parseFloat(repayAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      setRepayError("Please supply a valid payment amount (FCFA).");
      return;
    }

    setRepayError("");
    setRepaySuccess("");
    setIsRepaying(true);

    try {
      // Simulate real-time processing delay of 1.5s
      await new Promise((resolve) => setTimeout(resolve, 1500));

      await dbService.clientSelfServiceRepay(
        profile,
        selectedLoan.id,
        repaymentId,
        amountVal,
        repaySource,
        repaySource === "new_deposit" ? repayMethod : undefined,
        repaySource === "new_deposit" ? repayPhone : undefined,
      );

      setRepaySuccess(`Repayment of ${amountVal.toLocaleString()} FCFA recorded successfully!`);
      setRepayAmount("");
      
      // Reload details & refresh data
      showBanner(`Your repayment of ${amountVal.toLocaleString()} FCFA has been processed.`, "success");
      loadMyServiceData();
    } catch (err: any) {
      setRepayError(err.message || "An error occurred during repayment.");
    } finally {
      setIsRepaying(false);
    }
  };

  const handleTermsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const reachedBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 10;
    if (reachedBottom) {
      setTermsScrolledToBottom(true);
    }
  };

  const handleDisputeSubmit = () => {
    if (!disputeTxId) return;
    if (!disputeNote.trim()) {
      showBanner(strings.dispute_reason_required, "error");
      return;
    }

    try {
      dbService.disputeTransaction(profile, disputeTxId, disputeNote);
      showBanner(strings.dispute_success, "success");
      setDisputeTxId(null);
      setDisputeNote("");
      setSelectedTx(null);
      loadMyServiceData();
    } catch (err: any) {
      showBanner(err.message || "Failed.", "error");
    }
  };

  const handleCorrectionSubmit = async () => {
    if (!correctionTxId) return;
    if (!correctionReason.trim()) {
      showBanner(strings.x_please_specify_reason_for_correction || "Please specify a reason for the correction review request.", "error");
      return;
    }

    try {
      const amtNum = correctionAmount.trim() ? parseInt(correctionAmount, 10) : undefined;
      if (amtNum !== undefined && (isNaN(amtNum) || amtNum <= 0)) {
        showBanner(strings.x_please_specify_valid_suggested_amount || "Please specify a valid positive suggested amount.", "error");
        return;
      }

      await dbService.requestDepositCorrection(
        profile,
        correctionTxId,
        correctionReason.trim(),
        amtNum
      );

      showBanner(strings.x_correction_request_submitted_success || "Deposit correction request submitted successfully for admin review.", "success");
      setCorrectionTxId(null);
      setCorrectionReason("");
      setCorrectionAmount("");
      setSelectedTx(null); // close modal
      loadMyServiceData(); // reload
    } catch (err: any) {
      showBanner(err.message || "Failed.", "error");
    }
  };

  const handleSelfPINResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPin || !newPin || !confirmNewPin) {
      showBanner("Please fill in all PIN fields.", "error");
      return;
    }
    if (newPin.length !== 6 || isNaN(Number(newPin))) {
      showBanner("New PIN must be exactly 6 digits.", "error");
      return;
    }
    if (newPin !== confirmNewPin) {
      showBanner("New PIN and confirmation PIN do not match.", "error");
      return;
    }

    try {
      await dbService.selfServiceResetPIN(profile.id, oldPin, newPin);
      if (onCredentialsChanged) {
        onCredentialsChanged();
      }
      showBanner("Login PIN successfully updated! Be sure to use your new PIN for future sign-ins.", "success");
      setOldPin("");
      setNewPin("");
      setConfirmNewPin("");
      loadMyServiceData();
    } catch (err: any) {
      showBanner(err.message, "error");
    }
  };

  const handleForcePINResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forceNewPin || !forceConfirmPin) {
      showBanner("Please fill in all required PIN fields.", "error");
      return;
    }
    if (forceNewPin.length !== 6 || isNaN(Number(forceNewPin))) {
      showBanner("New PIN must be exactly 6 digits.", "error");
      setTimeout(() => {
        setForceNewPin("");
        setForceConfirmPin("");
      }, 1000);
      return;
    }
    if (forceNewPin !== forceConfirmPin) {
      showBanner("New PIN and confirmation PIN do not match.", "error");
      setTimeout(() => {
        setForceNewPin("");
        setForceConfirmPin("");
      }, 1000);
      return;
    }

    try {
      await dbService.selfServiceResetPIN(profile.id, 'bypass_force_reset', forceNewPin);
      
      // Sync to localStorage so AppLock reads the new hash immediately
      const { hashPin } = await import('../services/db');
      const hashedNew = await hashPin(forceNewPin);
      localStorage.setItem(`ng_pin_${profile.id}`, hashedNew);

      if (onCredentialsChanged) {
        onCredentialsChanged();
      }

      showBanner("Your secure Login PIN has been successfully set up!", "success");
      
      // Delay unmounting (the force_password_change false state change) by 1500ms
      setTimeout(() => {
        // Update local profile state
        const updatedProfile = { ...profile, force_password_change: false };
        setProfile(updatedProfile);
        
        // Reload logged session too
        localStorage.setItem("ng_session", JSON.stringify(updatedProfile));

        if (onUpdateUser) {
          onUpdateUser(updatedProfile);
        }
      }, 1500);
    } catch (err: any) {
      showBanner(err.message, "error");
      setTimeout(() => {
        setForceNewPin("");
        setForceConfirmPin("");
      }, 1000);
    }
  };

  const handleClientDirectDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selfDepositLockSettings.client_locked) {
      showBanner(strings.self_deposit_locked_notice || "This feature will be available soon.", "error");
      return;
    }
    const amt = Number(clientDepAmount);

    if (!amt || amt <= 0) {
      showBanner(strings.deposit_invalid_amount, "error");
      return;
    }
    if (!clientDepPhone) {
      showBanner(strings.deposit_phone_required, "error");
      return;
    }

    if (isOffline) {
      dbService.queueOfflineAction(profile.id, profile.branch_id, "deposit", {
        client_id: profile.id,
        amount: amt,
        method: clientDepMethod,
        phone: clientDepPhone,
        note: `[Offline Request] ${clientDepNote}`,
      });
      showBanner(
        "No Connectivity: Deposit successfully queued offline.",
        "success",
      );
      setClientDepAmount("");
      setClientDepNote("");
      loadMyServiceData();
      return;
    }

    setIsDepositing(true);
    try {
      const formattedPhone = formatCameroonPhone(clientDepPhone);
      const newTx = await dbService.createClientDirectDeposit(
        profile,
        amt,
        clientDepMethod,
        formattedPhone,
        clientDepNote || `Self-deposit via ${clientDepMethod.toUpperCase()}`,
      );

      if (newTx.payment_ref) {
        setCampayTxAmount(amt);
        setCampayTxRef(newTx.payment_ref);
        setCampayTxMethod(newTx.payment_method || clientDepMethod);
        setCampayResultState("polling");
        setCampayPolling(true);
        showBanner(
          "📱 USSD Push Request Ignited. Check phone for PIN confirmation!",
          "success",
        );
      } else {
        showBanner(
          "Savings logged successfully.",
          "success",
        );
      }
      setClientDepAmount("");
      setClientDepNote("");
      loadMyServiceData();
    } catch (err: any) {
      setClassifiedError(classifyPaymentError(err.message || ""));
      setCampayTxAmount(amt);
      setCampayResultState("failed");
      setCampayPolling(true);
      showBanner(
        err.message || "Failed to trigger FuturaPay Mobile Money prompt.",
        "error",
      );
    } finally {
      setIsDepositing(false);
    }
  };

  // --- Receipt Fraud Prevention States ---
  const [receiptFileBase64, setReceiptFileBase64] = useState<string | null>(null);
  const [receiptMimeType, setReceiptMimeType] = useState<string | null>(null);
  const [isVerifyingReceipt, setIsVerifyingReceipt] = useState(false);
  const [receiptVerificationResult, setReceiptVerificationResult] = useState<{
    success: boolean;
    reference?: string;
    amount?: number;
    date?: string;
    provider?: string;
    error?: string;
  } | null>(null);

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = (reader.result as string).split(",")[1];
      setReceiptFileBase64(base64String);
      setReceiptMimeType(file.type);
      setReceiptVerificationResult(null);

      // Trigger verification
      setIsVerifyingReceipt(true);
      try {
        const response = await fetch("/api/fraud/verify-receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: base64String,
            mimeType: file.type,
            enteredAmount: depAmount,
            paymentMethod: depMethod,
          }),
        });
        const data = await response.json();
        setReceiptVerificationResult(data);
        if (data.success && data.reference) {
          // Auto fill memo or reference note if possible
          setDepNote(`Ref: ${data.reference}`);
          showBanner("Receipt successfully verified by Anti-Fraud AI!", "success");
        } else if (!data.success) {
          showBanner(data.error || "Receipt verification failed.", "error");
        }
      } catch (err) {
        console.error(err);
        showBanner("Error communicating with Fraud Prevention service.", "error");
      } finally {
        setIsVerifyingReceipt(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // AGENT ACTIONS //
  const handleAgentDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selfDepositLockSettings.agent_locked && depClientId === profile.id) {
      showBanner(strings.self_deposit_locked_notice || "This feature will be available soon.", "error");
      return;
    }
    const amt = Number(depAmount);

    if (!depClientId) {
      showBanner(strings.client_select_required, "error");
      return;
    }
    if (!amt || amt <= 0) {
      showBanner(strings.amount_required, "error");
      return;
    }

    if (receiptVerificationResult && !receiptVerificationResult.success) {
      showBanner("Audit failure block: Cannot submit a deposit with an invalid or flagged payment receipt.", "error");
      return;
    }

    if (isOffline) {
      if (depMethod === "mtn" || depMethod === "orange") {
        showBanner(
          "Offline Mode: Real-time FuturaPay USSD prompts cannot be fired without connection.",
          "error",
        );
        return;
      }

      // queue locally in sync database
      dbService.queueOfflineAction(profile.id, profile.branch_id, "deposit", {
        client_id: depClientId,
        amount: amt,
        method: depMethod,
        note: depNote,
      });
      showBanner(
        "No Connectivity: Deposit successfully queued offline in service registry.",
        "success",
      );
      setDepAmount("");
      setDepNote("");
      loadMyServiceData();
      return;
    }

    // Online standard submit
    setIsDepositing(true);
    const isMobileMoney = depMethod === "mtn" || depMethod === "orange";

    try {
      const selectedClient = myClients.find((p) => p.id === depClientId);
      const isMobileMoneyMethod = depMethod === "mtn" || depMethod === "orange";
      const targetPhone = isMobileMoneyMethod
        ? (agentCampayPhone || (selectedClient ? selectedClient.phone : ""))
        : (selectedClient ? selectedClient.phone : "");

      const newTx = await dbService.createAgentDeposit(
        profile,
        depClientId,
        amt,
        depMethod,
        depNote,
        targetPhone,
      );

      if (isMobileMoney && newTx.payment_ref) {
        setCampayTxAmount(amt);
        setCampayTxRef(newTx.payment_ref);
        setCampayTxMethod(depMethod);
        setCampayResultState("polling");
        setCampayPolling(true);
        showBanner(
          "⚡ USSD Mobile Money Push Loaded! Let client finalize authentication on handset.",
          "success",
        );
      } else {
        showBanner(strings.deposit_logged_success, "success");
      }

      if (selectedClient && selectedClient.has_app_access === false) {
        const branchName = STATIC_BRANCHES.find((b) => b.id === profile.branch_id)?.name || profile.branch_id.toUpperCase();
        setNoAppAccessReceipt({
          clientName: selectedClient.full_name,
          clientDisplayId: selectedClient.unique_display_id || "",
          amount: amt,
          date: new Date(newTx.created_at).toLocaleString(),
          agentName: profile.full_name,
          branchName: branchName,
        });
      }

      setDepAmount("");
      setDepNote("");
      setReceiptFileBase64(null);
      setReceiptMimeType(null);
      setReceiptVerificationResult(null);
      loadMyServiceData();
    } catch (err: any) {
      if (isMobileMoney) {
        setClassifiedError(classifyPaymentError(err.message || ""));
        setCampayTxAmount(amt);
        setCampayResultState("failed");
        setCampayPolling(true);
      }
      showBanner(err.message || strings.error, "error");
    } finally {
      setIsDepositing(false);
    }
  };

  const handleAgentRegisterClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !regFullName.trim() ||
      !regPhone.trim() ||
      !regId.trim() ||
      !regLocality.trim() ||
      !regIssuedDate
    ) {
      showBanner(
        "ID Card Fraud Prevention: All registration fields, including date of issuance, are required.",
        "error",
      );
      return;
    }

    const subdivBranchMatch =
      STATIC_BRANCHES.find((b) => b.name === regSubdiv)?.id ===
      profile.branch_id;
    if (!subdivBranchMatch) {
      showBanner(
        "Validation Warning: Selected Subdivision must match your active branch office locality.",
        "error",
      );
      return;
    }

    setIsRegisteringClient(true);
    try {
      if (isOffline) {
        const tempId = generateUUID();
        const existingClientsCount = dbService.getProfiles(profile).filter((p) => p.role === "client").length;
        const queuedClientsCount = (dbService.syncQueue || []).filter((q) => q.status !== "synced" && q.action_type === "register_client").length;
        const nextNum = existingClientsCount + queuedClientsCount + 43;
        const tempDisplayId = `NGC-CLIENT-${nextNum.toString().padStart(4, "0")}`;

        dbService.queueOfflineAction(
          profile.id,
          profile.branch_id,
          "register_client",
          {
            id: tempId,
            unique_display_id: tempDisplayId,
            name: regFullName,
            phone: regPhone,
            national_id: regId,
            birthday: regBday,
            subdivision: regSubdiv,
            locality: regLocality,
            has_app_access: !regNoAppAccess,
            photo_url: regPhotoUrl,
            national_id_document_type: regDocType,
            national_id_issued_date: regIssuedDate,
          },
        );
        showBanner("No connectivity: Registration queued offline.", "success");
        setRegFullName("");
        setRegPhone("");
        setRegId("");
        setRegDocType("card");
        setRegIssuedDate("");
        setRegBday("");
        setRegLocality("");
        setRegNoAppAccess(false);
        setRegPhotoUrl("");
        loadMyServiceData();
      } else {
        try {
          const result = await dbService.registerClientByAgent(
            profile,
            regFullName,
            regPhone,
            regId,
            regBday,
            regSubdiv,
            regLocality,
            undefined,
            undefined,
            undefined,
            !regNoAppAccess,
            regPhotoUrl,
            regDocType,
            regIssuedDate,
          );
          setCreatedClientCredentials(result);
          setShowClientCredentialsModal(true);
          showBanner("Client registered successfully! Credentials generated.", "success");
          setRegFullName("");
          setRegPhone("");
          setRegId("");
          setRegDocType("card");
          setRegIssuedDate("");
          setRegBday("");
          setRegLocality("");
          setRegNoAppAccess(false);
          setRegPhotoUrl("");
          loadMyServiceData();
        } catch (err: any) {
          showBanner(err.message || "Registration failed.", "error");
        }
      }
    } finally {
      setIsRegisteringClient(false);
    }
  };

  if (profile.role === "client" && profile.force_password_change) {
    return (
      <div className="fixed inset-0 bg-[#0F0822] text-white z-[99999] flex flex-col justify-center items-center p-6 font-sans">
        {successBanner && (
          <div 
            className="fixed top-4 left-4 right-4 bg-[#1A7A4A] text-white py-3 px-4 rounded-xl shadow-lg flex items-center gap-2 z-[100005] animate-bounce"
            style={{ zIndex: 100005 }}
          >
            <CheckCircle className="w-5 h-5 shrink-0" />
            <span className="text-sm font-medium">{successBanner}</span>
          </div>
        )}
        {errorBanner && (
          <div 
            className="fixed top-4 left-4 right-4 bg-[#B42318] text-white py-3 px-4 rounded-xl shadow-lg flex items-center gap-2 z-[100005]"
            style={{ zIndex: 100005 }}
          >
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span className="text-sm font-medium">{errorBanner}</span>
          </div>
        )}
        <div className="w-full max-w-md bg-white dark:bg-[#150B2E] text-brand-primary dark:text-white p-8 rounded-3xl shadow-2xl border border-brand-secondary/35 dark:border-brand-accent/25 space-y-6 relative overflow-hidden">
          {/* Accent light banner */}
          <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-purple-500 via-pink-500 to-indigo-500"></div>
          
          <div className="w-16 h-16 bg-brand-primary/10 dark:bg-white/10 rounded-2xl flex items-center justify-center text-brand-primary dark:text-white mx-auto">
            <Lock className="w-8 h-8 text-[#E8B649] animate-pulse" />
          </div>

          <div className="text-center space-y-2">
            <h2 className="text-xl font-display font-black tracking-tight text-[#150B2E] dark:text-white animate-fade-in">
              {strings.first_login_title}
            </h2>
            <p className="text-xs text-brand-primary/70 dark:text-white/80 leading-normal font-sans">
              {strings.first_login_welcome}
            </p>
          </div>

          <form onSubmit={handleForcePINResetSubmit} className="space-y-4 text-left">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-brand-primary/60 dark:text-white/70 tracking-wider">
                {strings.choose_new_pin_label}
              </label>
              <PasswordInput
                id="force-new-pin"
                required
                maxLength={6}
                placeholder={strings.x_enter_6digit_pin}
                value={forceNewPin}
                onChange={(e) => setForceNewPin(e.target.value)}
                className="w-full text-xs p-3 rounded-xl border border-brand-secondary dark:border-white/20 focus:outline-[#7C4DCC] focus:ring-1 focus:ring-brand-primary bg-white dark:bg-[#191136] text-brand-primary dark:text-white font-bold font-numeric placeholder:text-brand-primary/30 dark:placeholder:text-white/30"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-brand-primary/60 dark:text-white/70 tracking-wider">
                {strings.confirm_new_pin_label}
              </label>
              <PasswordInput
                id="force-confirm-pin"
                required
                maxLength={6}
                placeholder={strings.x_confirm_6digit_pin}
                value={forceConfirmPin}
                onChange={(e) => setForceConfirmPin(e.target.value)}
                className="w-full text-xs p-3 rounded-xl border border-brand-secondary dark:border-white/20 focus:outline-[#7C4DCC] focus:ring-1 focus:ring-brand-primary bg-white dark:bg-[#191136] text-brand-primary dark:text-white font-bold font-numeric placeholder:text-brand-primary/30 dark:placeholder:text-white/30"
              />
            </div>

            <button
              id="force-pin-submit"
              type="submit"
              className="w-full py-3.5 bg-[#4B2D7F] hover:bg-[#7C4DCC] text-white text-xs font-bold rounded-2xl cursor-pointer shadow-lg transition-all active:scale-[0.99] uppercase tracking-wider block text-center"
            >
              {strings.verify_activate_pin_btn}
            </button>
          </form>

          {/* Secure indicator label */}
          <div className="w-max mx-auto text-[9px] font-mono text-[#7C4DCC] dark:text-[#a07be3] font-bold bg-[#F3EEF9] dark:bg-[#1E193C] px-3 py-1.5 rounded-full flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-emerald-500" /> {strings.e2e_ledger_secured}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#F3EEF9]">
      {/* No-App-Access Client Deposit Receipt Modal */}
      {noAppAccessReceipt && (
        <div className="fixed inset-0 bg-[#150B2E]/65 backdrop-blur-md z-50 flex items-center justify-center p-6 animate-fade-in">
          <div className="glass-ui-card rounded-3xl w-full max-w-sm p-6 overflow-hidden shadow-2xl space-y-6 text-brand-primary animate-scale-up border bg-white border-brand-secondary/35 text-center">
            <div className="flex justify-between items-center border-b border-brand-secondary/15 pb-3">
              <h3 className="font-display font-extrabold text-sm text-brand-primary">
                Collection Receipt
              </h3>
              <button
                onClick={() => setNoAppAccessReceipt(null)}
                className="text-brand-accent font-bold text-[10px] border rounded-full px-2.5 py-1 cursor-pointer uppercase tracking-wider hover:bg-brand-secondary/10 transition-colors"
              >
                Close
              </button>
            </div>

            <div className="flex flex-col items-center space-y-2 py-2">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-2 shadow-inner">
                <CheckCircle className="w-7 h-7" />
              </div>
              <span className="text-[10px] text-emerald-600 font-extrabold uppercase tracking-widest font-mono">
                Payment Collected
              </span>
              <div className="font-display font-black text-2xl text-brand-primary tracking-tight font-numeric">
                {noAppAccessReceipt.amount.toLocaleString()} <span className="text-xs font-semibold text-brand-primary/60">FCFA</span>
              </div>
            </div>

            <div className="p-4 bg-brand-surface/40 rounded-2xl text-left space-y-3 font-semibold text-brand-primary/90 text-xs border border-brand-secondary/10">
              <div className="grid grid-cols-2 gap-y-3 gap-x-1.5">
                <div>
                  <span className="text-[9px] text-brand-primary/50 block font-bold uppercase tracking-wider">Client Name</span>
                  <span className="text-brand-primary">{noAppAccessReceipt.clientName}</span>
                </div>
                <div>
                  <span className="text-[9px] text-brand-primary/50 block font-bold uppercase tracking-wider">Client ID</span>
                  <span className="font-mono text-brand-primary">{noAppAccessReceipt.clientDisplayId}</span>
                </div>
                <div>
                  <span className="text-[9px] text-brand-primary/50 block font-bold uppercase tracking-wider">Date & Time</span>
                  <span className="text-brand-primary/80">{noAppAccessReceipt.date}</span>
                </div>
                <div>
                  <span className="text-[9px] text-brand-primary/50 block font-bold uppercase tracking-wider">Collected By</span>
                  <span className="text-brand-primary/80">{noAppAccessReceipt.agentName}</span>
                </div>
              </div>
              <div className="pt-2 border-t border-brand-secondary/10 flex justify-between items-center">
                <span className="text-[9px] text-brand-primary/50 font-bold uppercase tracking-wider">Branch</span>
                <span className="text-xs font-bold text-brand-primary">{noAppAccessReceipt.branchName}</span>
              </div>
            </div>

            <div className="text-[9px] text-brand-primary/50 italic leading-relaxed px-4">
              "This transaction has been logged on the ledger and SMS receipt sent to client."
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Agent Client Registration Credentials Modal */}
      {showClientCredentialsModal && createdClientCredentials && (
        <div className="fixed inset-0 bg-[#150B2E]/65 backdrop-blur-md z-50 flex items-center justify-center p-6 animate-fade-in">
          <div className="glass-ui-card rounded-3xl w-full max-w-sm p-6 overflow-hidden shadow-2xl space-y-6 text-brand-primary animate-scale-up border bg-white border-brand-secondary/35">
            <div className="flex justify-between items-start">
              <h3 className="font-display font-extrabold text-sm text-brand-primary">
                {strings.cred_client_registration_title || "Client Registration Credentials"}
              </h3>
              <button
                onClick={() => {
                  setShowClientCredentialsModal(false);
                  setCreatedClientCredentials(null);
                  setCopiedField(null);
                }}
                className="text-brand-accent font-bold text-[10px] border rounded-full px-2 py-0.5 cursor-pointer uppercase tracking-wider hover:bg-brand-secondary/10 transition-colors"
              >
                {strings.close_label || "Close"}
              </button>
            </div>

            <div className="space-y-4 font-sans text-xs">
              <div className="p-3.5 bg-brand-surface/40 rounded-xl space-y-3 font-semibold text-brand-primary/90">
                <div>
                  <span className="text-[9px] text-brand-primary/50 block font-bold uppercase tracking-wider">{strings.x_client_unique_application_id}</span>
                  <span className="font-mono text-xs font-black">{createdClientCredentials.profile.unique_display_id}</span>
                </div>
                <div>
                  <span className="text-[9px] text-brand-primary/50 block font-bold uppercase tracking-wider">{strings.x_client_display_name_2}</span>
                  <span>{createdClientCredentials.profile.full_name}</span>
                </div>
                <div>
                  <span className="text-[9px] text-brand-primary/50 block font-bold uppercase tracking-wider">{strings.x_referred_by}</span>
                  <span>{profile.full_name}</span>
                </div>
                <div className="flex justify-between items-end">
                  <div>
                    <span className="text-[9px] text-brand-primary/50 block font-bold uppercase tracking-wider">{strings.x_phone_registered || "PHONE REGISTERED"}</span>
                    <span className="font-mono">{createdClientCredentials.profile.phone}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(createdClientCredentials.profile.phone);
                      setCopiedField("phone");
                      setTimeout(() => setCopiedField(null), 2000);
                    }}
                    className="p-1 hover:bg-brand-secondary/20 rounded-lg cursor-pointer transition-all"
                    title={strings.cred_copy_pin_tooltip || "Copy"}
                  >
                    {copiedField === "phone" ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500 animate-scale-up" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-brand-primary/60" />
                    )}
                  </button>
                </div>
                {createdClientCredentials.profile.account_number && (
                  <div className="flex justify-between items-end pt-1 border-t border-brand-secondary/10">
                    <div>
                      <span className="text-[9px] text-brand-primary/50 block font-bold uppercase tracking-wider">{strings.account_number || "ACCOUNT NUMBER"}</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 select-all">{createdClientCredentials.profile.account_number}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(createdClientCredentials.profile.account_number || "");
                        setCopiedField("acc");
                        setTimeout(() => setCopiedField(null), 2000);
                      }}
                      className="p-1 hover:bg-brand-secondary/20 rounded-lg cursor-pointer transition-all"
                      title="Copy Account Number"
                    >
                      {copiedField === "acc" ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500 animate-scale-up" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-brand-primary/60" />
                      )}
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-500 rounded-2xl p-4 text-center space-y-2.5">
                <span className="text-[10px] font-black uppercase tracking-wide block">{strings.current_temp_pin_label || "TEMPORARY SIGN-IN PIN"}</span>
                <div className="relative flex items-center justify-center bg-white py-2.5 rounded-xl border border-amber-500/15">
                  <span className="text-2xl font-mono font-black tracking-widest text-[#FF8A00] drop-shadow-xs">
                    {createdClientCredentials.tempPin}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(createdClientCredentials.tempPin);
                      setCopiedField("pin");
                      setTimeout(() => setCopiedField(null), 2000);
                    }}
                    className="absolute right-3 p-1 hover:bg-brand-secondary/20 rounded-lg cursor-pointer transition-all"
                    title={strings.cred_copy_pin_tooltip || "Copy"}
                  >
                    {copiedField === "pin" ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500 animate-scale-up" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-[#FF8A00]/80" />
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-brand-primary/60 font-medium leading-normal">
                  {strings.cred_client_registration_desc || "Provide this temporary PIN to the client. Upon first login, the application will require them to replace it with a secure personal PIN."}
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const accNum = createdClientCredentials.profile.account_number;
                    const accLine = accNum ? `Account Number: ${accNum}\n` : "";
                    const dataToCopy = `${strings.x_phone_registered || "PHONE REGISTERED"}\n${createdClientCredentials.profile.phone}\n${strings.current_temp_pin_label || "TEMPORARY SIGN-IN PIN"}\n${createdClientCredentials.tempPin}\n${accLine}`.trim();
                    navigator.clipboard.writeText(dataToCopy);
                    setCopiedField("both");
                    setTimeout(() => setCopiedField(null), 2500);
                  }}
                  className={`py-2 px-3 rounded-xl border border-dashed transition-all cursor-pointer text-center text-[10px] font-bold flex items-center justify-center gap-1.5 ${
                    copiedField === "both"
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                      : "bg-[#1c0f38] border-[#4B2D7F]/40 text-[#c8b8e8] hover:bg-[#1c0f38]/80 hover:text-white"
                  }`}
                >
                  {copiedField === "both" ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      {strings.cred_copied_both_success || "Copied Phone & PIN Successfully!"}
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      {strings.cred_copy_both_btn || "Copy Both Credentials together"}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Campay USSD Transaction Polling Overlay */}
      {campayPolling && (
        <div className="fixed inset-0 bg-[#150B2E]/65 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6 text-white text-center animate-fade-in">
          {campayResultState === "polling" && (
            <div className="bg-white/15 dark:bg-black/40 backdrop-blur-2xl border border-white/20 p-8 rounded-3xl max-w-sm w-full space-y-6 shadow-2xl relative">
              {/* Close Overlay Button (Dismiss only, does not cancel background polling) */}
              <button
                onClick={() => setCampayPolling(false)}
                className="absolute top-4 right-4 text-white/60 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition-colors cursor-pointer"
                title="Dismiss Overlay"
                aria-label="Dismiss Overlay"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Glowing Ring Animation */}
              <div className="relative w-20 h-20 mx-auto">
                <div className="absolute inset-0 rounded-full border-4 border-white/10"></div>
                <div className="absolute inset-0 rounded-full border-4 border-brand-accent border-t-transparent animate-spin"></div>
                <div className="absolute inset-2 bg-brand-primary/40 rounded-full flex items-center justify-center font-mono font-extrabold text-sm">
                  {campayTimer}s
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-display font-black text-lg tracking-tight">
                  Awaiting USSD PIN Sign...
                </h3>
                <p className="text-xs text-white/80 leading-relaxed font-sans">
                  Initiated secure push coupon of{" "}
                  <strong className="text-brand-accent font-numeric">
                    {campayTxAmount.toLocaleString()}{" "}
                    FCFA
                  </strong>{" "}
                  to{" "}
                  <strong className="font-numeric">
                    {clientDepPhone || agentCampayPhone || profile.phone}
                  </strong>{" "}
                  via Mobile Money.
                </p>
              </div>

              {/* Status Banner */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-[10px] uppercase font-bold tracking-wider text-brand-accent animate-pulse">
                {campayStatusText}
              </div>

              {/* Dial-code Approval Hints */}
              <div className="text-[11px] bg-white/10 dark:bg-black/20 p-2.5 rounded-xl border border-white/10 space-y-1 text-left font-sans text-white/90">
                <p className="font-bold text-center text-[10px] text-brand-accent uppercase tracking-wider">Dial Codes to Approve:</p>
                {(!campayTxMethod || campayTxMethod === "campay") ? (
                  <div className="flex justify-around text-[10px] font-mono">
                    <span>Orange: <strong className="text-brand-accent font-bold">#150*50#</strong></span>
                    <span>MTN: <strong className="text-brand-accent font-bold">*126#</strong></span>
                  </div>
                ) : campayTxMethod === "orange" ? (
                  <p className="text-center text-[10px] font-mono">
                    Dial <strong className="text-brand-accent font-bold">#150*50#</strong> on your handset to approve if prompt doesn't appear.
                  </p>
                ) : (
                  <p className="text-center text-[10px] font-mono">
                    Dial <strong className="text-brand-accent font-bold">*126#</strong> on your handset to approve if prompt doesn't appear.
                  </p>
                )}
              </div>

              <p className="text-[10px] text-white/50 leading-normal">
                Please enter your Mobile Money PIN on your physical phone relative
                screen popup to instantly authorize this cooperative deposit
                transaction!
              </p>

              {/* Confirm & Authorize Simulated Button (Dev-only) */}
              {isDev && (
                <button
                  onClick={async () => {
                    setCampayStatusText(
                      strings.campay_sim_scanning,
                    );
                    try {
                      const res = await fetch(
                        `/api/campay/authorize/${campayTxRef}`,
                        {
                          method: "POST",
                        },
                      );
                      if (res.ok) {
                        setCampayStatusText(
                          strings.campay_sim_success,
                        );
                      } else {
                        setCampayStatusText(
                          strings.campay_sim_complete,
                        );
                      }
                    } catch (e) {
                      if (isDev) {
                        console.warn("Error verifying simulation:", e);
                      }
                    }
                  }}
                  className="w-full py-2.5 bg-[#4C1D95] hover:bg-[#3B1374] text-white text-[10px] font-bold uppercase tracking-wider rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1 shadow-md"
                >
                  <Check className="w-4 h-4" /> Confirm & Authorize PIN (Simulate USSD)
                </button>
              )}

              {/* Cancel Button */}
              <button
                onClick={async () => {
                  /* This is a user-facing convenience — it stops showing the waiting screen but does not cancel the underlying mobile money transaction, because once a USSD push has gone to FuturaPay, the platform cannot force-cancel the client's mobile money side. Background reconciliation (see server.ts reconciliation sweep) continues checking this reference; if FuturaPay later reports success, the transaction is confirmed regardless of this click. */
                  if (campayTxRef) {
                    setLocallyCancelledRefs((prev) => [...prev, campayTxRef]);
                  }
                  setCampayPolling(false);
                }}
                className="w-full py-2 bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold uppercase tracking-wider rounded-xl cursor-pointer transition-all border border-white/20 shadow-md"
              >
                Cancel Payment
              </button>
            </div>
          )}

          {campayResultState === "success" && (
            <div className="bg-white/15 dark:bg-black/40 backdrop-blur-2xl border border-white/20 p-8 rounded-3xl max-w-sm w-full space-y-6 shadow-2xl relative text-center overflow-hidden">
              <Confetti />
              
              {/* Close Button */}
              <button
                onClick={dismissCampayOverlay}
                className="absolute top-4 right-4 text-white/60 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition-colors cursor-pointer z-20"
              >
                <X className="w-4 h-4" />
              </button>
              
              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto shadow-inner animate-bounce z-20 relative">
                <CheckCircle className="w-8 h-8" />
              </div>
              
              <div className="space-y-2 z-20 relative">
                <h3 className="font-display font-black text-lg tracking-tight text-white">
                  Deposit Successful!
                </h3>
                <p className="text-xs text-white/80 leading-relaxed font-sans">
                  Funds of <strong className="text-emerald-400 font-numeric">{campayTxAmount.toLocaleString()} FCFA</strong> have been credited to the account successfully.
                </p>
              </div>
              
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3 text-[10px] uppercase font-bold tracking-wider text-emerald-400 animate-pulse z-20 relative">
                Account Credited Successfully
              </div>

              <button
                onClick={dismissCampayOverlay}
                className="w-full py-2.5 bg-white text-[#4b2d7f] font-bold uppercase tracking-wider text-[10px] rounded-xl cursor-pointer hover:bg-white/90 transition-all shadow-md z-20 relative"
              >
                Done
              </button>
            </div>
          )}

          {(campayResultState === "failed" || campayResultState === "expired") && (() => {
            const code = classifiedError?.code || (campayResultState === "expired" ? "GATEWAY_TIMEOUT" : "UNKNOWN");
            const isWarning = code === "BELOW_MINIMUM" || code === "INSUFFICIENT_BALANCE";
            const isTimeout = code === "GATEWAY_TIMEOUT";
            
            let colorClasses = "bg-red-500/20 text-red-400 border border-red-500/30";
            let Icon = <XCircle className="w-8 h-8" />;
            if (isWarning) {
              colorClasses = "bg-amber-500/20 text-amber-400 border border-amber-500/30";
              Icon = <AlertTriangle className="w-8 h-8" />;
            } else if (isTimeout) {
              colorClasses = "bg-blue-500/20 text-blue-400 border border-blue-500/30";
              Icon = <Clock className="w-8 h-8" />;
            }

            return (
              <div className="bg-white/15 dark:bg-black/40 backdrop-blur-2xl border border-white/20 p-8 rounded-3xl max-w-sm w-full space-y-6 shadow-2xl relative text-center">
                {/* Close Button */}
                <button
                  onClick={dismissCampayOverlay}
                  className="absolute top-4 right-4 text-white/60 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
                
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto shadow-inner animate-bounce ${colorClasses}`}>
                  {Icon}
                </div>
                
                <div className="space-y-2">
                  <h3 className="font-display font-black text-lg tracking-tight text-white">
                    {classifiedError?.title || (campayResultState === "expired" ? "Transaction Expired" : "Deposit Failed")}
                  </h3>
                  <p className="text-xs text-white/80 leading-relaxed font-sans">
                    {classifiedError?.message || (campayResultState === "expired" 
                      ? "The mobile money prompt timed out before confirmation. Please check your handset or transaction history shortly."
                      : "The USSD payment push was rejected or failed. Please verify your PIN, confirm you have sufficient funds, and try again.")}
                  </p>
                </div>
                
                <div className="text-[11px] bg-white/10 dark:bg-black/20 p-2.5 rounded-xl border border-white/10 space-y-1 text-left font-sans text-white/90">
                  <p className="font-bold text-center text-[10px] text-brand-accent uppercase tracking-wider">Troubleshooting Dial Codes:</p>
                  <ul className="list-disc pl-4 space-y-1 text-[10px] text-white/80 font-mono">
                    <li>Orange Cameroon: <strong className="text-brand-accent font-bold">#150*50#</strong></li>
                    <li>MTN Cameroon: <strong className="text-brand-accent font-bold">*126#</strong></li>
                  </ul>
                </div>

                <button
                  onClick={dismissCampayOverlay}
                  className="w-full py-2.5 bg-white text-[#4b2d7f] font-bold uppercase tracking-wider text-[10px] rounded-xl cursor-pointer hover:bg-white/90 transition-all shadow-md"
                >
                  Close & Retry
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* Banner Notifications */}
      {simulatedSms && (
        <div className="fixed top-4 left-4 right-4 bg-slate-900 text-white p-4 rounded-xl shadow-2xl flex flex-col gap-2 z-50 border border-slate-700 font-sans">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 text-[9px] text-slate-400 font-bold tracking-wider">
            <div className="flex items-center gap-1.5">
              <span className="p-1 bg-violet-600 rounded text-[7px] text-white uppercase tracking-normal">
                SMS SIMULATION
              </span>
              <span>{strings.x_cellular_network_carrier}</span>
            </div>
            <span>{strings.x_just_now}</span>
          </div>
          <div className="text-xs space-y-1">
            <div className="font-numeric">
              <span className="text-slate-400">{strings.x_to}</span>{" "}
              <span className="font-bold">{simulatedSms.to}</span>
            </div>
            <div className="text-emerald-400 bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-[10px] leading-relaxed break-words">
              {simulatedSms.body}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSimulatedSms(null)}
            className="w-full mt-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[9px] font-bold uppercase tracking-wider cursor-pointer active:scale-95 transition-all text-center"
          >
            Acknowledge & Dismiss Message
          </button>
        </div>
      )}
      {successBanner && (
        <div className="fixed top-4 left-4 right-4 bg-[#1A7A4A] text-white py-3 px-4 rounded-xl shadow-lg flex items-center gap-2 z-50 animate-bounce">
          <CheckCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm font-medium">{successBanner}</span>
        </div>
      )}
      {errorBanner && (
        <div className="fixed top-4 left-4 right-4 bg-[#B42318] text-white py-3 px-4 rounded-xl shadow-lg flex items-center gap-2 z-50">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span className="text-sm font-medium">{errorBanner}</span>
        </div>
      )}

      {/* Top Header Row for Brand Integrity */}
      <header className="sticky top-0 bg-brand-primary/80 dark:bg-[#150B2E]/80 backdrop-blur-md text-white p-4 shadow-md flex justify-between items-center z-40 rounded-b-2xl border-b border-brand-secondary/15">
        <div className="flex items-center gap-3">
          <img
            src="/branding/logo.svg"
            alt={strings.x_ngaccul_alt}
            className="w-10 h-10 border-2 border-brand-secondary rounded-full bg-white"
            referrerPolicy="no-referrer"
          />
          <div>
            <h1 className="font-display font-extrabold text-white text-base tracking-tight leading-none">
              NGACCUL
            </h1>
            <span className="text-[10px] text-brand-secondary/90 font-medium tracking-wider">
              {STATIC_BRANCHES.find((b) => b.id === profile.branch_id)?.name} -{" "}
              {profile.subdivision}
            </span>
          </div>
        </div>

        {/* Right actions: Wifi, Notifications, Logout */}
        <div className="flex items-center gap-3">
          {isOffline ? (
            <span title={strings.offline_label}>
              <WifiOff className="w-5 h-5 text-brand-accent animate-pulse" />
            </span>
          ) : (
            <span title={strings.x_online}>
              <Wifi className="w-5 h-5 text-emerald-400" />
            </span>
          )}

          {syncQueueCount > 0 && (
            <button
              onClick={handleSyncAction}
              className="bg-brand-accent hover:bg-brand-secondary/20 text-white text-[10px] font-bold py-1 px-2 rounded-full flex items-center gap-1 cursor-pointer"
            >
              <span>{syncQueueCount} Sync</span>
            </button>
          )}

          {/* Notification Bell with never-cleared Feed */}
          <button
            id="top-notification-bell"
            onClick={() => setShowNotifications((prev) => !prev)}
            className={`relative p-1.5 rounded-lg cursor-pointer transition-all ${
              notifications.filter((n) => !n.is_read).length > 0
                ? "bg-red-600 border border-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                : "hover:bg-brand-accent/20"
            }`}
          >
            <Bell className={`w-5 h-5 text-white ${notifications.filter((n) => !n.is_read).length > 0 ? "animate-bell-ring" : ""}`} />
            {notifications.filter((n) => !n.is_read).length > 0 && (
              <span className="absolute -top-1 -right-1 bg-brand-accent text-white text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-md">
                {notifications.filter((n) => !n.is_read).length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Persistent Notification Feed overlay container */}
      {showNotifications && (
        <NotificationCenter
          user={profile}
          notifications={[
            ...dbService.getNotifications(profile),
            ...dbService.getArchivedNotifications(profile)
          ]}
          archivedNotifIds={archivedNotifIds}
          strings={strings}
          onMarkNotificationRead={async (id) => {
            await dbService.markNotificationAsRead(id);
            setNotifications(dbService.getNotifications(profile));
          }}
          onMarkAllRead={async () => {
            const unread = notifications.filter((n) => !n.is_read);
            await Promise.all(unread.map((n) => dbService.markNotificationAsRead(n.id)));
            setNotifications(dbService.getNotifications(profile));
          }}
          onArchiveNotifications={archiveNotifications}
          onRestoreNotifications={restoreNotifications}
          onNotificationClick={(n) => {
            setSelectedNotification(n);
            setShowNotifications(false);
            const tx = transactions.find((t) => t.id === n.reference_id);
            if (tx) {
              setSelectedTx(tx);
            }
            const loan = loans.find((l) => l.id === n.reference_id);
            if (loan) {
              setSelectedLoan(loan);
            }
          }}
          onClose={() => setShowNotifications(false)}
          isMobile={true}
        />
      )}

      {/* main view stage */}
      <main className="flex-1 p-4 pb-24 overflow-y-auto space-y-6">
        {/* Dynamic trilingual slogan banner matches login branding */}
        <section className="bg-gradient-to-r from-brand-primary to-brand-accent rounded-2xl p-4 text-white dark:text-[#0e071a] space-y-1.5 shadow-md">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-secondary dark:text-[#0e071a]/80">
            NGACCUL Core Values
          </p>
          <blockquote className="text-sm font-display font-bold italic">
            &ldquo;{strings.slogan}&rdquo;
          </blockquote>
        </section>

        {/* tabs view logic */}
        {activeTab === "home" && (
          <div className="space-y-6 animate-fade-in">
            {(profile.role === "client" || profile.role === "agent") && (
              <DashboardHeader
                fullName={profile.full_name}
                language={language}
                strings={strings}
                subtitleKey={profile.role === "agent" ? "agent_console_subtitle" : "client_console_subtitle"}
                subdivisionName={STATIC_BRANCHES.find((b) => b.id === profile.branch_id)?.name}
              />
            )}

            {/* SAVINGS CARD FOR CLIENTS & AGENTS */}
            {(profile.role === "client" || profile.role === "agent") && (
              <div className="space-y-3">
                <LiquidSavingsCard
                  balance={myBalance ? myBalance.balance : 0}
                  pendingWithdrawals={transactions
                    .filter(
                      (t) => t.type === "withdrawal" && t.status === "pending",
                    )
                    .reduce((sum, t) => sum + Number(t.amount), 0)}
                  joinedAt={profile.joined_at}
                  displayId={profile.unique_display_id}
                  strings={strings}
                />
                
                {/* Agent Personal Savings Action Bar */}
                {profile.role === "agent" && (
                  <div className="flex gap-3 justify-center">
                    <div className="relative group/tooltip flex-1">
                      <button
                        id="btn-agent-personal-deposit"
                        disabled={selfDepositLockSettings.agent_locked}
                        onClick={() => {
                          if (selfDepositLockSettings.agent_locked) return;
                          setDepClientId(profile.id);
                          setActiveTab("deposit");
                        }}
                        className={`w-full py-2 px-4 text-xs font-black rounded-xl transition-all shadow-sm text-center ${
                          selfDepositLockSettings.agent_locked
                            ? "bg-brand-primary/20 text-brand-primary/40 cursor-not-allowed"
                            : "bg-brand-primary text-white hover:bg-brand-primary/90 cursor-pointer"
                        }`}
                      >
                        {selfDepositLockSettings.agent_locked ? <Lock className="w-3.5 h-3.5 inline mr-1" /> : null}
                        Self-Deposit
                      </button>
                      {selfDepositLockSettings.agent_locked && (
                        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2.5 pointer-events-none opacity-0 group-hover/tooltip:opacity-100 transition-all duration-300 translate-y-1 group-hover/tooltip:translate-y-0 z-50 w-48 text-center">
                          <div className="bg-amber-500/20 backdrop-blur-lg border border-amber-300/40 text-amber-950 dark:text-amber-50 text-[11px] px-3 py-2 rounded-xl shadow-xl whitespace-normal break-words leading-snug font-semibold">
                            {strings.self_deposit_locked_notice || "This feature will be available soon."}
                          </div>
                          <div className="w-1.5 h-1.5 bg-amber-400/30 border-r border-b border-amber-300/40 rotate-45 mx-auto -mt-1" />
                        </div>
                      )}
                    </div>
                    <button
                      id="btn-agent-personal-withdraw"
                      onClick={() => {
                        setWithdrawSubTab("withdrawing");
                        setActiveTab("withdraw");
                      }}
                      className="flex-1 py-2 px-4 bg-white border border-brand-secondary/30 text-brand-primary text-xs font-black rounded-xl hover:bg-brand-surface transition-all cursor-pointer shadow-sm text-center"
                    >
                      Request Withdrawal
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* AGENT PORTFOLIO SUMMARY */}
            {profile.role === "agent" && (
              <div className="rounded-3xl border border-brand-secondary/35 p-6 shadow-md grid grid-cols-2 gap-4 hero-gradient-mesh-quiet glass-ui-card text-brand-primary hover-lift">
                <div className="space-y-1 relative z-10">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-brand-primary/60 dark:text-brand-primary/80 block">
                    {strings.total_clients_recruited}
                  </span>
                  <h4 className="text-3xl font-display font-black text-brand-primary">
                    {myClients.length}
                  </h4>
                  <p className="text-[10px] text-brand-primary/70">
                    Assigned Portfolio
                  </p>
                </div>

                <div className="space-y-1 border-l border-brand-secondary/20 pl-4 relative z-10">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-brand-primary/60 dark:text-brand-primary/80 block">
                    {strings.pending_payout}
                  </span>
                  <h4 className="text-2xl font-display font-black text-[#E8B649] font-numeric drop-shadow-sm">
                    {(accruedCommissions - payoutsTotal).toLocaleString()}{" "}
                    <span className="text-xs font-semibold text-brand-primary">
                      FCFA
                    </span>
                  </h4>
                  <p className="text-[10px] text-[#1A7A4A] dark:text-[#2ac075] font-semibold">
                    Accumulated: {accruedCommissions.toLocaleString()}
                  </p>
                </div>
              </div>
            )}

            {/* AGENT MARATHON BADGES */}
            {profile.role === "agent" && (() => {
              const myBadges = badgeAwards.filter((a) => a.agent_id === profile.id);
              if (myBadges.length === 0) return null;

              const heroCount = myBadges.filter((b) => b.tier === "hero").length;
              const eliteCount = myBadges.filter((b) => b.tier === "elite").length;

              return (
                <div className="bg-white rounded-3xl border border-brand-secondary/20 p-5 space-y-3 shadow-sm text-left">
                  <div className="flex items-center gap-2 pb-2 border-b border-brand-surface">
                    <Trophy className="w-5 h-5 text-amber-500 shrink-0 animate-bounce" />
                    <div>
                      <h4 className="font-display font-black text-xs uppercase tracking-wider text-[#a384d6]">
                        My Marathon Medals
                      </h4>
                      <p className="text-[9px] text-brand-primary/50 mt-0.5">
                        Real-time earned campaign badges credited to your ledger
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    {heroCount > 0 && (
                      <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-3 flex flex-col items-center justify-center text-center space-y-1">
                        <Trophy className="w-8 h-8 text-amber-500 drop-shadow-sm" />
                        <span className="text-[10px] font-black uppercase text-amber-600">Hero Medal</span>
                        <span className="text-[9px] font-mono font-bold bg-amber-500/10 text-amber-700 px-2 py-0.5 rounded-full">
                          Count: {heroCount}x
                        </span>
                      </div>
                    )}
                    {eliteCount > 0 && (
                      <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-3 flex flex-col items-center justify-center text-center space-y-1">
                        <Trophy className="w-8 h-8 text-cyan-500 drop-shadow-sm animate-pulse" />
                        <span className="text-[10px] font-black uppercase text-cyan-600">Elite Medal</span>
                        <span className="text-[9px] font-mono font-bold bg-cyan-500/10 text-cyan-700 px-2 py-0.5 rounded-full">
                          Count: {eliteCount}x
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* OUTSTANDING LOANS GRID MODULE */}
            {profile.role === "client" && loans.length > 0 && (
              <div className="bg-white rounded-2xl border border-brand-secondary/20 p-4 space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-brand-surface">
                  <span className="font-display font-bold text-xs text-brand-primary uppercase">
                    Active Loans
                  </span>
                  <span className="bg-brand-surface text-[#7C4DCC] text-[10px] font-bold px-2 py-0.5 rounded-full font-numeric">
                    {loans.length} Contract(s)
                  </span>
                </div>
                {loans.map((loan) => (
                  <div key={loan.id} className="space-y-1.5 p-3 bg-brand-surface/20 rounded-xl border border-brand-secondary/10 hover:bg-brand-surface/30 transition-all">
                    <div
                      onClick={() => setSelectedLoan(loan)}
                      className="flex justify-between items-center cursor-pointer"
                    >
                      <div>
                        <span className="text-xs font-bold text-brand-primary">
                          {loan.purpose.slice(0, 30)}...
                        </span>
                        <span className="text-[10px] text-brand-primary/60 block font-numeric">
                          Interest: {loan.interest_rate_pct}% | {loan.term_months}{" "}
                          Months
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-extrabold text-brand-primary font-numeric">
                          {loan.amount.toLocaleString()} FCFA
                        </span>
                        <span
                          className={`text-[9px] uppercase font-bold block ${loan.status === "active" ? "text-emerald-600" : "text-brand-accent"} ${loan.status === "approved" ? "text-amber-600 animate-pulse" : ""}`}
                        >
                          {loan.status}
                        </span>
                      </div>
                    </div>
                    {loan.status === "active" && !confirmedLoanIds.includes(loan.id) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleConfirmLoanReceipt(loan.id);
                        }}
                        className="w-full mt-2 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                      >
                        ✓ Confirm I Received My Loan
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* QUICK MOBILE ACTIONS CONTAINER */}
            <div className="space-y-3">
              <h3 className="font-display font-semibold text-xs uppercase tracking-wider text-brand-primary/60">
                Quick Tasks
              </h3>

              {profile.role === "client" ? (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    id="btn-tab-withdraw"
                    onClick={() => {
                      setActiveTab("withdraw");
                      setWithdrawSubTab("withdrawing");
                    }}
                    className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl border border-brand-secondary/20 hover:border-brand-primary/50 transition-all text-center gap-2 cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-full bg-brand-surface text-brand-primary flex items-center justify-center">
                      <ArrowDownToLine className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-brand-primary">
                      {strings.request_withdrawal}
                    </span>
                  </button>

                  <button
                    id="btn-tab-loan"
                    onClick={() => {
                      setActiveTab("withdraw");
                      setWithdrawSubTab("loaning");
                    }}
                    className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl border border-brand-secondary/20 hover:border-brand-primary/50 transition-all text-center gap-2 cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-full bg-brand-surface text-brand-accent flex items-center justify-center">
                      <CircleDollarSign className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-brand-primary">
                      {strings.request_loan}
                    </span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    id="btn-agent-deposit-tab"
                    onClick={() => setActiveTab("deposit")}
                    className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl border border-brand-secondary/20 hover:border-brand-primary/50 transition-all text-center gap-2 cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#EBF6ED] text-[#1A7A4A] flex items-center justify-center">
                      <ArrowDownToLine className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-brand-primary">
                      {strings.agent_deposit}
                    </span>
                  </button>

                  <button
                    id="btn-agent-register-tab"
                    onClick={() => setActiveTab("clients")}
                    className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl border border-brand-secondary/20 hover:border-brand-primary/50 transition-all text-center gap-2 cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-full bg-brand-surface text-brand-accent flex items-center justify-center">
                      <PlusCircle className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-brand-primary">
                      {strings.new_client_registration}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* MINI RECENT TRANSACTIONS FEED */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-display font-semibold text-xs uppercase tracking-wider text-brand-primary/60">
                  Recent Feed
                </h3>
                <button
                  onClick={() => setActiveTab("history")}
                  className="text-xs font-semibold text-brand-accent hover:underline cursor-pointer"
                >
                  View All
                </button>
              </div>

              <div className="space-y-3">
                {transactions.slice(0, 4).map((t) => {
                  const client = myClients.find((c) => c.id === t.client_id) || dbService.getProfiles(profile).find((p) => p.id === t.client_id);
                  const clientFirstName = client?.full_name ? client.full_name.trim().split(/\s+/)[0] : "";
                  return (
                    <div
                      id={`recent-tx-${t.id}`}
                      key={t.id}
                      onClick={() => setSelectedTx(t)}
                      className="flex items-center justify-between p-3 bg-white rounded-xl shadow-sm border border-brand-secondary/15 cursor-pointer hover:scale-[1.01] transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            t.type === "deposit"
                              ? "bg-[#EBF6ED] text-[#1A7A4A]"
                              : "bg-[#FDF2F2] text-[#B42318]"
                          }`}
                        >
                          <TrendingUp
                            className={`w-4 h-4 ${t.type !== "deposit" ? "rotate-180" : ""}`}
                          />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-brand-primary capitalize block">
                            {t.type} via{" "}
                            {t.payment_method === "mtn_momo" ||
                            t.payment_method === "mtn"
                              ? "MTN MoMo"
                              : t.payment_method === "orange_money" ||
                                  t.payment_method === "orange"
                                ? strings.orange_label
                                : t.payment_method === "express_union"
                                  ? "EU Mobile"
                                  : t.payment_method || "Cash"}
                          </span>
                          <span className="text-[9px] text-brand-primary/50 block font-numeric">
                            {new Date(t.created_at).toLocaleDateString()}{clientFirstName ? ` - ${clientFirstName}` : ""}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-extrabold text-brand-primary block font-numeric">
                          {t.type === "deposit" ? "+" : "-"}
                          {t.amount.toLocaleString()} FCFA
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider ${
                            t.status === "confirmed"
                              ? "bg-[#EBF6ED] text-[#1A7A4A]"
                              : (t.status === "pending" && !(t.payment_ref && locallyCancelledRefs.includes(t.payment_ref)))
                                ? "bg-[#FEF6EC] text-[#C97A10]"
                                : "bg-[#FDF2F2] text-[#B42318]"
                          }`}
                        >
                          {(t.status === "pending" && !(t.payment_ref && locallyCancelledRefs.includes(t.payment_ref))) && (
                            <Clock className="w-2 h-2 shrink-0 animate-spin" />
                          )}
                          {getStatusLabel(t.status, strings, t.payment_ref)}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {transactions.length === 0 && (
                  <p className="text-xs text-brand-primary/50 text-center py-6 bg-white rounded-2xl border border-brand-secondary/10">
                    {strings.no_records}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TRANSACTIONS & RECEIPT ARCHIVES TAB */}
        {activeTab === "history" && (
          <div className="space-y-4 animate-fade-in">
            <h2 className="font-display font-extrabold text-lg text-brand-primary">
              Transactions Archive Ledger
            </h2>

            <div className="space-y-3">
              {transactions.map((t) => {
                const client = myClients.find((c) => c.id === t.client_id) || dbService.getProfiles(profile).find((p) => p.id === t.client_id);
                const clientFirstName = client?.full_name ? client.full_name.trim().split(/\s+/)[0] : "";
                const queuedItem = dbService.syncQueue.find((q) => q.id === t.id);
                if (queuedItem && queuedItem.status !== "synced") {
                  return (
                    <div
                      key={t.id}
                      className="p-4 bg-amber-50/60 rounded-2xl border border-amber-300/40 flex flex-col gap-2 shadow-xs"
                    >
                      <div className="flex justify-between items-center">
                        <div className="space-y-1">
                          <span className="text-xs font-bold text-amber-800 capitalize flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                            {t.type} receipt (Offline)
                          </span>
                          <span className="text-[10px] text-amber-800/60 block font-mono">
                            #REF-{t.id.slice(0, 8).toUpperCase()} • {new Date(t.created_at).toLocaleDateString()}{clientFirstName ? ` - ${clientFirstName}` : ""}
                          </span>
                        </div>
                        <div className="text-right space-y-1">
                          <span className="text-xs font-extrabold text-amber-900 block font-numeric">
                            {t.amount.toLocaleString()} FCFA
                          </span>
                          <span className="text-[8px] uppercase tracking-wider font-extrabold px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full inline-block">
                            {queuedItem.status === "failed" ? "Sync Failed" : "Pending Sync"}
                          </span>
                        </div>
                      </div>
                      {queuedItem.status === "failed" && (
                        <div className="pt-1.5 border-t border-amber-200/40 flex flex-col gap-1.5">
                          <p className="text-[10px] text-red-600 font-medium text-left">
                            Reason: {queuedItem.error_message || "Server validation rejected item"}
                          </p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResetAndRetry(queuedItem.id);
                            }}
                            className="self-end px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[9px] font-bold rounded-lg uppercase tracking-wider transition-all cursor-pointer"
                          >
                            Retry Sync
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTx(t)}
                    className="p-4 bg-white rounded-2xl border border-brand-secondary/15 flex justify-between items-center shadow-sm cursor-pointer hover:border-brand-primary"
                  >
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-brand-primary capitalize flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${t.type === "deposit" ? "bg-[#1A7A4A]" : "bg-[#B42318]"}`}
                        />
                        {t.type} receipt
                      </span>
                      <span className="text-[10px] text-brand-primary/50 block font-mono select-all">
                        #REF-{t.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span className="text-[9px] text-brand-primary/50 block font-numeric">
                        {new Date(t.created_at).toLocaleDateString()}{clientFirstName ? ` - ${clientFirstName}` : ""}
                      </span>
                    </div>

                    <div className="text-right space-y-1">
                      <span className="text-xs font-extrabold text-brand-primary block font-numeric">
                        {t.amount.toLocaleString()} FCFA
                      </span>
                      <span
                        className={`text-[8px] uppercase tracking-wider font-extrabold block ${
                          t.status === "confirmed"
                            ? "text-[#1A7A4A]"
                            : (t.status === "pending" && !(t.payment_ref && locallyCancelledRefs.includes(t.payment_ref)))
                              ? "text-[#C97A10]"
                              : "text-[#B42318]"
                        }`}
                      >
                        {getStatusLabel(t.status, strings, t.payment_ref)}
                      </span>
                    </div>
                  </div>
                );
              })}
              {transactions.length === 0 && (
                <p className="text-xs text-brand-primary/50 text-center py-10 bg-white rounded-2xl border border-brand-secondary/10">
                  {strings.no_records}
                </p>
              )}
            </div>
          </div>
        )}

        {/* WITHDRAWAL & LOAN APPLICATIONS SHEETS */}
        {activeTab === "withdraw" && (
          <div className="space-y-6 animate-fade-in">
            {/* SUB-TAB TOGGLE */}
            <div className="flex bg-brand-surface/60 p-1.5 rounded-2xl border border-brand-secondary/25 max-w-md mx-auto w-full">
              <button
                id="btn-subtab-withdraw"
                type="button"
                onClick={() => {
                  setWithdrawSubTab("withdrawing");
                  setLoanPhase(1);
                  setSubdivisionChecked(false);
                  setTermsChecked(false);
                }}
                className={`flex-1 py-2.5 px-4 text-xs font-black rounded-xl transition-all cursor-pointer text-center ${
                  withdrawSubTab === "withdrawing"
                    ? "bg-brand-primary text-white shadow-md"
                    : "text-brand-primary/70 hover:text-brand-primary hover:bg-brand-surface/45"
                }`}
              >
                {strings.withdraw_savings_label || "Withdraw Savings"}
              </button>
              <button
                id="btn-subtab-loan"
                type="button"
                onClick={() => {
                  setWithdrawSubTab("loaning");
                  setLoanPhase(1);
                  setSubdivisionChecked(false);
                  setTermsChecked(false);
                }}
                className={`flex-1 py-2.5 px-4 text-xs font-black rounded-xl transition-all cursor-pointer text-center ${
                  withdrawSubTab === "loaning"
                    ? "bg-brand-primary text-white shadow-md"
                    : "text-brand-primary/70 hover:text-brand-primary hover:bg-brand-surface/45"
                }`}
              >
                {strings.apply_cooperative_loan_label || "Apply for Cooperative Loan"}
              </button>
            </div>

            {withdrawSubTab === "withdrawing" && (
              /* SAVINGS REDEMPTION FORM */
              <div className="bg-white rounded-3xl p-6 border border-brand-secondary/25 shadow-sm space-y-4">
                <h2 className="font-display font-extrabold text-base text-brand-primary flex items-center gap-2">
                  <ArrowDownToLine className="w-5 h-5 text-brand-accent" />
                  {strings.withdraw_modal_title}
                </h2>
                <p className="text-xs text-brand-primary/70">
                  {strings.withdrawal_limit_notice}
                </p>

                {!isBusinessHours && (
                  <div className="space-y-3">
                    <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-amber-800 text-xs font-semibold flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-bold">{strings.x_operational_hours_restriction}</p>
                        <p className="font-normal text-[11px] mt-0.5 text-amber-700">{businessHoursMessage}</p>
                        <button
                          type="button"
                          onClick={() => setShowAppealForm(showAppealForm === 'withdrawal' ? null : 'withdrawal')}
                          className="mt-2 text-brand-accent font-black text-[11px] underline block cursor-pointer uppercase text-left"
                        >
                          {showAppealForm === 'withdrawal' ? "Close Appeal Panel" : "Request Emergency Lockout Bypass"}
                        </button>
                      </div>
                    </div>

                    {showAppealForm === 'withdrawal' && (
                      <div className="p-4 bg-brand-surface/40 rounded-2xl border border-brand-secondary/20 space-y-3">
                        <h4 className="font-bold text-xs text-brand-primary">Emergency Withdrawal Lockout Bypass</h4>
                        <div className="space-y-2 text-xs text-brand-primary">
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold opacity-60 block">Estimated Amount (FCFA)</label>
                            <input
                              type="number"
                              placeholder="e.g. 50000"
                              value={appealAmount}
                              onChange={(e) => setAppealAmount(e.target.value)}
                              className="w-full bg-white border border-brand-secondary/20 rounded-xl px-3 py-2 focus:outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold opacity-60 block">Emergency Bypass Justification *</label>
                            <textarea
                              placeholder="Please explain why you need to withdraw funds outside of regular business hours..."
                              rows={3}
                              value={appealReason}
                              onChange={(e) => setAppealReason(e.target.value)}
                              className="w-full bg-white border border-brand-secondary/20 rounded-xl px-3 py-2 focus:outline-none"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAppealSubmit('withdrawal')}
                            className="w-full py-2 bg-brand-accent hover:bg-brand-accent/90 text-white font-extrabold text-[11px] uppercase tracking-wider rounded-xl cursor-pointer"
                          >
                            Submit Lockout Bypass Appeal
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <form
                  onSubmit={handleWithdrawalRequestSubmit}
                  className="space-y-4 pt-2"
                >
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-brand-primary/80">
                      {strings.withdrawal_amount_label || "Withdrawal Amount (FCFA)"}
                    </label>
                    <input
                      id="input-withdraw-amount"
                      type="number"
                      required
                      placeholder={strings.x_enter_amount_eg_25000}
                      disabled={!isBusinessHours || otpSent}
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      className="w-full text-xs font-numeric p-3 rounded-xl border border-brand-secondary placeholder:text-brand-primary/40 focus:outline-none focus:ring-1 focus:ring-brand-primary text-brand-primary disabled:opacity-50"
                    />
                    {withdrawAmount && Number(withdrawAmount) > 0 && (
                      <div className="p-3 bg-brand-surface rounded-xl border border-brand-secondary/20 space-y-1 mt-2">
                        <div className="flex justify-between text-[11px] text-brand-primary/80">
                          <span>{strings.requested_amount_label || "Requested Amount:"}</span>
                          <span className="font-bold font-numeric">{Number(withdrawAmount).toLocaleString()} FCFA</span>
                        </div>
                        <div className="flex justify-between text-[11px] text-brand-primary/80">
                          <span>{strings.service_fee_label || "3% Service Fee (Round Half-Up):"}</span>
                          <span className="font-bold text-red-600 font-numeric">-{Math.round(Number(withdrawAmount) * 0.03).toLocaleString()} FCFA</span>
                        </div>
                        <div className="border-t border-brand-secondary/10 my-1 pt-1 flex justify-between text-xs font-extrabold text-brand-primary">
                          <span>{strings.net_payout_label || "You will receive (Net Payout):"}</span>
                          <span className="font-black text-brand-primary font-numeric">{(Number(withdrawAmount) - Math.round(Number(withdrawAmount) * 0.03)).toLocaleString()} FCFA</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      id="method-mtn"
                      type="button"
                      disabled={!isBusinessHours}
                      onClick={() => isBusinessHours && setWithdrawMethod("mtn")}
                      className={`p-3.5 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 text-center transition-all ${
                        !isBusinessHours
                          ? "opacity-50 cursor-not-allowed bg-brand-surface border-brand-secondary/20"
                          : "cursor-pointer animate-fade-in"
                      } ${
                        isBusinessHours && withdrawMethod === "mtn"
                          ? "bg-[#FFCC00] text-black border-[#FFCC00] ring-4 ring-brand-primary/10 shadow-md"
                          : "bg-white border-brand-secondary/20 text-brand-primary hover:bg-brand-surface/25"
                      }`}
                    >
                      {/* MTN MoMo Logo */}
                      <svg
                        viewBox="0 0 100 100"
                        className="w-10 h-10 shadow-xs rounded-full bg-[#FFCC00]"
                      >
                        <circle cx="50" cy="50" r="45" fill="#FFCC00" />
                        <ellipse
                          cx="50"
                          cy="50"
                          rx="35"
                          ry="22"
                          fill="none"
                          stroke="#032B5B"
                          strokeWidth="4"
                          max-width="100%"
                        />
                        <text
                          x="50"
                          y="58"
                          fontFamily="system-ui, -apple-system, sans-serif"
                          fontWeight="900"
                          fontSize="20"
                          fill="black"
                          textAnchor="middle"
                        >
                          MTN
                        </text>
                      </svg>
                      <span className="text-xs font-black tracking-tight">
                        MTN MoMo
                      </span>
                    </button>

                    <button
                      id="method-orange"
                      type="button"
                      disabled={!isBusinessHours}
                      onClick={() => isBusinessHours && setWithdrawMethod("orange")}
                      className={`p-3.5 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 text-center transition-all ${
                        !isBusinessHours
                          ? "opacity-50 cursor-not-allowed bg-brand-surface border-brand-secondary/20"
                          : "cursor-pointer animate-fade-in"
                      } ${
                        isBusinessHours && withdrawMethod === "orange"
                          ? "bg-[#FF6600] text-white border-[#FF6600] ring-4 ring-brand-primary/10 shadow-md"
                          : "bg-white border-brand-secondary/20 text-brand-primary hover:bg-brand-surface/25"
                      }`}
                    >
                      {/* Orange Money Logo */}
                      <svg
                        viewBox="0 0 100 100"
                        className="w-10 h-10 shadow-xs rounded-lg bg-[#FF6600]"
                      >
                        <rect width="100" height="100" fill="#FF6600" />
                        <text
                          x="50"
                          y="75"
                          fontFamily="system-ui, -apple-system, sans-serif"
                          fontWeight="900"
                          fontSize="24"
                          fill="white"
                          textAnchor="middle"
                        >
                          orange
                        </text>
                      </svg>
                      <span className="text-xs font-black tracking-tight">
                        {strings.orange_label || "Orange Money"}
                      </span>
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-brand-primary/80">
                      {strings.disbursement_phone_label || "Disbursement Mobile Phone"}
                    </label>
                    <input
                      id="input-withdraw-phone"
                      type="tel"
                      required
                      placeholder={strings.x_eg_677xxxxxx}
                      disabled={!isBusinessHours || otpSent}
                      value={withdrawPhone}
                      onChange={(e) =>
                        setWithdrawPhone(myPhoneCleanup(e.target.value))
                      }
                      className="w-full text-xs p-3 rounded-xl border border-brand-secondary placeholder:text-brand-primary/40 focus:outline-none focus:ring-1 focus:ring-brand-primary text-brand-primary disabled:opacity-50"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-brand-primary/80">
                      {strings.optional_remarks_label || "Optional Remarks"}
                    </label>
                    <input
                      id="input-withdraw-note"
                      type="text"
                      placeholder={strings.x_eg_travel_emergency_max_150_chars}
                      disabled={!isBusinessHours || otpSent}
                      maxLength={150}
                      value={withdrawNote}
                      onChange={(e) => setWithdrawNote(e.target.value)}
                      className="w-full text-xs p-3 rounded-xl border border-brand-secondary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:opacity-50"
                    />
                  </div>

                  {otpSent ? (
                    <div className="bg-brand-surface/50 p-4 rounded-xl border border-brand-secondary/35 space-y-3">
                      <span className="text-xs font-display font-semibold text-brand-primary">
                        {strings.withdrawal_otp_prompt}
                      </span>
                      <input
                        id="input-withdraw-otp"
                        type="text"
                        placeholder={strings.x_type_6digit_confirmation_code}
                        value={enteredOtp}
                        onChange={(e) => setEnteredOtp(e.target.value)}
                        className="w-full rounded-lg text-center p-2 font-mono text-base tracking-widest bg-white border border-brand-secondary text-brand-primary"
                      />
                      <button
                        id="btn-otp-validate"
                        type="button"
                        onClick={handleVerifyOtpThenSubmit}
                        className="w-full py-2 bg-brand-primary text-white text-xs font-bold rounded-lg cursor-pointer"
                      >
                        {strings.verify_confirm_disbursement_btn || "Verify & Confirm Disbursement"}
                      </button>
                    </div>
                  ) : (
                    <button
                      id="btn-withdraw-submit"
                      type="submit"
                      disabled={!isBusinessHours}
                      className={`w-full py-3 text-white text-xs font-bold rounded-xl transition-all uppercase tracking-wider ${!isBusinessHours ? "opacity-50 cursor-not-allowed bg-brand-primary" : "bg-brand-primary hover:bg-brand-accent cursor-pointer"}`}
                    >
                      {strings.schedule_cashout_btn || "Schedule savings cash-out"}
                    </button>
                  )}
                </form>
              </div>
            )}

            {withdrawSubTab === "loaning" && (
              /* LOAN REQUEST SHEET */
              <div className="bg-white rounded-3xl p-6 border border-brand-secondary/25 shadow-sm space-y-4">
                <h2 className="font-display font-extrabold text-base text-brand-primary flex items-center gap-2">
                  <CircleDollarSign className="w-5 h-5 text-brand-accent" />
                  Apply for Cooperative Loan
                </h2>
                <p className="text-[10px] text-brand-primary/60">
                  NGACCUL provides customized flat-interest dynamic credit portfolios for members up to {(loanConfig?.interest_rate_pct ?? 5.0).toFixed(1)}% flat rates.
                </p>

                {!isBusinessHours ? (
                  /* LOCK D: Outside business hours */
                  <div
                    id="business-hours-lock-status"
                    className="bg-amber-50 rounded-2xl border border-amber-200/50 p-5 text-center space-y-3"
                  >
                    <div className="mx-auto w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                      <Clock className="w-5 h-5 animate-pulse" />
                    </div>
                    <h3 className="text-xs font-bold text-amber-800 uppercase tracking-widest">
                      Operational Hours Restriction
                    </h3>
                    <p className="text-[10px] text-amber-700 leading-relaxed max-w-[280px] mx-auto font-medium">
                      {businessHoursMessage}
                    </p>
                  </div>
                ) : profile.is_active !== true || profile.force_password_change !== false ? (
                  /* LOCK A: Inactive / password change required */
                  <div
                    id="profile-inactive-lock-status"
                    className="bg-amber-50 rounded-2xl border border-amber-200/50 p-5 text-center space-y-3"
                  >
                    <div className="mx-auto w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                      <Lock className="w-5 h-5" />
                    </div>
                    <h3 className="text-xs font-bold text-amber-800 uppercase tracking-widest">
                      Profile Verification Required
                    </h3>
                    <p className="text-[10px] text-amber-700 leading-relaxed max-w-[280px] mx-auto font-medium">
                      Your profile must be active and have completed PIN modification updates. Please finalize details or contact system administrators.
                    </p>
                  </div>
                ) : loans.some((l) => ["pending", "escalated", "approved", "active"].includes(l.status)) ? (
                  /* LOCK B: Outstanding loans exist */
                  <div
                    id="outstanding-loan-lock-status"
                    className="bg-amber-50 rounded-2xl border border-amber-200/50 p-5 text-center space-y-3"
                  >
                    <div className="mx-auto w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 animate-bounce">
                      <CircleDollarSign className="w-5 h-5" />
                    </div>
                    <h3 className="text-xs font-bold text-amber-800 uppercase tracking-widest">
                      Active Portfolio Outstanding
                    </h3>
                    <p className="text-[10px] text-amber-700 leading-relaxed max-w-[280px] mx-auto font-medium">
                      NGACCUL policies restrict placing multiple concurrent credit lines. You must completely fulfill your existing loan balance or await decision router escalation before launching a new request.
                    </p>
                    {loans
                      .filter((l) => ["pending", "escalated", "approved", "active"].includes(l.status))
                      .map((l) => (
                        <div key={l.id} className="pt-2.5 border-t border-amber-200/30">
                          <div className="text-[10px] font-bold text-amber-800 pb-1 uppercase font-numeric">
                            Current Status:{" "}
                            <span className="text-brand-accent bg-brand-accent/10 px-1.5 py-0.5 rounded-md font-extrabold capitalize">
                              {l.status}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (myBalance?.balance ?? 0) < (loanConfig?.min_savings_fcfa ?? 50000) ? (
                  /* LOCK C: Insufficient savings */
                  <div
                    id="insufficient-savings-lock-status"
                    className="bg-rose-50 rounded-2xl border border-rose-200/50 p-5 text-center space-y-3"
                  >
                    <div className="mx-auto w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <h3 className="text-xs font-bold text-rose-800 uppercase tracking-widest">
                      Minimum Savings Required
                    </h3>
                    <p className="text-[10px] text-rose-700 leading-relaxed max-w-[280px] mx-auto font-medium">
                      You must save at least <span className="font-extrabold font-numeric">{(loanConfig?.min_savings_fcfa ?? 50000).toLocaleString()} FCFA</span> before applying for cooperative credit lines. Your current savings balance is <span className="font-extrabold font-numeric">{(myBalance?.balance ?? 0).toLocaleString()} FCFA</span>.
                    </p>
                  </div>
                ) : (
                  /* THREE STEP SURVEY STYLE MULTI STEP LOAN WIZARD */
                  <div className="space-y-4">
                    {/* Step indicator header */}
                    <div className="flex justify-between items-center text-[10px] font-black tracking-widest text-[#7C4DCC] uppercase">
                      <span>{strings.loan_phase_indicator ? strings.loan_phase_indicator.replace("{phase}", loanPhase.toString()) : `Phase ${loanPhase} of 3`}</span>
                      <span>
                        {loanPhase === 1 && (strings.loan_param_header || "Loan Parameters")}
                        {loanPhase === 2 && (strings.guarantor_contract_header || "Guarantor Contract")}
                        {loanPhase === 3 && (strings.verification_consent_header || "Verification Consent")}
                      </span>
                    </div>
                    <div className="w-full bg-brand-secondary/20 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-brand-primary h-full transition-all duration-300"
                        style={{ width: `${(loanPhase / 3) * 100}%` }}
                      ></div>
                    </div>

                    {loanPhase === 1 && (
                      <div className="space-y-3 animate-fade-in text-xs">
                        <div className="p-3 bg-brand-surface/30 rounded-2xl text-[10px] space-y-1">
                          <p className="text-brand-primary/60">{strings.savings_base_balance || "Savings Base Balance:"} <strong className="text-brand-primary font-numeric">{(myBalance?.balance ?? 0).toLocaleString()} FCFA</strong></p>
                          <p className="text-brand-primary/60">{strings.applicable_interest_rate || "Applicable Interest Rate:"} <strong className="text-brand-primary font-numeric">{(loanConfig?.interest_rate_pct ?? 5.0).toFixed(2)}% flat</strong></p>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-brand-primary/80">
                            {strings.loan_requested_amount || "Requested Amount (FCFA)"}
                          </label>
                          <input
                            id="input-loan-amount"
                            type="number"
                            required
                            placeholder="e.g. 150000"
                            value={loanAmount}
                            onChange={(e) => setLoanAmount(e.target.value)}
                            className="w-full text-xs font-numeric p-2.5 rounded-xl border border-brand-secondary focus:outline-none focus:ring-1 focus:ring-brand-primary text-brand-primary"
                          />
                        </div>

                        <div className="space-y-1 font-numeric">
                          <label className="text-[11px] font-semibold text-brand-primary/80">
                            {strings.term_duration_label || "Term Duration"}
                          </label>
                          <GlassmorphismSelect
                            id="select-loan-term"
                            value={loanTerm}
                            onChange={setLoanTerm}
                            label={strings.loan_label_select_term}
                            placeholder={strings.loan_placeholder_term}
                            options={[
                              { value: "3", label: "3 Months (Short cycle)" },
                              { value: "6", label: "6 Months (Standard term)" },
                              { value: "12", label: "12 Months (Cooperative farming project)" },
                            ]}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-brand-primary/80">
                            {strings.settle_date_label || "Repayment Settle Date"}
                          </label>
                          <input
                            id="input-loan-payback-date"
                            type="date"
                            required
                            min={new Date().toISOString().slice(0, 10)}
                            value={loanPaybackDate}
                            onChange={(e) => setLoanPaybackDate(e.target.value)}
                            className="w-full text-xs font-numeric p-2.5 rounded-xl border border-brand-secondary focus:outline-none focus:ring-1 focus:ring-brand-primary text-brand-primary"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-brand-primary/80">
                            {strings.purpose_credit_label || "Purpose of Credit Line"}
                          </label>
                          <textarea
                            id="input-loan-purpose"
                            required
                            placeholder={strings.loan_placeholder_purpose}
                            maxLength={150}
                            value={loanPurpose}
                            onChange={(e) => setLoanPurpose(e.target.value)}
                            className="w-full text-xs p-2.5 rounded-xl border border-brand-secondary focus:outline-none focus:ring-1 focus:ring-brand-primary h-16 text-brand-primary"
                          />
                        </div>

                        <div className="pt-2 flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              const amt = Number(loanAmount);
                              if (!amt || amt <= 5000) {
                                showBanner("Minimum loan amount is 5,000 FCFA.", "error");
                                return;
                              }
                              if (!loanPurpose.trim()) {
                                showBanner("Purpose description is required.", "error");
                                return;
                              }
                              setLoanPhase(2);
                            }}
                            className="px-5 py-2.5 bg-brand-primary hover:bg-brand-accent text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer"
                          >
                            {strings.next_guarantor_btn || "Next: Guarantor Details →"}
                          </button>
                        </div>
                      </div>
                    )}

                    {loanPhase === 2 && (
                      <div className="space-y-3 animate-fade-in text-xs">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-brand-primary/80">
                              {strings.guarantor_name_label || "Guarantor Full Name"}
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. Jean Dupont"
                              value={guarantorName}
                              onChange={(e) => setGuarantorName(e.target.value)}
                              className="w-full text-xs p-2.5 rounded-xl border border-brand-secondary text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-brand-primary/80">
                              {strings.guarantor_phone_label || "Guarantor Phone"}
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. 677889900"
                              value={guarantorPhone}
                              onChange={(e) => setGuarantorPhone(e.target.value)}
                              className="w-full text-xs p-2.5 rounded-xl border border-brand-secondary text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-brand-primary/80">
                              {strings.relationship_label || "Relationship"}
                            </label>
                            <select
                              value={guarantorRelationship}
                              onChange={(e) => setGuarantorRelationship(e.target.value)}
                              className="w-full text-xs p-2.5 rounded-xl border border-brand-secondary text-brand-primary bg-white focus:outline-none focus:ring-1 focus:ring-brand-primary"
                            >
                              <option value="">{strings.select_relations_placeholder || "Select relations..."}</option>
                              <option value="parent">{strings.relationship_parent || "Parent"}</option>
                              <option value="sibling">{strings.relationship_sibling || "Sibling"}</option>
                              <option value="spouse">{strings.relationship_spouse || "Spouse"}</option>
                              <option value="guardian">{strings.relationship_guardian || "Tutor/Guardian"}</option>
                              <option value="friend">{strings.relationship_friend || "Friend"}</option>
                              <option value="colleague">{strings.relationship_colleague || "Colleague"}</option>
                              <option value="other">{strings.relationship_other || "Other"}</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-brand-primary/80">
                              {strings.guarantor_locality_label || "Guarantor Locality"}
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. Bamenda"
                              value={guarantorLocality}
                              onChange={(e) => setGuarantorLocality(e.target.value)}
                              className="w-full text-xs p-2.5 rounded-xl border border-brand-secondary text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                            />
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-brand-primary/80">
                              {strings.national_id_number_label || "National ID Number"}
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="17-digit CNI card or 19-20 char receipt"
                              value={guarantorNationalId}
                              onChange={(e) => setGuarantorNationalId(e.target.value)}
                              className="w-full text-xs p-2.5 rounded-xl border border-brand-secondary text-[#7C4DCC] focus:outline-none focus:ring-1 focus:ring-brand-primary font-numeric bg-brand-surface"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-brand-surface/30 border border-brand-secondary/15">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-brand-primary/70 uppercase">
                                ID Document Type
                              </label>
                              <select
                                required
                                value={guarantorDocType}
                                onChange={(e) => setGuarantorDocType(e.target.value as 'card' | 'receipt')}
                                className="w-full text-xs p-2.5 rounded-xl border border-brand-secondary focus:outline-none focus:ring-1 focus:ring-brand-primary bg-brand-surface text-brand-primary"
                              >
                                <option value="card">Original CNI Card</option>
                                <option value="receipt">CNI Receipt (Récépissé)</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-brand-primary/70 uppercase">
                                Date of Issuance
                              </label>
                              <input
                                type="date"
                                required
                                max={new Date().toISOString().split('T')[0]}
                                value={guarantorIssuedDate}
                                onChange={(e) => setGuarantorIssuedDate(e.target.value)}
                                className="w-full text-xs p-2.5 rounded-xl border border-brand-secondary text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary bg-brand-surface font-numeric"
                              />
                            </div>
                          </div>

                          {guarantorIssuedDate && (
                            <div className="text-[11px] text-brand-primary/75 bg-brand-primary/5 p-2 rounded-xl border border-brand-secondary/10 flex justify-between items-center">
                              <span>Computed Expiry:</span>
                              <span className="font-bold font-numeric text-brand-primary">
                                {(() => {
                                  const date = new Date(guarantorIssuedDate);
                                  if (!isNaN(date.getTime())) {
                                    if (guarantorDocType === 'card') {
                                      date.setFullYear(date.getFullYear() + 10);
                                    } else {
                                      date.setMonth(date.getMonth() + 3);
                                    }
                                    return date.toISOString().split('T')[0];
                                  }
                                  return '';
                                })()}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="space-y-1.5 pt-1 border-t border-brand-secondary/10">
                          <label className="text-[11px] font-black text-brand-accent uppercase tracking-wide">
                            {strings.verification_legal_signature || "Verification Legal Signature"}
                          </label>
                          <p className="text-[9px] text-brand-primary/60 leading-tight">
                            {strings.confirm_identity_signature || "Confirm your identity. Type your full legal name below:"} (<strong className="text-brand-primary">{profile.full_name}</strong>):
                          </p>
                          <input
                            type="text"
                            required
                            placeholder={strings.signature_placeholder || "Type legal name precisely"}
                            value={clientSignature}
                            onChange={(e) => setClientSignature(e.target.value)}
                            className="w-full text-xs p-2.5 rounded-xl border border-brand-primary/20 text-brand-primary font-bold focus:outline-none focus:ring-1 focus:ring-brand-primary"
                          />
                        </div>

                        <div className="pt-2 flex justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setLoanPhase(1)}
                            className="px-4 py-2.5 border border-brand-secondary text-brand-primary font-semibold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer hover:bg-brand-secondary/10"
                          >
                            ← {strings.back || "Back"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!guarantorName.trim() || !guarantorPhone.trim() || !guarantorRelationship || !guarantorLocality.trim() || !guarantorNationalId.trim() || !guarantorIdExpiry.trim()) {
                                showBanner("Please fill out all guarantor fields.", "error");
                                return;
                              }
                              if (clientSignature.trim().toLowerCase() !== profile.full_name.trim().toLowerCase()) {
                                showBanner("Signature mismatch: Legal name must match precisely.", "error");
                                return;
                              }
                              setLoanPhase(3);
                            }}
                            className="px-5 py-2.5 bg-brand-primary hover:bg-brand-accent text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer"
                          >
                            {strings.next_agreements_btn || "Next: Agreements →"}
                          </button>
                        </div>
                      </div>
                    )}

                    {loanPhase === 3 && (
                      <div className="space-y-4 animate-fade-in text-xs">
                        {/* Summary panel */}
                        <div className="p-3 bg-brand-surface/30 rounded-2xl text-[10px] space-y-1">
                          <h4 className="font-bold text-brand-primary mb-1 uppercase tracking-wider">{strings.credit_review_title || "Credit Parameters Review:"}</h4>
                          <div className="flex justify-between">
                            <span className="text-brand-primary/60">{strings.requested_amount_label || "Amount Request:"}</span>
                            <span className="font-bold font-numeric text-brand-primary">{Number(loanAmount).toLocaleString()} FCFA</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-brand-primary/60">{strings.payback_terms_label || "Payback terms:"}</span>
                            <span className="font-bold font-numeric text-[#7C4DCC]">{loanTerm} {strings.months_label || "Months"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-brand-primary/60">{strings.guarantor_name_label || "Guarantor Name"}:</span>
                            <span className="font-bold text-brand-primary">{guarantorName}</span>
                          </div>
                        </div>

                        {/* Location Checkbox */}
                        <label className="flex items-start gap-2.5 p-3 rounded-2xl border border-brand-secondary/10 bg-brand-surface/10 hover:bg-brand-surface/25 cursor-pointer transition-all">
                          <input
                            type="checkbox"
                            checked={subdivisionChecked}
                            onChange={(e) => {
                              setSubdivisionChecked(e.target.checked);
                              if (!e.target.checked) {
                                setTermsChecked(false);
                              }
                            }}
                            className="mt-0.5 rounded border-brand-secondary text-brand-primary focus:ring-brand-primary scale-110"
                          />
                          <div className="space-y-0.5">
                            <span className="font-bold text-[11px] block text-brand-primary leading-tight">{strings.branch_location_decl_title || "Branch Location Declaration"}</span>
                            <span className="text-[10px] text-brand-primary/70 leading-normal block">
                              {strings.branch_location_decl_desc ? strings.branch_location_decl_desc.replace("{subdivision}", profile.subdivision) : `I certify that I am currently residing or working in ${profile.subdivision} and consent to submit this portfolio request to local cooperative operations.`}
                            </span>
                          </div>
                        </label>

                        {/* Terms & Conditions Checkbox */}
                        <div
                          className={`flex items-start gap-2.5 p-3 rounded-2xl border transition-all ${
                            !subdivisionChecked
                              ? "opacity-50 pointer-events-none bg-stone-50 border-stone-200"
                              : "border-brand-secondary/10 bg-brand-surface/10 hover:bg-brand-surface/25 cursor-pointer"
                          }`}
                          onClick={() => {
                            if (!subdivisionChecked) return;
                            if (!activeLoanTerms) {
                              showBanner("Administrative terms and conditions have not been published yet.", "error");
                              return;
                            }
                            // Show terms overlay!
                            setTermsScrolledToBottom(false);
                            setTermsModalOpen(true);
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={termsChecked}
                            readOnly
                            className="mt-0.5 rounded border-brand-secondary text-brand-primary focus:ring-brand-primary scale-110 pointer-events-none"
                          />
                          <div className="space-y-0.5">
                            <span className="font-bold text-[11px] block text-brand-primary leading-tight">{strings.loan_agreement_contract_title || "Loan Agreement Contract"}</span>
                            <span className="text-[10px] text-brand-primary/70 leading-normal block">
                              {strings.loan_agreement_contract_desc || "Click here to view, read and agree to the legal NGACCUL cooperative credit Terms & Conditions."}
                            </span>
                          </div>
                        </div>

                        <div className="pt-2 flex justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setLoanPhase(2);
                              setSubdivisionChecked(false);
                              setTermsChecked(false);
                            }}
                            className="px-4 py-2.5 border border-brand-secondary text-brand-primary font-semibold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer hover:bg-brand-secondary/5"
                          >
                            ← {strings.back || "Back"}
                          </button>
                          <button
                            type="button"
                            id="btn-loan-submit"
                            disabled={!subdivisionChecked || !termsChecked}
                            onClick={handleLoanSubmit}
                            className={`px-5 py-2.5 font-bold rounded-xl text-xs uppercase tracking-wider transition-all flex-1 ${
                              subdivisionChecked && termsChecked
                                ? "bg-emerald-600 text-white cursor-pointer hover:bg-emerald-700 shadow-sm"
                                : "bg-brand-secondary/40 text-brand-primary/30 cursor-not-allowed"
                            }`}
                          >
                            {strings.submit_credit_request_btn || "Submit Credit Request"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* DIRECT DEPOSIT / AGENT LOG DEPOSIT TAB */}
        {activeTab === "deposit" && (
          <div className="space-y-6 animate-fade-in">
            {profile.role === "client" ? (
              <div className="bg-white rounded-3xl p-6 border border-brand-secondary/25 shadow-sm space-y-6">
                <div>
                  <h2 className="font-display font-extrabold text-lg text-brand-primary flex items-center gap-2">
                    <ArrowUpToLine className="w-5 h-5 text-brand-accent animate-bounce" />
                    {strings.deposit_client_title || "Direct Mobile Self-Deposit"}
                  </h2>
                  <p className="text-[11px] text-brand-primary/70 mt-1">
                    {strings.deposit_client_desc || "Initiate a secure mobile money transaction to instantly fund your active savings account balance."}
                  </p>
                </div>

                {selfDepositLockSettings.client_locked && (
                  <div className="bg-amber-500/10 backdrop-blur-xl border border-amber-400/30 text-amber-950 dark:text-amber-50 text-xs font-semibold flex items-center gap-3 shadow-lg rounded-2xl p-4">
                    <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <div>
                      <p className="font-bold">{strings.self_deposit_locked_tab_title || "Self-Deposit (Coming Soon)"}</p>
                      <p className="text-[11px] text-amber-800 dark:text-amber-200 mt-0.5">{strings.self_deposit_locked_notice || "This feature will be available soon."}</p>
                    </div>
                  </div>
                )}

                {!isBusinessHours && (
                  <div className="space-y-3">
                    <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-amber-800 text-xs font-semibold flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-bold">{strings.x_operational_hours_restriction}</p>
                        <p className="font-normal text-[11px] mt-0.5 text-amber-700">{businessHoursMessage}</p>
                        <button
                          type="button"
                          onClick={() => setShowAppealForm(showAppealForm === 'deposit' ? null : 'deposit')}
                          className="mt-2 text-brand-accent font-black text-[11px] underline block cursor-pointer uppercase text-left"
                        >
                          {showAppealForm === 'deposit' ? "Close Appeal Panel" : "Request Emergency Lockout Bypass"}
                        </button>
                      </div>
                    </div>

                    {showAppealForm === 'deposit' && (
                      <div className="p-4 bg-brand-surface/40 rounded-2xl border border-brand-secondary/20 space-y-3">
                        <h4 className="font-bold text-xs text-brand-primary">Emergency Deposit Lockout Bypass</h4>
                        <div className="space-y-2 text-xs text-brand-primary">
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold opacity-60 block">Estimated Amount (FCFA)</label>
                            <input
                              type="number"
                              placeholder="e.g. 25000"
                              value={appealAmount}
                              onChange={(e) => setAppealAmount(e.target.value)}
                              className="w-full bg-white border border-brand-secondary/20 rounded-xl px-3 py-2 focus:outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold opacity-60 block">Emergency Bypass Justification *</label>
                            <textarea
                              placeholder="Please explain why you need to deposit funds outside of regular business hours..."
                              rows={3}
                              value={appealReason}
                              onChange={(e) => setAppealReason(e.target.value)}
                              className="w-full bg-white border border-brand-secondary/20 rounded-xl px-3 py-2 focus:outline-none"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAppealSubmit('deposit')}
                            className="w-full py-2 bg-brand-accent hover:bg-brand-accent/90 text-white font-extrabold text-[11px] uppercase tracking-wider rounded-xl cursor-pointer"
                          >
                            Submit Lockout Bypass Appeal
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <form
                  onSubmit={handleClientDirectDepositSubmit}
                  className="space-y-5"
                >
                  {/* Mobile Money Provider Selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-brand-primary/80 block">
                      {strings.deposit_select_provider || "Select Mobile Provider"}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        {
                          id: "mtn_momo",
                          name: "MTN MoMo",
                          activeColor:
                            "bg-[#FFCC00] border-[#FFCC00] text-black",
                          bgColor: "bg-[#FFCC00]",
                          textColor: "text-black",
                          logo: (
                            <svg
                              viewBox="0 0 100 100"
                              className="w-12 h-12 shadow-sm rounded-full bg-[#FFCC00]"
                            >
                              <circle cx="50" cy="50" r="45" fill="#FFCC00" />
                              <ellipse
                                cx="50"
                                cy="50"
                                rx="35"
                                ry="22"
                                fill="none"
                                stroke="#032B5B"
                                strokeWidth="4"
                              />
                              <text
                                x="50"
                                y="58"
                                fontFamily="system-ui, -apple-system, sans-serif"
                                fontWeight="900"
                                fontSize="20"
                                fill="black"
                                textAnchor="middle"
                              >
                                MTN
                              </text>
                            </svg>
                          ),
                        },
                        {
                          id: "orange_money",
                          name: strings.orange_label,
                          activeColor:
                            "bg-[#FF6600] border-[#FF6600] text-white",
                          bgColor: "bg-[#FF6600]",
                          textColor: "text-white",
                          logo: (
                            <svg
                              viewBox="0 0 100 100"
                              className="w-12 h-12 shadow-sm rounded-lg bg-[#FF6600]"
                            >
                              <rect width="100" height="100" fill="#FF6600" />
                              <text
                                x="50"
                                y="75"
                                fontFamily="system-ui, -apple-system, sans-serif"
                                fontWeight="900"
                                fontSize="24"
                                fill="white"
                                textAnchor="middle"
                              >
                                orange
                              </text>
                            </svg>
                          ),
                        },
                      ].map((prov) => (
                        <motion.div
                          key={prov.id}
                          whileHover={isBusinessHours ? { scale: 1.03 } : {}}
                          whileTap={isBusinessHours ? { scale: 0.97 } : {}}
                          onClick={() => isBusinessHours && setClientDepMethod(prov.id)}
                          className={`p-4 rounded-3xl border-2 flex flex-col items-center justify-center text-center relative transition-all ${!isBusinessHours ? "opacity-50 cursor-not-allowed bg-brand-surface border-brand-secondary/20" : "cursor-pointer"} ${
                            isBusinessHours && clientDepMethod === prov.id
                              ? prov.activeColor +
                                " ring-4 ring-brand-primary/20"
                              : "bg-white border-brand-secondary/20 text-brand-primary hover:bg-brand-surface/25"
                          }`}
                        >
                          {clientDepMethod === prov.id && (
                            <div
                              className={`absolute top-2.5 right-2.5 rounded-full p-0.5 shadow-sm ${prov.id === "mtn_momo" ? "bg-black text-[#FFCC00]" : "bg-white text-[#FF6600]"}`}
                            >
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </div>
                          )}
                          <div className="mb-2">{prov.logo}</div>
                          <span className="text-xs font-black tracking-tight">
                            {prov.name}
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  </div>



                  {/* Preset amounts fast-chips */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-brand-primary/80 block">
                      {strings.deposit_preset_label || "Fast-preset Deposit Amount"}
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[5000, 10000, 25000, 50000].map((amt) => (
                        <motion.button
                          key={amt}
                          type="button"
                          disabled={!isBusinessHours}
                          whileHover={isBusinessHours ? { scale: 1.05 } : {}}
                          whileTap={isBusinessHours ? { scale: 0.95 } : {}}
                          onClick={() => isBusinessHours && setClientDepAmount(amt.toString())}
                          className={`py-1.5 px-2 rounded-xl text-[10px] font-bold border text-center transition-all ${!isBusinessHours ? "opacity-50 cursor-not-allowed bg-brand-surface border-brand-secondary/25" : "cursor-pointer"} ${
                            isBusinessHours && clientDepAmount === amt.toString()
                              ? "bg-brand-primary text-white shadow-md"
                              : "bg-brand-surface hover:bg-brand-secondary/10 text-brand-primary"
                          }`}
                        >
                          +{amt.toLocaleString()} ₣
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  {/* Input fields */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-brand-primary/80 block">
                      {strings.deposit_amount_label || "Deposit Amount (FCFA)"}
                    </label>
                    <div className="relative">
                      <input
                        id="input-client-deposit-amount"
                        type="number"
                        required
                        placeholder="e.g. 15000"
                        disabled={!isBusinessHours}
                        value={clientDepAmount}
                        onChange={(e) => setClientDepAmount(e.target.value)}
                        className="w-full text-xs font-numeric p-3 pr-12 rounded-xl border border-brand-secondary focus:outline-none focus:ring-1 focus:ring-brand-primary bg-white text-brand-primary font-bold disabled:opacity-50 disabled:bg-brand-surface"
                      />
                      <div className="absolute right-3 top-3 text-[10px] font-extrabold uppercase text-brand-primary/50 font-numeric">
                        FCFA
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-brand-primary/80 block">
                      {strings.deposit_wallet_phone || "Mobile Wallet Phone Number"}
                    </label>
                    <input
                      id="input-client-deposit-phone"
                      type="tel"
                      required
                      placeholder="e.g. 677xxxxxx"
                      disabled={!isBusinessHours}
                      value={clientDepPhone}
                      onChange={(e) => setClientDepPhone(e.target.value)}
                      className="w-full text-xs font-numeric p-3 rounded-xl border border-brand-secondary focus:outline-none focus:ring-1 focus:ring-brand-primary bg-white text-brand-primary disabled:opacity-50 disabled:bg-brand-surface"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-brand-primary/80 block">
                      {strings.deposit_note_optional || "Direct Deposit Notes / Memo (Optional)"}
                    </label>
                    <input
                      id="input-client-deposit-note"
                      type="text"
                      placeholder="e.g. Self-saving deposit for target goal"
                      disabled={!isBusinessHours}
                      value={clientDepNote}
                      onChange={(e) => setClientDepNote(e.target.value)}
                      className="w-full text-xs p-3 rounded-xl border border-brand-secondary focus:outline-none focus:ring-1 focus:ring-brand-primary bg-white text-brand-primary disabled:opacity-50 disabled:bg-brand-surface"
                    />
                  </div>

                  <motion.button
                    id="btn-client-deposit-submit"
                    type="submit"
                    disabled={!isBusinessHours || selfDepositLockSettings.client_locked || isDepositing}
                    whileHover={isBusinessHours && !selfDepositLockSettings.client_locked && !isDepositing ? { scale: 1.02 } : {}}
                    whileTap={isBusinessHours && !selfDepositLockSettings.client_locked && !isDepositing ? { scale: 0.98 } : {}}
                    className={`w-full py-3.5 text-white text-xs font-extrabold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-md ${!isBusinessHours || selfDepositLockSettings.client_locked ? "opacity-50 cursor-not-allowed bg-brand-primary" : "bg-brand-primary hover:bg-brand-accent/90 cursor-pointer"}`}
                  >
                    {isDepositing ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        {strings.deposit_processing || "Processing Transaction secure portal..."}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <Check className="w-4 h-4" /> {strings.deposit_funds_btn || "Execute Secure Deposit"} ({Number(clientDepAmount || 0).toLocaleString()} FCFA)
                      </span>
                    )}
                  </motion.button>
                </form>
              </div>
            ) : (
              <div className="bg-white rounded-3xl p-6 border border-brand-secondary/25 shadow-sm space-y-4">
                <h2 className="font-display font-extrabold text-base text-brand-primary flex items-center gap-2">
                  <ArrowUpToLine className="w-5 h-5 text-brand-accent" />
                  {strings.log_deposit_title}
                </h2>
                <p className="text-[10px] text-brand-primary/70">
                  Logger will place cash collects under a pending period. Member
                  receives an SMS receipt to support disputes matching §6.1.
                </p>

                {selfDepositLockSettings.agent_locked && depClientId === profile.id && (
                  <div className="bg-amber-500/10 backdrop-blur-xl border border-amber-400/30 text-amber-950 dark:text-amber-50 text-xs font-semibold flex items-center gap-3 shadow-lg rounded-2xl p-4">
                    <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <div>
                      <p className="font-bold">{strings.self_deposit_locked_tab_title || "Self-Deposit (Coming Soon)"}</p>
                      <p className="text-[11px] text-amber-800 dark:text-amber-200 mt-0.5">{strings.self_deposit_locked_notice || "This feature will be available soon."}</p>
                    </div>
                  </div>
                )}

                {!isBusinessHours && (
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-amber-800 text-xs font-semibold flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">{strings.x_operational_hours_restriction}</p>
                      <p className="font-normal text-[11px] mt-0.5 text-amber-700">{businessHoursMessage}</p>
                    </div>
                  </div>
                )}

                <form
                  onSubmit={handleAgentDepositSubmit}
                  className="space-y-4 pt-2"
                >
                  <div className="space-y-1.5 relative z-30">
                    <label className="text-xs font-semibold text-brand-primary/80">
                      Select Client Portfolio
                    </label>
                    <GlassmorphismSelect
                      id="select-deposit-client"
                      disabled={!isBusinessHours}
                      value={depClientId}
                      onChange={(val) => {
                        if (!isBusinessHours) return;
                        setDepClientId(val);
                        const cl = myClients.find((p) => p.id === val);
                        if (cl) {
                          setAgentCampayPhone(cl.phone);
                        } else {
                          setAgentCampayPhone("");
                        }
                      }}
                      label={strings.client_label_select}
                      placeholder="-- Choose Client Portfolio --"
                      options={myClients.map((cl) => ({
                        value: cl.id,
                        label: `${cl.full_name} (${cl.unique_display_id || "N/A"})`,
                      }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-brand-primary/80">
                      {strings.amount} (FCFA)
                    </label>
                    <input
                      id="input-deposit-amount"
                      type="number"
                      required
                      placeholder="e.g. 50000"
                      disabled={!isBusinessHours}
                      value={depAmount}
                      onChange={(e) => setDepAmount(e.target.value)}
                      className="w-full text-xs font-numeric p-3 rounded-xl border border-brand-secondary focus:outline-none focus:ring-1 focus:ring-brand-primary text-brand-primary bg-white font-bold disabled:opacity-50 disabled:bg-brand-surface"
                    />
                  </div>

                  <div className="space-y-1.5 relative z-20">
                    <label className="text-xs font-semibold text-brand-primary/80">
                      Payment Intake Mode
                    </label>
                    <GlassmorphismSelect
                      id="select-deposit-method"
                      disabled={!isBusinessHours}
                      value={depMethod}
                      onChange={(val) => isBusinessHours && setDepMethod(val as any)}
                      label={strings.deposit_label_payment_mode}
                      placeholder={strings.deposit_placeholder_payment_mode}
                      options={[
                        { value: "cash", label: "Cash Collect (Handheld)" },
                        { value: "mtn", label: strings.deposit_option_mtn },
                        { value: "orange", label: strings.deposit_option_orange },
                      ]}
                    />
                  </div>

                  {(depMethod === "mtn" || depMethod === "orange") && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-3 bg-brand-secondary/5 dark:bg-[#1E193C] p-4 rounded-2xl border border-brand-accent/20"
                    >
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-brand-primary/80 block">
                          Cooperator Mobile Wallet Phone Number
                        </label>
                        <input
                          type="tel"
                          required
                          placeholder="e.g. 677xxxxxx"
                          disabled={!isBusinessHours}
                          value={agentCampayPhone}
                          onChange={(e) => setAgentCampayPhone(e.target.value)}
                          className="w-full text-xs font-numeric p-3 rounded-xl border border-brand-secondary focus:outline-none focus:ring-1 focus:ring-brand-primary bg-white text-brand-primary disabled:opacity-50 disabled:bg-brand-surface"
                        />
                        <p className="text-[10px] text-brand-primary/60">
                          Defaults to the client's number on file if left blank.
                          Enter the actual wallet number to charge if it's different.
                        </p>
                      </div>

                      <div className="space-y-1.5 border-t border-brand-accent/10 pt-3">
                        <label className="text-xs font-semibold text-brand-primary/80 block">
                          Validate Payment Receipt Screenshot
                        </label>
                        <div className="relative border border-dashed border-brand-accent/40 rounded-xl p-3 text-center hover:bg-brand-primary/5 transition-all">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleReceiptUpload}
                            disabled={!isBusinessHours || isVerifyingReceipt}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                          />
                          <div className="space-y-1 text-center">
                            <svg className="mx-auto h-8 w-8 text-brand-primary/60 animate-pulse" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                              <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span className="text-[11px] text-brand-primary block font-medium">
                              Drag & drop or Click to upload receipt
                            </span>
                            <span className="text-[9px] text-brand-primary/55 block">
                              PNG, JPG up to 5MB (Processed securely by NGACCUL AI)
                            </span>
                          </div>
                        </div>

                        {isVerifyingReceipt && (
                          <div className="flex items-center gap-2 text-[11px] text-brand-primary/80 bg-brand-primary/5 p-2.5 rounded-xl border border-brand-primary/25 animate-pulse">
                            <span className="w-2.5 h-2.5 border-2 border-brand-primary border-t-transparent rounded-full animate-spin"></span>
                            AI Assistant analyzing receipt integrity, payment matching, and verifying replay protection...
                          </div>
                        )}

                        {receiptVerificationResult && (
                          <div className={`text-[11px] p-3 rounded-xl border ${
                            receiptVerificationResult.success 
                              ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-400 border-emerald-500/30" 
                              : "bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-400 border-rose-500/30"
                          }`}>
                            <div className="font-bold flex items-center gap-1.5 mb-1 text-xs">
                              {receiptVerificationResult.success ? (
                                <>
                                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                                  ✓ Receipt Validated successfully!
                                </>
                              ) : (
                                <>
                                  <span className="inline-block w-2 h-2 rounded-full bg-rose-500"></span>
                                  ⚠️ Audit Failure / Potential Fraud Detected
                                </>
                              )}
                            </div>
                            {receiptVerificationResult.success ? (
                              <div className="space-y-0.5 font-mono text-[10px] bg-white/40 p-2 rounded-lg border border-emerald-500/10 text-brand-primary">
                                <div>• Tx Reference: <span className="font-bold">{receiptVerificationResult.reference}</span></div>
                                <div>• Carrier/Provider: <span className="uppercase font-bold">{receiptVerificationResult.provider || depMethod}</span></div>
                                <div>• Extracted Amount: <span className="font-bold">{Number(receiptVerificationResult.amount).toLocaleString()} FCFA</span></div>
                                <div>• Verification Date: {receiptVerificationResult.date}</div>
                              </div>
                            ) : (
                              <div>{receiptVerificationResult.error}</div>
                            )}
                          </div>
                        )}
                      </div>


                    </motion.div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-brand-primary/80">
                      Optional memo / voucher check
                    </label>
                    <input
                      id="input-deposit-note"
                      type="text"
                      placeholder="e.g. Field collection Ngaoundéré quartier"
                      disabled={!isBusinessHours}
                      value={depNote}
                      onChange={(e) => setDepNote(e.target.value)}
                      className="w-full text-xs p-3 rounded-xl border border-brand-secondary focus:outline-none focus:ring-1 focus:ring-brand-primary bg-white text-brand-primary disabled:opacity-50 disabled:bg-brand-surface"
                    />
                  </div>

                  <button
                    id="btn-deposit-submit"
                    type="submit"
                    disabled={!isBusinessHours || (selfDepositLockSettings.agent_locked && depClientId === profile.id)}
                    className={`w-full py-3.5 text-white text-xs font-extrabold rounded-2xl transition-all uppercase tracking-wider font-numeric shadow-md ${
                      !isBusinessHours || (selfDepositLockSettings.agent_locked && depClientId === profile.id)
                        ? "opacity-50 cursor-not-allowed bg-brand-primary/45"
                        : (depMethod === "mtn" || depMethod === "orange")
                        ? "bg-brand-primary hover:bg-brand-accent cursor-pointer"
                        : "bg-[#1A7A4A] hover:bg-emerald-800 cursor-pointer"
                    }`}
                  >
                    {(depMethod === "mtn" || depMethod === "orange")
                      ? `Trigger Live USSD Push (${Number(depAmount || 0).toLocaleString()} ₣)`
                      : strings.deposit_label_cash}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* AGENT COMMISSION LEDGER CALENDAR TAB */}
        {activeTab === "commissions" && (
          <div className="space-y-6 animate-fade-in text-brand-primary pb-16">
            {/* COMMISSION METRICS DASHBOARD */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white p-4 rounded-3xl border border-brand-secondary/25 shadow-xs col-span-2">
                <span className="text-[10px] text-brand-primary/50 font-bold uppercase tracking-wider block">
                  Available Unpaid Balance
                </span>
                <div className="flex justify-between items-baseline mt-1">
                  <span className="text-2xl font-black text-violet-800 font-numeric">
                    {Math.max(
                      0,
                      accruedCommissions -
                        payoutsTotal -
                        payoutRequests
                          .filter((r) => r.status === "pending")
                          .reduce((sum, r) => sum + r.amount_fcfa, 0),
                    ).toLocaleString()}{" "}
                    <span className="text-xs font-bold text-brand-primary">
                      FCFA
                    </span>
                  </span>
                  {payoutRequests.filter((r) => r.status === "pending").length >
                    0 && (
                    <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
                      {payoutRequests
                        .filter((r) => r.status === "pending")
                        .reduce((sum, r) => sum + r.amount_fcfa, 0)
                        .toLocaleString()}{" "}
                      pending
                    </span>
                  )}
                </div>

                <button
                  onClick={() => {
                    const avail = Math.max(
                      0,
                      accruedCommissions -
                        payoutsTotal -
                        payoutRequests
                          .filter((r) => r.status === "pending")
                          .reduce((sum, r) => sum + r.amount_fcfa, 0),
                    );
                    if (avail <= 0) {
                      showBanner(
                        "You do not have any pending unrequested commission balance to payout.",
                        "error",
                      );
                      return;
                    }
                    setPayoutModalOpen(true);
                    setPayoutFormType("total");
                    setCustomPayoutAmount(avail.toString());
                  }}
                  className="w-full mt-3 py-2.5 bg-violet-700 hover:bg-violet-800 text-white font-extrabold text-xs rounded-2xl cursor-pointer transition-all shadow-sm text-center block"
                >
                  Request Payout
                </button>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-brand-secondary/20 shadow-xs">
                <span className="text-[10px] text-brand-primary/50 font-bold uppercase tracking-wider block">
                  Total Recruited
                </span>
                <span className="text-lg font-black text-emerald-700 font-numeric block mt-1">
                  {myClients.length}{" "}
                  <span className="text-xs font-semibold text-brand-primary/60">
                    Leads
                  </span>
                </span>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-brand-secondary/20 shadow-xs">
                <span className="text-[10px] text-brand-primary/50 font-bold uppercase tracking-wider block">
                  Paid Payouts
                </span>
                <span className="text-lg font-black text-brand-primary font-numeric block mt-1">
                  {payoutsTotal.toLocaleString()}{" "}
                  <span className="text-[10px] font-bold text-brand-primary/60">
                    ₣
                  </span>
                </span>
              </div>
            </div>

            {/* FILTERABLE PERFORMANCE CHARTS */}
            <div className="bg-white rounded-3xl p-5 border border-brand-secondary/25 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-brand-surface pb-3 flex-wrap gap-2">
                <div>
                  <h3 className="font-display font-extrabold text-xs uppercase tracking-wider text-brand-primary">
                    Performance Charts
                  </h3>
                  <p className="text-[9px] text-[#6D28D9] font-bold">
                    Tracks client sign-ups & accrued revenues
                  </p>
                </div>
                <div className="flex bg-brand-surface/30 p-1 rounded-xl text-[10px] font-bold font-display cursor-pointer select-none">
                  <button
                    onClick={() => setPayoutChartDays(7)}
                    className={`px-3 py-1 rounded-lg transition-all ${payoutChartDays === 7 ? "bg-violet-700 text-white shadow-xs" : "text-brand-primary/60 hover:text-brand-primary"}`}
                  >
                    7 Days
                  </button>
                  <button
                    onClick={() => setPayoutChartDays(30)}
                    className={`px-3 py-1 rounded-lg transition-all ${payoutChartDays === 30 ? "bg-violet-700 text-white shadow-xs" : "text-brand-primary/60 hover:text-brand-primary"}`}
                  >
                    30 Days
                  </button>
                </div>
              </div>

              {/* GENERATING CHART COMPONENT DATA INTERMEDIATE */}
              {(() => {
                const data = [];
                const currentDate = new Date();
                for (let i = payoutChartDays - 1; i >= 0; i--) {
                  const d = new Date();
                  d.setDate(currentDate.getDate() - i);
                  const dateString = d.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  });

                  // Count clients joined on d
                  const leadsCount = myClients.filter((c) => {
                    const cDate = new Date(c.joined_at);
                    return cDate.toDateString() === d.toDateString();
                  }).length;

                  // Total Commission Ledger amount earned on d
                  const ledger = dbService.getCommissionLedger(profile);
                  const revenue = ledger
                    .filter((item) => {
                      const itemDate = new Date(item.accrued_at);
                      return itemDate.toDateString() === d.toDateString();
                    })
                    .reduce((sum, item) => sum + Number(item.amount_fcfa), 0);

                  data.push({
                    name: dateString,
                    Leads: leadsCount,
                    Revenue: revenue,
                  });
                }

                return (
                  <div className="space-y-6 pt-1">
                    {/* Leads Chart */}
                    <div className="space-y-1.5">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-brand-primary/60 flex justify-between">
                        <span>{strings.total_clients_recruited}</span>
                        <span className="text-[#6D28D9] font-extrabold">
                          {data.reduce((sum, d) => sum + d.Leads, 0)} total
                        </span>
                      </h4>
                      <div className="h-[120px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={data}>
                            <XAxis
                              dataKey="name"
                              stroke="#888888"
                              fontSize={9}
                              tickLine={false}
                              axisLine={false}
                            />
                            <YAxis
                              allowDecimals={false}
                              stroke="#888888"
                              fontSize={9}
                              tickLine={false}
                              axisLine={false}
                            />
                            <Tooltip
                              contentStyle={{
                                fontSize: "10px",
                                background: "#FFFFFF",
                                borderRadius: "12px",
                                border: "1px solid rgba(0,0,0,0.1)",
                              }}
                            />
                            <Bar
                              dataKey="Leads"
                              fill="#6D28D9"
                              radius={[4, 4, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Revenue Chart */}
                    <div className="space-y-1.5 pt-2 border-t border-brand-surface/40">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-brand-primary/60 flex justify-between">
                        <span>{strings.earned_commissions}</span>
                        <span className="text-emerald-600 font-extrabold">
                          {data
                            .reduce((sum, d) => sum + d.Revenue, 0)
                            .toLocaleString()}{" "}
                          ₣
                        </span>
                      </h4>
                      <div className="h-[120px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={data}>
                            <defs>
                              <linearGradient
                                id="revenueGrad"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                              >
                                <stop
                                  offset="5%"
                                  stopColor="#10B981"
                                  stopOpacity={0.3}
                                />
                                <stop
                                  offset="95%"
                                  stopColor="#10B981"
                                  stopOpacity={0.0}
                                />
                              </linearGradient>
                            </defs>
                            <XAxis
                              dataKey="name"
                              stroke="#888888"
                              fontSize={9}
                              tickLine={false}
                              axisLine={false}
                            />
                            <YAxis
                              stroke="#888888"
                              fontSize={9}
                              tickLine={false}
                              axisLine={false}
                            />
                            <Tooltip
                              contentStyle={{
                                fontSize: "10px",
                                background: "#FFFFFF",
                                borderRadius: "12px",
                                border: "1px solid rgba(0,0,0,0.1)",
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey="Revenue"
                              stroke="#10B981"
                              fillOpacity={1}
                              fill="url(#revenueGrad)"
                              strokeWidth={2}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* PAYOUT REQUESTS HISTORY LIST */}
            <div className="bg-white rounded-3xl p-5 border border-brand-secondary/25 shadow-sm space-y-3">
              <h3 className="font-display font-extrabold text-xs uppercase tracking-wider text-brand-primary">
                Payout Requests Tracking
              </h3>

              <div className="space-y-2.5 max-h-[220px] overflow-y-auto custom-scrollbar pr-1 select-none">
                {payoutRequests.length === 0 ? (
                  <p className="text-center text-xs text-brand-primary/40 italic py-4">
                    No payout request history logged.
                  </p>
                ) : (
                  payoutRequests.map((req) => (
                    <div
                      key={req.id}
                      className="p-3 bg-brand-surface/20 rounded-xl border border-brand-surface flex justify-between items-center gap-2"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-extrabold text-brand-primary font-numeric">
                            {req.amount_fcfa.toLocaleString()} ₣
                          </span>
                          <span
                            className={`uppercase text-[8px] font-black px-1.5 py-0.5 rounded ${req.payment_method === "mtn_momo" ? "bg-[#FFCC00] text-black" : "bg-[#FF6600] text-white"}`}
                          >
                            {req.payment_method === "mtn_momo"
                              ? "MTN"
                              : "Orange"}
                          </span>
                        </div>
                        <span className="text-[10px] text-brand-primary/40 block mt-0.5 font-numeric">
                          Requested:{" "}
                          {new Date(req.requested_at).toLocaleDateString()}
                        </span>
                        {req.rejection_reason && (
                          <span className="text-[9px] text-[#EF4444] font-semibold block mt-1 leading-normal">
                            Reason: {req.rejection_reason}
                          </span>
                        )}
                      </div>

                      <div>
                        {req.status === "pending" && (
                          <div className="flex flex-col items-end gap-1">
                            <span className="px-2 py-1 bg-amber-100 text-amber-800 text-[9px] font-extrabold rounded-full flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" /> Pending
                            </span>
                            <button
                              onClick={() => {
                                if (
                                  window.confirm(
                                    strings.payout_cancel_confirm,
                                  )
                                ) {
                                  try {
                                    dbService.reviewPayoutRequest(
                                      profile,
                                      req.id,
                                      "cancelled",
                                      "Cancelled by agent",
                                    );
                                    setPayoutRequests(
                                      dbService.getPayoutRequests(profile),
                                    );
                                    showBanner(
                                      strings.payout_cancelled,
                                      "success",
                                    );
                                  } catch (err: any) {
                                    showBanner(err.message, "error");
                                  }
                                }
                              }}
                              className="text-[9px] text-[#EF4444] hover:text-red-700 font-extrabold underline cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                        {req.status === "approved" && (
                          <span className="px-2 py-1 bg-emerald-100 text-emerald-800 text-[9px] font-extrabold rounded-full flex items-center gap-1">
                            <Check className="w-2.5 h-2.5" /> Approved
                          </span>
                        )}
                        {req.status === "rejected" && (
                          <span className="px-2 py-1 bg-red-100 text-red-800 text-[9px] font-extrabold rounded-full flex items-center gap-1">
                            <XCircle className="w-2.5 h-2.5" /> Rejected
                          </span>
                        )}
                        {req.status === "cancelled" && (
                          <span className="px-2 py-1 bg-gray-100 text-gray-500 text-[9px] font-extrabold rounded-full flex items-center gap-1">
                            <XCircle className="w-2.5 h-2.5" /> Cancelled
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* COMMISSION CONFIG */}
            <div className="bg-white rounded-3xl p-5 border border-brand-secondary/25 shadow-sm space-y-3">
              <h3 className="font-display font-extrabold text-xs uppercase tracking-wider text-brand-primary flex items-center gap-1.5">
                <Info className="w-4 h-4 text-brand-accent" />
                Active Commission Rates
              </h3>
              <div className="bg-brand-surface/30 rounded-2xl p-4 text-xs space-y-2 text-brand-primary">
                <div className="flex justify-between items-center">
                  <span className="text-brand-primary/70">
                    Registration Fee
                  </span>
                  <span className="font-black underline font-numeric">
                    {profile.commission_recruitment_fee?.toLocaleString() ||
                      1000}{" "}
                    FCFA
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-brand-surface/40">
                  <span className="text-brand-primary/70">
                    Registration Comm. Rate
                  </span>
                  <span className="font-black underline font-numeric">
                    {((profile.commission_deposit_pct !== undefined && profile.commission_deposit_pct !== null ? profile.commission_deposit_pct : 0.20) * 100).toFixed(
                      0,
                    )}
                    %
                  </span>
                </div>
              </div>
            </div>

            {/* THE PAYOUT MODAL OVERLAY */}
            {payoutModalOpen && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-start justify-center p-4 pt-12 sm:pt-20 overflow-y-auto z-50 animate-fade-in select-none">
                <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden border border-brand-secondary/20 shadow-xl p-6 space-y-4 MyPayoutForm">
                  <div className="flex justify-between items-center border-b border-brand-surface pb-3">
                    <h3 className="font-display font-black text-sm text-brand-primary">
                      Submit Payout Request
                    </h3>
                    <button
                      onClick={() => {
                        setPayoutModalOpen(false);
                        setCustomPayoutAmount("");
                      }}
                      className="p-1 rounded-full bg-brand-surface hover:bg-brand-surface/80 text-brand-primary cursor-pointer"
                    >
                      <XCircle className="w-5 h-5 text-brand-primary/50 hover:text-[#EF4444]" />
                    </button>
                  </div>

                  {/* FORM FIELDS */}
                  <div className="space-y-4">
                    {/* AMOUNT OPTION */}
                    {(() => {
                      const avail = Math.max(
                        0,
                        accruedCommissions -
                          payoutsTotal -
                          payoutRequests
                            .filter((r) => r.status === "pending")
                            .reduce((sum, r) => sum + r.amount_fcfa, 0),
                      );
                      return (
                        <>
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-brand-primary/80">
                              Requested Payout Type
                            </label>
                            <div className="grid grid-cols-2 bg-brand-surface/30 p-1 rounded-2xl text-[11px] font-bold select-none cursor-pointer">
                              <button
                                type="button"
                                onClick={() => {
                                  setPayoutFormType("total");
                                  setCustomPayoutAmount(avail.toString());
                                }}
                                className={`py-2 px-1 rounded-xl text-center flex items-center justify-center transition-all ${payoutFormType === "total" ? "bg-violet-700 text-white shadow-xs" : "text-brand-primary/60 hover:text-brand-primary"}`}
                              >
                                All ({avail.toLocaleString()} FCFA)
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setPayoutFormType("custom");
                                  setCustomPayoutAmount("");
                                }}
                                className={`py-2 px-1 rounded-xl text-center flex items-center justify-center transition-all ${payoutFormType === "custom" ? "bg-violet-700 text-white shadow-xs" : "text-brand-primary/60 hover:text-brand-primary"}`}
                              >
                                Custom
                              </button>
                            </div>
                          </div>

                          {/* AMOUNT VALUE FIELD (Prepopulated if 'All' is selected) */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-brand-primary/80">
                              Payout Amount (FCFA)
                            </label>
                            <input
                              type="number"
                              required
                              readOnly={payoutFormType === "total"}
                              placeholder={
                                payoutFormType === "total"
                                  ? avail.toLocaleString()
                                  : "E.g., 5,000"
                              }
                              value={customPayoutAmount}
                              onChange={(e) => {
                                if (payoutFormType === "custom") {
                                  setCustomPayoutAmount(e.target.value);
                                }
                              }}
                              className={`w-full text-xs p-3 rounded-xl border border-brand-secondary focus:outline-none focus:ring-1 focus:ring-brand-primary font-numeric ${payoutFormType === "total" ? "bg-brand-surface/40 text-brand-primary/50 font-bold border-brand-secondary/40 cursor-not-allowed" : "bg-white text-brand-primary"}`}
                            />
                            {payoutFormType === "total" && (
                              <p className="text-[10px] text-emerald-600 font-extrabold flex items-center gap-1 mt-0.5">
                                <Check className="w-3 h-3" /> Prefilled with all
                                available earnings.
                              </p>
                            )}
                          </div>
                        </>
                      );
                    })()}

                    {/* PAYOUT DESTINATION */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-brand-primary/80">
                        Payout Destination
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          id="btn-payout-dest-cash"
                          onClick={() => setPayoutFormDestination("cash")}
                          className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${payoutFormDestination === "cash" ? "border-brand-accent bg-brand-accent/10 text-brand-primary font-extrabold" : "border-brand-secondary/30 bg-white text-brand-primary/60"}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5h16.5M3.75 20.25h16.5M3.75 11.25h16.5m-16.5 4.5h16.5m-16.5-9h16.5" />
                          </svg>
                          <span className="text-[10px]">Cash Payout (Momo)</span>
                        </button>
                        <button
                          type="button"
                          id="btn-payout-dest-savings"
                          onClick={() => setPayoutFormDestination("savings")}
                          className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${payoutFormDestination === "savings" ? "border-emerald-600 bg-emerald-600/10 text-emerald-950 dark:text-emerald-200 font-extrabold" : "border-brand-secondary/30 bg-white text-brand-primary/60"}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-emerald-600">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.053.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
                          </svg>
                          <span className="text-[10px]">Transfer to Savings</span>
                        </button>
                      </div>
                    </div>

                    {payoutFormDestination === "cash" && (
                      <>
                        {/* PAYOUT GATEWAY */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-brand-primary/80">
                            Payout Payment Method
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {/* MTN Momo yellow */}
                            <button
                              type="button"
                              onClick={() => setPayoutFormMethod("mtn_momo")}
                              className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${payoutFormMethod === "mtn_momo" ? "border-[#FFCC00] bg-[#FFCC00]/10 text-black font-extrabold" : "border-brand-secondary/30 bg-white text-brand-primary/60"}`}
                            >
                              <span className="w-6 h-4 bg-[#FFCC00] rounded-sm text-black flex items-center justify-center text-[8px] font-black">
                                MTN
                              </span>
                              <span className="text-[10px]">{strings.mtn_label}</span>
                            </button>
                            {/* Orange Orange */}
                            <button
                              type="button"
                              onClick={() => setPayoutFormMethod("orange_money")}
                              className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${payoutFormMethod === "orange_money" ? "border-[#FF6600] bg-[#FF6600]/10 text-black font-extrabold" : "border-brand-secondary/30 bg-white text-brand-primary/60"}`}
                            >
                              <span className="w-6 h-4 bg-[#FF6600] rounded-sm text-white flex items-center justify-center text-[8px] font-black">
                                Orange
                              </span>
                              <span className="text-[10px]">{strings.orange_label}</span>
                            </button>
                          </div>
                        </div>

                        {/* GATEWAY PHONE */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-brand-primary/80">
                            Receiving Phone Number
                          </label>
                          <input
                            type="tel"
                            required
                            placeholder="E.g., +237..."
                            value={payoutFormPhone}
                            onChange={(e) => setPayoutFormPhone(e.target.value)}
                            className="w-full text-xs p-3 rounded-xl border border-brand-secondary focus:outline-none focus:ring-1 focus:ring-brand-primary font-numeric"
                          />
                        </div>
                      </>
                    )}

                    {/* ACTION BUTTON */}
                    <button
                      onClick={() => {
                        const avail = Math.max(
                          0,
                          accruedCommissions -
                            payoutsTotal -
                            payoutRequests
                              .filter((r) => r.status === "pending")
                              .reduce((sum, r) => sum + r.amount_fcfa, 0),
                        );
                        const amt =
                          payoutFormType === "total"
                            ? avail
                            : Number(customPayoutAmount);

                        if (!amt || isNaN(amt) || amt <= 0) {
                          showBanner(strings.payout_invalid_amount, "error");
                          return;
                        }
                        if (amt > avail) {
                          showBanner(
                            `Requested amount exceeds your maximum available balance (${avail.toLocaleString()} FCFA).`,
                            "error",
                          );
                          return;
                        }
                        if (
                          payoutFormDestination === "cash" &&
                          (!payoutFormPhone || payoutFormPhone.trim().length === 0)
                        ) {
                          showBanner(
                            strings.payout_phone_required,
                            "error",
                          );
                          return;
                        }

                        // Create actual payout request
                        try {
                          dbService.createPayoutRequest(
                            profile,
                            amt,
                            payoutFormDestination === "savings" ? "commission_transfer" : payoutFormMethod,
                            payoutFormType,
                            payoutFormDestination === "savings" ? "" : payoutFormPhone,
                            payoutFormDestination,
                          );
                          // Sync local data state immediately
                          const updatedRequests =
                            dbService.getPayoutRequests(profile);
                          setPayoutRequests(updatedRequests);

                          setPayoutModalOpen(false);
                          setCustomPayoutAmount("");
                          showBanner(
                            strings.payout_submitted,
                            "success",
                          );
                        } catch (err: any) {
                          showBanner(
                            err.message || strings.error,
                            "error",
                          );
                        }
                      }}
                      className="w-full py-3 bg-violet-700 hover:bg-violet-800 text-white font-extrabold text-xs rounded-2xl cursor-pointer shadow-md text-center transition-all uppercase tracking-wider"
                    >
                      Submit Payout Proposal
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CLIENT REGISTRATION FOR AGENTS */}
        {activeTab === "clients" && (
          <div className="bg-white rounded-3xl p-6 border border-brand-secondary/25 shadow-sm space-y-4 animate-fade-in">
            <h2 className="font-display font-extrabold text-base text-brand-primary flex items-center gap-2">
              <Users className="w-5 h-5 text-brand-accent" />
              {strings.new_client_registration}
            </h2>

            {!isBusinessHours && (
              <div className="space-y-3">
                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-amber-800 text-xs font-semibold flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold">{strings.x_operational_hours_restriction}</p>
                    <p className="font-normal text-[11px] mt-0.5 text-amber-700">{businessHoursMessage}</p>
                    <button
                      type="button"
                      onClick={() => setShowAppealForm(showAppealForm === 'registration' ? null : 'registration')}
                      className="mt-2 text-brand-accent font-black text-[11px] underline block cursor-pointer uppercase text-left"
                    >
                      {showAppealForm === 'registration' ? "Close Appeal Panel" : "Request Emergency Lockout Bypass"}
                    </button>
                  </div>
                </div>

                {showAppealForm === 'registration' && (
                  <div className="p-4 bg-brand-surface/40 rounded-2xl border border-brand-secondary/20 space-y-3">
                    <h4 className="font-bold text-xs text-brand-primary">Emergency Registration Lockout Bypass</h4>
                    <div className="space-y-2 text-xs text-brand-primary">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold opacity-60 block">Emergency Bypass Justification *</label>
                        <textarea
                          placeholder="Please explain why you need to register a member outside of regular business hours..."
                          rows={3}
                          value={appealReason}
                          onChange={(e) => setAppealReason(e.target.value)}
                          className="w-full bg-white border border-brand-secondary/20 rounded-xl px-3 py-2 focus:outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAppealSubmit('registration')}
                        className="w-full py-2 bg-brand-accent hover:bg-brand-accent/90 text-white font-extrabold text-[11px] uppercase tracking-wider rounded-xl cursor-pointer"
                      >
                        Submit Lockout Bypass Appeal
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <form
              onSubmit={handleAgentRegisterClient}
              className="space-y-4 pt-2 text-brand-primary"
            >
              <ValidatedInput
                id="input-client-name"
                label={strings.fullname}
                type="text"
                required
                placeholder={strings.client_name_placeholder}
                disabled={!isBusinessHours}
                value={regFullName}
                validationType="name"
                onChange={(e) => setRegFullName(e.target.value)}
              />

              <ValidatedInput
                id="input-client-phone"
                label={strings.phone}
                type="tel"
                required
                placeholder="677xxxxxx"
                disabled={!isBusinessHours}
                value={regPhone}
                validationType="phone"
                onChange={(e) => setRegPhone(myPhoneCleanup(e.target.value))}
              />

              <div className="space-y-3">
                <ValidatedInput
                  id="input-client-id"
                  label={strings.national_id}
                  type="text"
                  required
                  placeholder={strings.x_11digit_cni_number || "17-digit CNI card, or 10–20 character receipt code"}
                  disabled={!isBusinessHours}
                  value={regId}
                  validationType="cni"
                  docType={regDocType}
                  onChange={(e) => setRegId(e.target.value)}
                />

                <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-brand-surface/30 border border-brand-secondary/15">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-brand-primary/70 uppercase">
                      ID Document Type
                    </label>
                    <select
                      id="select-client-doctype"
                      required
                      disabled={!isBusinessHours}
                      value={regDocType}
                      onChange={(e) => setRegDocType(e.target.value as 'card' | 'receipt')}
                      className="w-full text-xs p-2.5 rounded-xl border border-brand-secondary focus:outline-none focus:ring-1 focus:ring-brand-primary bg-brand-surface text-brand-primary"
                    >
                      <option value="card">Original CNI Card</option>
                      <option value="receipt">CNI Receipt (Récépissé)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-brand-primary/70 uppercase">
                      Date of Issuance
                    </label>
                    <input
                      id="input-client-issuedate"
                      type="date"
                      required
                      disabled={!isBusinessHours}
                      max={new Date().toISOString().split('T')[0]}
                      value={regIssuedDate}
                      onChange={(e) => setRegIssuedDate(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-brand-secondary focus:outline-none focus:ring-1 focus:ring-brand-primary text-brand-primary font-numeric bg-brand-surface"
                    />
                  </div>
                </div>

                {regIssuedDate && (
                  <div className="text-[11px] text-brand-primary/75 bg-brand-primary/5 p-2 rounded-xl border border-brand-secondary/10 flex justify-between items-center">
                    <span>Computed Expiry:</span>
                    <span className="font-bold font-numeric text-brand-primary">
                      {(() => {
                        const date = new Date(regIssuedDate);
                        if (!isNaN(date.getTime())) {
                          if (regDocType === 'card') {
                            date.setFullYear(date.getFullYear() + (idValidationSettings?.card_duration_years ?? 10));
                          } else {
                            date.setMonth(date.getMonth() + (idValidationSettings?.receipt_duration_months ?? 3));
                          }
                          return date.toISOString().split('T')[0];
                        }
                        return '';
                      })()}
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-brand-primary/80">
                    {strings.birthday}
                  </label>
                  <CustomDateInput
                    id="input-client-bday"
                    required
                    disabled={!isBusinessHours}
                    value={regBday}
                    onChange={(e) => setRegBday(e.target.value)}
                    className="w-full text-xs p-3 rounded-xl border border-brand-secondary focus:outline-none focus:ring-1 focus:ring-brand-primary text-brand-primary font-numeric disabled:opacity-50 disabled:bg-brand-surface font-sans"
                  />
                </div>

                <div className="space-y-1.5 font-numeric relative z-20">
                  <label className="text-xs font-semibold text-brand-primary/80">
                    {strings.subdivision}
                  </label>
                  <GlassmorphismSelect
                    id="select-client-subdiv"
                    disabled={!isBusinessHours}
                    value={regSubdiv}
                    onChange={setRegSubdiv}
                    label={strings.subdivision_label}
                    placeholder={strings.subdivision_placeholder}
                    options={[
                      { value: "Ngaoundéré", label: "Ngaoundéré" },
                      { value: "Ngaoundal", label: "Ngaoundal" },
                      { value: "Meiganga", label: "Meiganga" },
                      { value: "Tibati", label: "Tibati" },
                      { value: "Tignéré", label: "Tignéré" },
                    ]}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-brand-primary/80 text-left block">
                  Locality / Neighborhood
                </label>
                <input
                  id="input-client-locality"
                  type="text"
                  required
                  placeholder="e.g. Baladji I, Sabongari, Dang, Center, Mboum..."
                  disabled={!isBusinessHours}
                  value={regLocality}
                  onChange={(e) => setRegLocality(e.target.value)}
                  className="w-full text-xs p-3 rounded-xl border border-brand-secondary focus:outline-none focus:ring-1 focus:ring-brand-primary text-brand-primary disabled:opacity-50 disabled:bg-brand-surface"
                />
              </div>

              {/* Photo Management Section */}
              <div className="bg-brand-surface/20 p-4 rounded-2xl border border-brand-secondary/10 space-y-3 text-left">
                <label className="text-xs font-semibold text-brand-primary/80 block">
                  Client Profile Photo
                </label>
                <div className="flex items-center gap-4">
                  {regPhotoUrl ? (
                    <div className="relative">
                      <div className="gradient-border-glow-avatar rounded-full p-[1.5px]">
                        <img
                          src={regPhotoUrl}
                          alt="Client Preview"
                          className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md aspect-square"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setRegPhotoUrl("")}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-600 text-white rounded-full flex items-center justify-center font-bold text-[9px] hover:bg-rose-700 shadow-sm z-10"
                        title="Delete Photo"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="gradient-border-glow-avatar rounded-full p-[1.5px]">
                      <div className="w-16 h-16 rounded-full bg-brand-secondary/10 flex items-center justify-center border-2 border-white shadow-md text-brand-primary/60 aspect-square">
                        <User className="w-8 h-8 text-brand-primary/40" />
                      </div>
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <input
                      type="file"
                      accept="image/*"
                      id="mobile-client-photo-uploader"
                      disabled={!isBusinessHours}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 1 * 1024 * 1024) {
                            showBanner("please reduce image size to less than 1 mb", "error");
                            return;
                          }
                          try {
                            const url = await uploadToSupabaseStorage(file);
                            setRegPhotoUrl(url);
                          } catch (err: any) {
                            showBanner("Photo processing failed: " + err.message, "error");
                          }
                        }
                      }}
                      className="hidden"
                    />
                    <label
                      htmlFor="mobile-client-photo-uploader"
                      className="px-3 py-1.5 bg-brand-primary hover:bg-brand-accent text-white font-bold rounded-lg cursor-pointer text-center text-[10px] transition-all"
                    >
                      Upload Photo
                    </label>
                    {regPhotoUrl && (
                      <button
                        type="button"
                        onClick={() => setRegPhotoUrl("")}
                        className="text-[10px] text-rose-600 dark:text-rose-400 font-bold hover:underline text-left"
                      >
                        Delete Reference
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 pt-1">
                <input
                  id="chk-no-app-access"
                  type="checkbox"
                  disabled={!isBusinessHours}
                  checked={regNoAppAccess}
                  onChange={(e) => setRegNoAppAccess(e.target.checked)}
                  className="w-4 h-4 rounded border-brand-secondary text-brand-primary focus:ring-brand-primary cursor-pointer accent-brand-primary"
                />
                <label
                  htmlFor="chk-no-app-access"
                  className="text-xs font-semibold text-brand-primary/80 cursor-pointer select-none"
                >
                  {strings.x_no_app_access_label || "This client does not have a smartphone / cannot use the app"}
                </label>
              </div>
              <div className="hidden">
                <div>
                  <select className="hidden"></select>
                </div>
              </div>

              <button
                id="btn-client-register"
                type="submit"
                disabled={!isBusinessHours}
                className={`w-full py-3 text-white text-xs font-bold rounded-xl uppercase tracking-wider transition-all ${!isBusinessHours ? "opacity-50 cursor-not-allowed bg-brand-primary" : "bg-brand-primary hover:bg-brand-accent cursor-pointer"}`}
              >
                Register profile
              </button>
            </form>

            {/* MY CLIENT PORTFOLIO / RECENT REGISTRATIONS */}
            <div className="mt-8 pt-6 border-t border-brand-secondary/10 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="font-display font-extrabold text-sm text-brand-primary flex items-center gap-2 text-left">
                  <Users className="w-4 h-4 text-brand-primary" />
                  My Client Portfolio
                </h3>

                <div className="flex justify-between items-center bg-brand-surface/40 p-1 rounded-xl border border-brand-secondary/10 w-full sm:w-auto">
                  <span className="text-[10px] font-bold text-brand-primary/60 px-2 uppercase">Show:</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setClientFilter("all")}
                      className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                        clientFilter === "all"
                          ? "bg-brand-primary text-white shadow-xs"
                          : "text-brand-primary/70 hover:bg-brand-surface"
                      }`}
                    >
                      All ({myClients.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setClientFilter("no_app_access")}
                      className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                        clientFilter === "no_app_access"
                          ? "bg-brand-primary text-white shadow-xs"
                          : "text-brand-primary/70 hover:bg-brand-surface"
                      }`}
                    >
                      No App Access ({myClients.filter((c) => c.has_app_access === false).length})
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                {myClients
                  .filter((cl) => clientFilter === "all" || cl.has_app_access === false)
                  .map((cl) => {
                    const queuedItem = dbService.syncQueue.find((q) => q.id === cl.id);
                    if (queuedItem && queuedItem.status !== "synced") {
                      return (
                        <div
                          key={cl.id}
                          className="p-4 bg-amber-50/60 rounded-2xl border border-amber-300/40 flex flex-col gap-2 shadow-xs text-left"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="text-xs font-bold text-amber-900">{cl.full_name}</h4>
                              <p className="text-[10px] text-amber-800/70 font-mono mt-0.5">
                                Phone: {cl.phone} | Subdiv: {cl.subdivision}
                              </p>
                              {cl.national_id && (
                                <p className="text-[10px] text-amber-800/60 font-mono">
                                  CNI: {cl.national_id}
                                </p>
                              )}
                            </div>
                            <span className="text-[8px] uppercase tracking-wider font-extrabold px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full">
                              {queuedItem.status === "failed" ? "Sync Failed" : "Pending Sync"}
                            </span>
                          </div>
                          {queuedItem.status === "failed" && (
                            <div className="pt-1.5 border-t border-amber-200/40 flex flex-col gap-1.5">
                              <p className="text-[10px] text-red-600 font-medium">
                                Reason: {queuedItem.error_message || "Duplicate phone number or business hours restriction"}
                              </p>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleResetAndRetry(cl.id);
                                }}
                                className="self-end px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[9px] font-bold rounded-lg uppercase tracking-wider transition-all cursor-pointer"
                              >
                                Retry Sync
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div
                        key={cl.id}
                        className="p-4 bg-white rounded-2xl border border-brand-secondary/15 flex flex-col gap-3 shadow-xs text-left"
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <div className="gradient-border-glow-avatar rounded-full p-[1.5px] shrink-0">
                            {cl.photo_url && (!dataSaverMode || tappedPhotos[cl.id]) ? (
                              <img src={cl.photo_url} alt={cl.full_name} className="w-8 h-8 rounded-full object-cover border border-brand-secondary/20 shrink-0" referrerPolicy="no-referrer" />
                            ) : (
                              <div 
                                onClick={() => cl.photo_url && setTappedPhotos(prev => ({ ...prev, [cl.id]: true }))}
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold uppercase shrink-0 transition-all ${
                                  cl.photo_url && dataSaverMode && !tappedPhotos[cl.id]
                                    ? "bg-brand-accent/20 border border-brand-accent text-brand-primary hover:bg-brand-accent/30 cursor-pointer"
                                    : "bg-brand-surface text-brand-primary/50"
                                }`}
                                title={cl.photo_url && dataSaverMode && !tappedPhotos[cl.id] ? "Data Saver: Click to load photo" : undefined}
                              >
                                {cl.photo_url && dataSaverMode && !tappedPhotos[cl.id] ? "DS" : cl.full_name.split(" ").map(n => n[0]).slice(0, 2).join("")}
                              </div>
                            )}
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-brand-primary">{cl.full_name}</h4>
                              <p className="text-[10px] text-brand-primary/60 font-mono mt-0.5">
                                Phone: {cl.phone} | Subdiv: {cl.subdivision}
                              </p>
                            </div>
                          </div>
                          <div className="text-right space-y-1.5 flex flex-col items-end">
                            <span className="text-[9px] bg-brand-surface text-brand-primary px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider font-mono">
                              {cl.unique_display_id}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className={`text-[9px] font-bold ${cl.has_app_access !== false ? "text-emerald-600" : "text-amber-600"}`}>
                                {cl.has_app_access !== false ? "App Enabled" : "App Disabled"}
                              </span>
                              <button
                                onClick={async () => {
                                  try {
                                    const currentAccess = cl.has_app_access !== false;
                                    const newAccess = !currentAccess;
                                    await dbService.updateProfile(profile, cl.id, { has_app_access: newAccess });
                                    showBanner("Client app access updated successfully!", "success");
                                    loadMyServiceData();
                                  } catch (err: any) {
                                    showBanner(err.message, "error");
                                  }
                                }}
                                className="text-[9px] font-black uppercase text-brand-primary hover:text-brand-accent underline cursor-pointer"
                              >
                                Toggle
                              </button>
                            </div>
                          </div>
                        </div>

                        {cl.has_app_access === false && (
                          <div className="pt-2 border-t border-brand-secondary/5 flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setDepClientId(cl.id);
                                setDepMethod("cash");
                                setActiveTab("deposit");
                              }}
                              className="px-3 py-1.5 bg-brand-primary hover:bg-brand-accent text-white font-bold text-[9px] uppercase rounded-lg transition-all cursor-pointer text-center"
                            >
                              Record Cash Collect
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                {myClients.filter((cl) => clientFilter === "all" || cl.has_app_access === false).length === 0 && (
                  <p className="text-xs text-brand-primary/50 text-center py-6 bg-brand-surface/30 rounded-2xl border border-dashed border-brand-secondary/15">
                    No clients found for the selected filter.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ACCOUNT TAB SHEET */}
        {activeTab === "account" && (
          <div className="space-y-6 animate-fade-in text-brand-primary">
            <div className="bg-white rounded-3xl p-6 border border-brand-secondary/25 shadow-sm space-y-4">
              <div className="flex items-center gap-4 border-b border-brand-surface pb-4">
                <div className="w-12 h-12 rounded-full bg-brand-surface border-2 border-brand-primary flex items-center justify-center text-brand-primary">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base">
                    {profile.full_name}
                  </h3>
                  <span className="text-xs bg-brand-primary/10 text-brand-primary px-3 py-0.5 rounded-full font-bold uppercase tracking-wider font-numeric">
                    {profile.unique_display_id}
                  </span>
                </div>
              </div>

              {/* Information listing */}
              <div className="space-y-3 pt-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-brand-primary/60">
                    Phone Registration
                  </span>
                  <span className="font-semibold">{profile.phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-brand-primary/60">{strings.branch_locality_label}</span>
                  <span className="font-semibold">
                    {
                      STATIC_BRANCHES.find((b) => b.id === profile.branch_id)
                        ?.name
                    }
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-brand-primary/60">
                    Subdivision Sector
                  </span>
                  <span className="font-semibold">{profile.subdivision}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-brand-primary/60">
                    Secure PIN Security active
                  </span>
                  <span className="font-semibold text-emerald-600 flex items-center gap-1">
                    <CheckCircle className="w-3 text-emerald-600" /> Yes
                  </span>
                </div>
              </div>

              {/* Dynamic Settings Card within account view */}
              <div className="border-t border-brand-secondary/20 pt-4 mt-4 space-y-4">
                <h4 className="font-display font-black text-xs text-brand-primary uppercase tracking-wider">
                  System Preferences
                </h4>

                <div className="space-y-2">
                  <span className="text-xs font-bold text-brand-primary/85 block">
                    App Interface Language
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      id="app-lang-en"
                      type="button"
                      onClick={() => onChangeLanguage("en")}
                      className={`py-2 text-[10px] uppercase rounded-xl border cursor-pointer text-center transition-all ${language === "en" ? "active-lang-btn !border-white shadow-md font-black" : "bg-white/5 text-violet-200/75 border-white/10 hover:bg-white/10 hover:text-white font-bold"}`}
                    >
                      ENGLISH
                    </button>
                    <button
                      id="app-lang-fr"
                      type="button"
                      onClick={() => onChangeLanguage("fr")}
                      className={`py-2 text-[10px] uppercase rounded-xl border cursor-pointer text-center transition-all ${language === "fr" ? "active-lang-btn !border-white shadow-md font-black" : "bg-white/5 text-violet-200/75 border-white/10 hover:bg-white/10 hover:text-white font-bold"}`}
                    >
                      FRANÇAIS
                    </button>
                    <button
                      id="app-lang-ff"
                      type="button"
                      onClick={() => onChangeLanguage("ff")}
                      className={`py-2 text-[10px] uppercase rounded-xl border cursor-pointer text-center transition-all ${language === "ff" ? "active-lang-btn !border-white shadow-md font-black" : "bg-white/5 text-violet-200/75 border-white/10 hover:bg-white/10 hover:text-white font-bold"}`}
                    >
                      FULFULDE
                    </button>
                  </div>
                </div>

                <div className="space-y-3 border-t border-brand-secondary/15 pt-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5 pr-2">
                      <span className="text-xs font-bold text-brand-primary/85 block">
                        Data Saver Mode (Bandwidth Optimizer)
                      </span>
                      <span className="text-[10px] text-brand-primary/65 block leading-normal">
                        Reduces remote sync polling rates, optimizes API payload sizes, and lazy-loads member photos only when clicked.
                      </span>
                    </div>
                    <div className="flex items-center shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const newVal = !dataSaverMode;
                          setDataSaverMode(newVal);
                          localStorage.setItem("ngaccul_data_saver_enabled", String(newVal));
                          localStorage.setItem("ng_data_saver_mode", String(newVal));
                          showBanner(newVal ? "Data Saver activated! Bandwidth optimized." : "Data Saver deactivated. Standard polling restored.", "success");
                        }}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          dataSaverMode ? "bg-emerald-600" : "bg-brand-primary/20"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                            dataSaverMode ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center bg-brand-surface/30 p-3 rounded-2xl border border-brand-secondary/15">
                  <div>
                    <span className="text-xs font-bold text-brand-primary/85 block">
                      {strings.dark_appearance || "Dark Appearance"}
                    </span>
                    <span className="text-[10px] text-brand-primary/50 block">
                      {strings.dark_guidelines || "Locked to Dark Corporate Theme Guidelines"}
                    </span>
                  </div>
                  <span className="px-3 py-1.5 bg-brand-accent/20 text-brand-accent rounded-xl text-[10px] font-extrabold uppercase tracking-wider">
                    {strings.always_dark || "Always Dark"}
                  </span>
                </div>
              </div>

              {/* ACCOUNT PIN RESET SECURITY PANEL §1.4 */}
              <div className="bg-[#150B2E] border border-brand-accent/30 rounded-2xl p-5 mt-4 space-y-3.5 shadow-md">
                <div className="flex items-center gap-1.5 text-xs font-black text-white uppercase tracking-wide">
                  <KeyRound className="w-4 h-4 text-brand-accent transform scale-x-[-1]" />
                  <span>{strings.change_account_secure_pin || "Change Account Secure PIN"}</span>
                </div>
                <p className="text-[10px] text-gray-300 leading-relaxed font-sans">
                  {strings.change_pin_desc || "Keeping your 6-digit transaction authorization and login PIN secure is highly paramount. Provide your current PIN to update."}
                </p>

                <form onSubmit={handleSelfPINResetSubmit} className="space-y-3.5 text-left">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-white/90">{strings.current_pin_label || "Current 6-Digit PIN"}</label>
                    <PasswordInput
                      id="reset-old-pin"
                      maxLength={6}
                      required
                      placeholder={strings.x_placeholder_dots}
                      value={oldPin}
                      onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ""))}
                      className="w-full text-center text-sm p-2 rounded-xl border border-brand-accent/50 bg-[#191136] text-white placeholder-white/30 font-mono tracking-widest select-none focus:outline-none focus:ring-1 focus:ring-brand-accent"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-white/90">{strings.new_pin_label_form || "New 6-Digit PIN"}</label>
                      <PasswordInput
                        id="reset-new-pin"
                        maxLength={6}
                        required
                        placeholder={strings.x_placeholder_dots}
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                        className="w-full text-center text-sm p-2 rounded-xl border border-brand-accent/50 bg-[#191136] text-white placeholder-white/30 font-mono tracking-widest select-none focus:outline-none focus:ring-1 focus:ring-brand-accent"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-white/90">{strings.confirm_pin_label_form || "Confirm New PIN"}</label>
                      <PasswordInput
                        id="reset-new-pin-confirm"
                        maxLength={6}
                        required
                        placeholder={strings.x_placeholder_dots}
                        value={confirmNewPin}
                        onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, ""))}
                        className="w-full text-center text-sm p-2 rounded-xl border border-brand-accent/50 bg-[#191136] text-white placeholder-white/30 font-mono tracking-widest select-none focus:outline-none focus:ring-1 focus:ring-brand-accent"
                      />
                    </div>
                  </div>

                  <button
                    id="btn-self-submit-pin-reset"
                    type="submit"
                    className="w-full py-2 bg-brand-accent hover:bg-brand-accent/90 text-white font-extrabold text-xs rounded-xl cursor-pointer transition-all uppercase tracking-wide font-sans"
                  >
                    {strings.confirm_pin_mod_btn || "Confirm Secure PIN Modification"}
                  </button>
                </form>
              </div>

              {/* EMERGENCY BYPASS APPEALS HISTORY */}
              <div className="bg-white rounded-2xl border border-brand-secondary/25 p-5 mt-4 space-y-3 shadow-xs text-left">
                <div className="flex items-center gap-1.5 text-xs font-black text-brand-primary uppercase tracking-wide border-b border-brand-surface pb-2">
                  <Clock className="w-4 h-4 text-brand-accent" />
                  <span>Your Bypass Appeals History</span>
                </div>
                {myAppeals.length === 0 ? (
                  <p className="text-[10px] text-brand-primary/50 text-center py-4 italic">
                    You have not submitted any business hours bypass appeals yet.
                  </p>
                ) : (
                  <div className="space-y-2.5 max-h-48 overflow-y-auto custom-scrollbar">
                    {myAppeals.map((app) => (
                      <div key={app.id} className="p-3 bg-brand-surface/40 rounded-xl border border-brand-secondary/15 flex flex-col gap-1 text-[11px]">
                        <div className="flex justify-between items-center">
                          <span className="font-extrabold uppercase text-[10px] text-brand-accent">
                            {app.transaction_type} appeal
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                            app.status === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                            app.status === 'rejected' ? 'bg-rose-100 text-rose-800' :
                            app.status === 'used' ? 'bg-blue-100 text-blue-800' :
                            'bg-amber-100 text-amber-800 animate-pulse'
                          }`}>
                            {app.status}
                          </span>
                        </div>
                        {app.amount_fcfa && (
                          <div className="font-semibold text-brand-primary/70">
                            Amount: <span className="font-mono">{app.amount_fcfa.toLocaleString()} FCFA</span>
                          </div>
                        )}
                        <div className="text-brand-primary/80">
                          Reason: "{app.reason}"
                        </div>
                        {app.review_notes && (
                          <div className="mt-1 p-1.5 bg-white/70 rounded-lg text-[10px] border border-brand-secondary/10 italic text-brand-primary/70">
                            BM Notes: {app.review_notes}
                          </div>
                        )}
                        <div className="text-[9px] text-brand-primary/45 font-mono text-right mt-1">
                          Submitted {new Date(app.submitted_at).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                id="btn-account-logout-actual"
                onClick={onLogout}
                className="w-full mt-4 py-2.5 bg-[#B42318] text-white text-xs font-bold rounded-xl cursor-pointer hover:bg-red-800 transition-all uppercase tracking-wider"
              >
                {strings.logout}
              </button>
            </div>

            {/* PWA help and installation cards */}
            <div className="bg-brand-surface/40 rounded-2xl p-4 border border-brand-secondary/20 flex items-center justify-between text-xs text-brand-primary">
              <h4 className="font-display font-semibold flex items-center gap-1.5">
                <HelpCircle className="w-4 animate-pulse text-brand-accent" /> {strings.install_app_device || "Install App to Device"}
              </h4>
              <div className="relative group/tooltip inline-block">
                <Info className="w-4 h-4 text-brand-accent hover:text-brand-primary cursor-help transition-colors" />
                {/* Tooltip Popup */}
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2.5 pointer-events-none opacity-0 group-hover/tooltip:opacity-100 transition-all duration-300 translate-y-1 group-hover/tooltip:translate-y-0 z-50 w-44 sm:w-52 text-center">
                  <div className="bg-slate-900 border border-slate-700 text-white text-[10px] px-2.5 py-1.5 rounded-lg shadow-xl whitespace-normal break-words leading-normal">
                    {strings.pwa_tooltip_desc || "Launch this app directly as a standalone PWA on Android or Apple device by adding to your home screen."}
                  </div>
                  {/* Arrow */}
                  <div className="w-1.5 h-1.5 bg-slate-900 border-r border-b border-slate-700 rotate-45 mx-auto -mt-1" />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* DETAILED TRANSACTION RECEIPT MODAL CONCEPT (§0) */}
      {selectedTx && (
        <div className="fixed inset-0 bg-[#150B2E]/65 backdrop-blur-md z-50 flex items-center justify-center p-6 animate-fade-in">
          <div
            id="receipt-modal-container"
            className="glass-ui-card rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl p-6 space-y-4 text-brand-primary animate-scale-up"
          >
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <img
                  src="/branding/logo.svg"
                  alt={strings.x_ngaccul_alt}
                  className="w-8 h-8 rounded-full"
                />
                <span className="font-display font-extrabold text-xs text-brand-primary">
                  {strings.savings_receipt_title || "NGACCUL SAVINGS Receipt"}
                </span>
              </div>
              <button
                onClick={() => setSelectedTx(null)}
                className="text-brand-accent hover:text-brand-primary font-bold text-sm cursor-pointer border rounded-full p-1 bg-brand-surface"
              >
                {strings.close_label || "Close"}
              </button>
            </div>

            {/* Receipt body details */}
            <div className="border-t border-b border-dashed border-brand-secondary/30 py-4 text-center space-y-2">
              <span className="text-[10px] text-brand-primary/50 uppercase tracking-widest font-semibold block">
                {strings.disbursed_transaction || "Disbursed transaction"}
              </span>
              <h3 className="text-3xl font-display font-extrabold text-brand-primary font-numeric">
                {selectedTx.amount.toLocaleString()}{" "}
                <span className="text-xs">{strings.x_fcfa}</span>
              </h3>
              <span
                className={`inline-block text-[10px] uppercase font-bold px-3 py-1 rounded-full ${
                  selectedTx.status === "confirmed"
                    ? "bg-[#EBF6ED] text-[#1A7A4A]"
                    : (selectedTx.status === "pending" && !(selectedTx.payment_ref && locallyCancelledRefs.includes(selectedTx.payment_ref)))
                      ? "bg-[#FEF6EC] text-[#C97A10]"
                      : "bg-[#FDF2F2] text-[#B42318]"
                }`}
              >
                {getStatusLabel(selectedTx.status, strings, selectedTx.payment_ref)}
              </span>
            </div>

            <div className="space-y-2 text-xs font-numeric">
              <div className="flex justify-between">
                <span className="text-brand-primary/50">{strings.receipt_number_label}</span>
                <span className="font-bold uppercase font-mono">
                  {selectedTx.id.slice(0, 18)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-primary/50">{strings.timestamp_label || "Timestamp"}</span>
                <span>{new Date(selectedTx.created_at).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-primary/50">{strings.payment_scheme_label}</span>
                <span className="uppercase">
                  {selectedTx.payment_method || strings.cash_label}
                </span>
              </div>
              {selectedTx.payment_ref && (
                <div className="flex justify-between">
                  <span className="text-brand-primary/50">
                    {strings.x_gateway_reference}
                  </span>
                  <span>{selectedTx.payment_ref}</span>
                </div>
              )}
              {selectedTx.approved_by && (
                <div className="flex justify-between">
                  <span className="text-brand-primary/50">
                    {strings.x_authorized_staff}
                  </span>
                  <span className="font-mono text-[10px]">
                    {selectedTx.approved_by.slice(0, 8)}
                  </span>
                </div>
              )}
            </div>

            {/* Dispute actions inside receipt modal for clients §6.1 step 5 */}
            {profile.role === "client" && selectedTx.status === "pending" && (
              <div className="pt-2 border-t border-dashed border-brand-secondary/20">
                {disputeTxId ? (
                  <div className="space-y-3">
                    <textarea
                      id="input-dispute-reason"
                      required
                      placeholder={strings.dispute_placeholder}
                      value={disputeNote}
                      onChange={(e) => setDisputeNote(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-brand-secondary/20 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/30 transition-all bg-white text-brand-primary"
                    />
                    <button
                      id="btn-submit-dispute"
                      onClick={handleDisputeSubmit}
                      className="w-full py-1.5 bg-[#B42318] text-white text-xs font-bold rounded-lg cursor-pointer"
                    >
                      {strings.x_submit_dispute_complaint}
                    </button>
                  </div>
                ) : (
                  <button
                    id="btn-dispute-trigger"
                    onClick={() => {
                      if (window.confirm(strings.dispute_confirm)) {
                        setDisputeTxId(selectedTx.id);
                      }
                    }}
                    className="w-full py-2 bg-brand-accent/10 hover:bg-[#B42318]/5 text-brand-accent font-bold text-xs rounded-xl cursor-pointer border border-[#B42318]/20 transition-all"
                  >
                    {strings.x_declare_transaction_discrepancy_dispute}
                  </button>
                )}
              </div>
            )}

            {/* Correction actions inside receipt modal for agents */}
            {profile.role === "agent" &&
              selectedTx.type === "deposit" &&
              selectedTx.client_had_app_access === false &&
              (selectedTx.agent_id === profile.id || selectedTx.created_by === profile.id) && (() => {
                const existingCorrection = dbService.getDepositCorrectionRequests(profile).find(r => r.transaction_id === selectedTx.id);
                return (
                  <div className="pt-2 border-t border-dashed border-brand-secondary/20">
                    {existingCorrection ? (
                      <div className="p-3 bg-brand-surface/40 rounded-2xl border border-brand-secondary/10 space-y-1 text-left">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-primary/50 block">
                          {strings.x_correction_request_status || "Correction Request Status"}
                        </span>
                        <div className="flex justify-between items-center">
                          <span className={`text-xs font-bold uppercase ${
                            existingCorrection.status === "pending" ? "text-amber-600" :
                            existingCorrection.status === "approved" ? "text-emerald-600" : "text-red-600"
                          }`}>
                            {existingCorrection.status}
                          </span>
                          <span className="text-[10px] text-brand-primary/60">
                            {new Date(existingCorrection.requested_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-[11px] text-brand-primary/80 italic mt-1">
                          {strings.x_reason || "Reason"}: "{existingCorrection.reason}"
                        </p>
                        {existingCorrection.requested_amount !== undefined && (
                          <p className="text-[11px] text-brand-primary/80 mt-0.5">
                            {strings.x_suggested || "Suggested"}: <span className="font-bold">{existingCorrection.requested_amount.toLocaleString()} FCFA</span>
                          </p>
                        )}
                        {existingCorrection.rejection_reason && (
                          <p className="text-[11px] text-red-600 mt-1">
                            {strings.x_rejection_reason || "Rejection Reason"}: "{existingCorrection.rejection_reason}"
                          </p>
                        )}
                      </div>
                    ) : correctionTxId ? (
                      <div className="space-y-3">
                        {selectedTx.status === "confirmed" && (
                          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-left text-[11px] text-amber-800 font-medium">
                            {strings.x_deposit_confirmed_correction_notice || "This deposit was already confirmed and added to the client's balance. Submitting a correction will adjust their balance by the difference once approved."}
                          </div>
                        )}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-brand-primary/50 block text-left">
                            {strings.x_reason_for_review || "Reason for review"}
                          </label>
                          <div className="gradient-border-glow-field rounded-xl">
                            <textarea
                              id="input-correction-reason"
                              required
                              placeholder="Please explain the discrepancy (e.g., entered wrong digit)..."
                              value={correctionReason}
                              onChange={(e) => setCorrectionReason(e.target.value)}
                              className="w-full text-xs p-2.5 rounded-xl border border-brand-secondary/20 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/30 transition-all bg-white text-brand-primary relative z-[2]"
                              rows={2}
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-brand-primary/50 block text-left">
                            {strings.x_suggested_correct_amount_optional || "Suggested Correct Amount (FCFA) - Optional"}
                          </label>
                          <div className="gradient-border-glow-field rounded-xl">
                            <input
                              id="input-correction-amount"
                              type="number"
                              placeholder="e.g. 50000"
                              value={correctionAmount}
                              onChange={(e) => setCorrectionAmount(e.target.value)}
                              className="w-full text-xs p-2.5 rounded-xl border border-brand-secondary/20 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/30 transition-all bg-white text-brand-primary relative z-[2]"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setCorrectionTxId(null)}
                            className="flex-1 py-1.5 border border-brand-secondary/20 text-brand-primary font-bold text-xs rounded-xl cursor-pointer hover:bg-brand-surface transition-all"
                          >
                            {strings.cancel}
                          </button>
                          <button
                            type="button"
                            id="btn-submit-correction"
                            onClick={handleCorrectionSubmit}
                            className="flex-1 py-1.5 bg-brand-primary text-white text-xs font-bold rounded-xl cursor-pointer hover:bg-brand-accent transition-all"
                          >
                            {strings.x_submit_request || "Submit Request"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        id="btn-correction-trigger"
                        onClick={() => {
                          setCorrectionTxId(selectedTx.id);
                          setCorrectionReason("");
                          setCorrectionAmount("");
                        }}
                        className="w-full py-2 bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary font-bold text-xs rounded-xl cursor-pointer border border-brand-primary/20 transition-all"
                      >
                        {strings.x_request_review_discrepancy || "Request Review (Discrepancy)"}
                      </button>
                    )}
                  </div>
                );
              })()}

            <button
              id="btn-download-receipt"
              onClick={() => {
                showBanner(
                  "Triggering device print controller for secure receipt PDF conversion.",
                  "success",
                );
                window.print();
              }}
              className="w-full py-2 bg-brand-surface hover:bg-brand-secondary/30 text-brand-primary font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer border border-brand-secondary/20"
            >
              <FileText className="w-4 h-4" /> Download PDF Invoice Letterhead
            </button>
          </div>
        </div>
      )}

      {/* LOAN REPAYMENTS MODAL SUMMARY */}
      {selectedLoan && (
        <div className="fixed inset-0 bg-[#150B2E]/65 backdrop-blur-md z-50 flex items-center justify-center p-6 animate-fade-in">
          <div className="glass-ui-card rounded-3xl w-full max-w-md p-6 overflow-hidden shadow-2xl space-y-4 text-brand-primary animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-brand-surface pb-3">
              <div>
                <h3 className="font-display font-extrabold text-sm text-brand-primary">
                  Cooperative Loan Repayment Schedule
                </h3>
                <span className="text-[10px] text-brand-primary/50 block font-numeric">
                  LOAN ID: #{selectedLoan.id.slice(0, 12)}
                </span>
              </div>
              <button
                onClick={() => {
                  setSelectedLoan(null);
                  setRepayError("");
                  setRepaySuccess("");
                  setRepayAmount("");
                }}
                className="bg-brand-surface hover:bg-brand-surface/80 text-brand-accent font-bold text-[10px] border border-brand-secondary/10 rounded-full px-2.5 py-1 cursor-pointer transition-all"
              >
                Close
              </button>
            </div>

            <div className="space-y-1">
              <p className="text-xs italic capitalize">
                &ldquo;{selectedLoan.purpose}&rdquo;
              </p>
              <div className="flex justify-between items-center bg-brand-surface/20 p-2 rounded-xl text-[11px] font-numeric">
                <div>
                  <span className="text-gray-400 block text-[9px] uppercase font-bold">Principal Loan Amount</span>
                  <span className="text-brand-primary font-bold">{selectedLoan.amount.toLocaleString()} FCFA</span>
                </div>
                <div className="text-right">
                  <span className="text-gray-400 block text-[9px] uppercase font-bold">Outstanding Balance</span>
                  <span className="text-brand-accent font-extrabold">
                    {(() => {
                      const repList = dbService.getLoanRepayments(profile, selectedLoan.id);
                      const tDue = repList.reduce((sum, r) => sum + r.amount_due, 0);
                      const tPaid = repList.filter((r) => r.status === "confirmed").reduce((sum, r) => sum + r.amount_paid, 0);
                      return Math.max(0, tDue - tPaid).toLocaleString();
                    })()}{" "}
                    FCFA
                  </span>
                </div>
              </div>
            </div>

            {/* Mini repayment installments scheduler grid */}
            <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
              {dbService
                .getLoanRepayments(profile, selectedLoan.id)
                .map((installment, idx) => (
                  <div
                    key={installment.id}
                    className="p-2.5 bg-brand-surface/30 rounded-lg flex justify-between items-center text-xs border border-brand-surface"
                  >
                    <div>
                      <span className="font-bold font-numeric">
                        Installment #{idx + 1}
                      </span>
                      <span className="text-[9px] text-brand-primary/50 block font-numeric">
                        Due range: {installment.due_date}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-brand-primary font-numeric">
                        {installment.amount_due.toLocaleString()} FCFA
                      </span>
                      <span
                        className={`text-[8px] font-bold block uppercase ${
                          installment.status === "confirmed"
                            ? "text-[#1A7A4A]"
                            : "text-brand-accent"
                        }`}
                      >
                        {installment.status}
                      </span>
                    </div>
                  </div>
                ))}
            </div>

            {selectedLoan.status === "active" && !confirmedLoanIds.includes(selectedLoan.id) && (
              <button
                onClick={() => handleConfirmLoanReceipt(selectedLoan.id)}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 shadow-sm"
              >
                ✓ Confirm I Received My Loan
              </button>
            )}

            {/* Self-Service Repayment Form */}
            {selectedLoan.status === "active" && (
              <div className="border-t border-brand-secondary/15 pt-3 space-y-3">
                <h4 className="font-display font-extrabold text-xs text-[#7C4DCC] flex items-center gap-1">
                  💳 Client Self-Service Repayment
                </h4>

                {repayError && (
                  <div className="p-2 bg-rose-50 text-rose-700 text-[10px] font-semibold rounded-lg border border-rose-200">
                    {repayError}
                  </div>
                )}

                {repaySuccess && (
                  <div className="p-2 bg-emerald-50 text-emerald-700 text-[10px] font-semibold rounded-lg border border-emerald-200">
                    {repaySuccess}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-[10px] font-medium">
                  <button
                    type="button"
                    onClick={() => setRepaySource("account_balance")}
                    className={`py-1.5 rounded-lg border text-center transition-all cursor-pointer ${
                      repaySource === "account_balance"
                        ? "bg-[#7C4DCC]/10 text-[#7C4DCC] border-[#7C4DCC]"
                        : "bg-brand-surface border-brand-secondary/10 text-brand-primary/60 hover:bg-brand-surface/80"
                    }`}
                  >
                    Account Balance
                  </button>
                  <button
                    type="button"
                    onClick={() => setRepaySource("new_deposit")}
                    className={`py-1.5 rounded-lg border text-center transition-all cursor-pointer ${
                      repaySource === "new_deposit"
                        ? "bg-[#7C4DCC]/10 text-[#7C4DCC] border-[#7C4DCC]"
                        : "bg-brand-surface border-brand-secondary/10 text-brand-primary/60 hover:bg-brand-surface/80"
                    }`}
                  >
                    Mobile Money
                  </button>
                </div>

                {repaySource === "account_balance" ? (
                  <div className="text-[10px] text-brand-primary/60 leading-snug bg-[#7C4DCC]/5 p-2 rounded-lg border border-[#7C4DCC]/10">
                    Available Account Balance: <strong className="text-brand-primary font-numeric font-extrabold">{(myBalance ? myBalance.balance - (myBalance.locked_amount || 0) : 0).toLocaleString()} FCFA</strong>
                    <span className="block text-[8px] mt-0.5 text-gray-400 font-medium">Locked Collateral: {(myBalance?.locked_amount || 0).toLocaleString()} FCFA is reserved and non-withdrawable.</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setRepayMethod("mtn")}
                        className={`py-1.5 rounded-lg border text-center text-[10px] transition-all cursor-pointer ${
                          repayMethod === "mtn"
                            ? "bg-amber-100/40 text-amber-800 border-amber-300 font-bold"
                            : "bg-brand-surface border-brand-secondary/10 text-brand-primary/60 hover:bg-brand-surface/80"
                        }`}
                      >
                        MTN Mobile Money
                      </button>
                      <button
                        type="button"
                        onClick={() => setRepayMethod("orange")}
                        className={`py-1.5 rounded-lg border text-center text-[10px] transition-all cursor-pointer ${
                          repayMethod === "orange"
                            ? "bg-orange-100/40 text-orange-800 border-orange-300 font-bold"
                            : "bg-brand-surface border-brand-secondary/10 text-brand-primary/60 hover:bg-brand-surface/80"
                        }`}
                      >
                        Orange Money
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="MOMO Phone Number"
                      value={repayPhone}
                      onChange={(e) => setRepayPhone(e.target.value)}
                      className="w-full text-xs p-2 rounded-xl border border-brand-secondary/15 text-brand-primary font-numeric focus:outline-none focus:ring-1 focus:ring-brand-accent bg-brand-surface/30"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-bold text-brand-primary/50 block">
                    Payment Amount (FCFA)
                  </label>
                  <input
                    type="number"
                    placeholder="Enter custom amount"
                    value={repayAmount}
                    onChange={(e) => setRepayAmount(e.target.value)}
                    className="w-full text-xs p-2 rounded-xl border border-brand-secondary/15 text-brand-primary font-numeric focus:outline-none focus:ring-1 focus:ring-brand-accent bg-brand-surface/30"
                  />
                  <div className="flex gap-1.5 pt-1 overflow-x-auto">
                    {(() => {
                      const repList = dbService.getLoanRepayments(profile, selectedLoan.id);
                      const nextPen = repList.find((r) => r.status !== "confirmed");
                      const tDue = repList.reduce((sum, r) => sum + r.amount_due, 0);
                      const tPaid = repList.filter((r) => r.status === "confirmed").reduce((sum, r) => sum + r.amount_paid, 0);
                      const outAmt = Math.max(0, tDue - tPaid);
                      return (
                        <>
                          {nextPen && (
                            <button
                              type="button"
                              onClick={() => setRepayAmount(nextPen.amount_due.toString())}
                              className="px-2 py-1 bg-brand-surface hover:bg-brand-surface/80 border border-brand-secondary/10 text-brand-primary/60 text-[9px] font-semibold rounded-lg cursor-pointer shrink-0"
                            >
                              Pay Next Installment ({nextPen.amount_due.toLocaleString()} FCFA)
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setRepayAmount(outAmt.toString())}
                            className="px-2 py-1 bg-brand-surface hover:bg-brand-surface/80 border border-brand-secondary/10 text-brand-primary/60 text-[9px] font-semibold rounded-lg cursor-pointer shrink-0"
                          >
                            Pay Full ({outAmt.toLocaleString()} FCFA)
                          </button>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {(() => {
                  const repList = dbService.getLoanRepayments(profile, selectedLoan.id);
                  const nextPen = repList.find((r) => r.status !== "confirmed");
                  const tDue = repList.reduce((sum, r) => sum + r.amount_due, 0);
                  const tPaid = repList.filter((r) => r.status === "confirmed").reduce((sum, r) => sum + r.amount_paid, 0);
                  const outAmt = Math.max(0, tDue - tPaid);
                  return (
                    <button
                      type="button"
                      disabled={isRepaying || outAmt <= 0 || !nextPen}
                      onClick={() => {
                        if (nextPen) {
                          handleSelfServiceRepay(nextPen.id);
                        }
                      }}
                      className={`w-full py-2.5 rounded-xl text-xs font-bold text-white transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        isRepaying || outAmt <= 0 || !nextPen
                          ? "bg-brand-primary/50 cursor-not-allowed"
                          : "bg-brand-primary hover:bg-brand-primary/90 shadow-sm"
                      }`}
                    >
                      {isRepaying ? (
                        <>
                          <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                          Processing Repayment...
                        </>
                      ) : (
                        "Submit Repayment"
                      )}
                    </button>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* LOAN TERMS AND CONDITIONS OVERLAY MODAL */}
      {termsModalOpen && (
        <div className="fixed inset-0 bg-[#150B2E]/70 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 overflow-hidden shadow-2xl flex flex-col max-h-[90vh] text-brand-primary border border-brand-secondary/15 animate-scale-up">
            <div className="flex justify-between items-center border-b border-brand-surface pb-3 mb-4">
              <h3 className="font-display font-black text-sm text-brand-primary leading-tight">
                NGACCUL Loan Terms &amp; Conditions
              </h3>
              <button
                onClick={() => {
                  setTermsModalOpen(false);
                }}
                className="bg-neutral-100 hover:bg-neutral-200 text-neutral-800 dark:text-neutral-800 font-bold border border-neutral-300 rounded-xl px-3 py-1 text-xs cursor-pointer transition-all"
              >
                Cancel
              </button>
            </div>

            <div
              onScroll={handleTermsScroll}
              className="flex-1 overflow-y-auto p-4 border border-brand-secondary/10 bg-brand-surface/20 rounded-2xl mb-4 text-xs leading-relaxed space-y-3"
            >
              {activeLoanTerms ? (
                <div dangerouslySetInnerHTML={{ __html: ensureSafeLinks(activeLoanTerms.content_html) }} />
              ) : (
                <p className="text-[#7C4DCC] italic text-center py-10 font-bold">No active Terms agreements published.</p>
              )}
            </div>

            <div className="pt-2">
              <button
                disabled={!termsScrolledToBottom}
                onClick={() => {
                  setTermsChecked(true);
                  setTermsModalOpen(false);
                }}
                className={`w-full py-3 text-xs font-bold rounded-xl uppercase tracking-wider transition-all duration-200 ${
                  termsScrolledToBottom
                    ? "bg-emerald-600 text-white cursor-pointer hover:bg-emerald-700 shadow-sm"
                    : "bg-brand-secondary/40 text-brand-primary/30 cursor-not-allowed"
                }`}
              >
                {termsScrolledToBottom ? "I Agree & Close" : "Scroll to bottom to agree"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OPTIMIZED BOTTOM NAVIGATION TAB BAR */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-brand-secondary/20 px-4 py-2 flex justify-around items-center z-40 rounded-t-3xl shadow-[0_-5px_15px_rgba(0,0,0,0.02)]">
        {profile.role === "client" ? (
          <>
            <motion.button
              id="bottom-tab-home"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setActiveTab("home")}
              className={`flex flex-col items-center gap-1 p-2 cursor-pointer transition-all ${activeTab === "home" ? "text-brand-primary font-bold" : "text-brand-primary/40 hover:text-brand-primary/60"}`}
            >
              <Home className="w-5 h-5" />
              <span className="text-[10px]">{strings.client_home}</span>
            </motion.button>
            <div className="relative group/tooltip">
              <motion.button
                id="bottom-tab-deposit"
                whileHover={selfDepositLockSettings.client_locked ? {} : { scale: 1.1 }}
                whileTap={selfDepositLockSettings.client_locked ? {} : { scale: 0.9 }}
                disabled={selfDepositLockSettings.client_locked}
                onClick={() => {
                  if (!selfDepositLockSettings.client_locked) setActiveTab("deposit");
                }}
                className={`flex flex-col items-center gap-1 p-2 transition-all ${
                  selfDepositLockSettings.client_locked
                    ? "text-brand-primary/25 cursor-not-allowed"
                    : `cursor-pointer ${activeTab === "deposit" ? "text-brand-primary font-bold" : "text-brand-primary/40 hover:text-brand-primary/60"}`
                }`}
              >
                {selfDepositLockSettings.client_locked ? <Lock className="w-5 h-5" /> : <ArrowUpToLine className="w-5 h-5" />}
                <span className="text-[10px]">{strings.client_deposit}</span>
              </motion.button>
              {selfDepositLockSettings.client_locked && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2.5 pointer-events-none opacity-0 group-hover/tooltip:opacity-100 transition-all duration-300 translate-y-1 group-hover/tooltip:translate-y-0 z-50 w-48 text-center">
                  <div className="bg-amber-500/20 backdrop-blur-lg border border-amber-300/40 text-amber-950 dark:text-amber-50 text-[11px] px-3 py-2 rounded-xl shadow-xl whitespace-normal break-words leading-snug font-semibold">
                    {strings.self_deposit_locked_notice || "This feature will be available soon."}
                  </div>
                  <div className="w-1.5 h-1.5 bg-amber-400/30 border-r border-b border-amber-300/40 rotate-45 mx-auto -mt-1" />
                </div>
              )}
            </div>
            <motion.button
              id="bottom-tab-history"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setActiveTab("history")}
              className={`flex flex-col items-center gap-1 p-2 cursor-pointer transition-all ${activeTab === "history" ? "text-brand-primary font-bold" : "text-brand-primary/40 hover:text-brand-primary/60"}`}
            >
              <History className="w-5 h-5" />
              <span className="text-[10px]">{strings.client_history}</span>
            </motion.button>
            <motion.button
              id="bottom-tab-withdraw"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setActiveTab("withdraw")}
              className={`flex flex-col items-center gap-1 p-2 cursor-pointer transition-all ${activeTab === "withdraw" ? "text-brand-primary font-bold" : "text-brand-primary/40 hover:text-brand-primary/60"}`}
            >
              <ArrowDownToLine className="w-5 h-5" />
              <span className="text-[10px]">{strings.client_withdraw}</span>
            </motion.button>
            <motion.button
              id="bottom-tab-account"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setActiveTab("account")}
              className={`flex flex-col items-center gap-1 p-2 cursor-pointer transition-all ${activeTab === "account" ? "text-brand-primary font-bold" : "text-brand-primary/40 hover:text-brand-primary/60"}`}
            >
              <User className="w-5 h-5" />
              <span className="text-[10px]">{strings.client_account}</span>
            </motion.button>
          </>
        ) : (
          <>
            <button
              id="bottom-agent-home"
              onClick={() => setActiveTab("home")}
              className={`flex flex-col items-center gap-1 p-2 cursor-pointer transition-all ${activeTab === "home" ? "text-brand-primary scale-110" : "text-brand-primary/40 hover:text-brand-primary/60"}`}
            >
              <Home className="w-5 h-5" />
              <span className="text-[10px] font-bold">
                {strings.client_home}
              </span>
            </button>
            <button
              id="bottom-agent-clients"
              onClick={() => setActiveTab("clients")}
              className={`flex flex-col items-center gap-1 p-2 cursor-pointer transition-all ${activeTab === "clients" ? "text-brand-primary scale-110" : "text-brand-primary/40 hover:text-brand-primary/60"}`}
            >
              <PlusCircle className="w-5 h-5" />
              <span className="text-[10px] font-bold">{strings.nav_register}</span>
            </button>
            <button
              id="bottom-agent-deposit"
              onClick={() => setActiveTab("deposit")}
              className={`flex flex-col items-center gap-1 p-2 cursor-pointer transition-all ${activeTab === "deposit" ? "text-brand-primary scale-110" : "text-brand-primary/40 hover:text-brand-primary/60"}`}
            >
              <ArrowDownToLine className="w-5 h-5" />
              <span className="text-[10px] font-bold">{strings.agent_deposit}</span>
            </button>
            <button
              id="bottom-agent-commissions"
              onClick={() => setActiveTab("commissions")}
              className={`flex flex-col items-center gap-1 p-2 cursor-pointer transition-all ${activeTab === "commissions" ? "text-brand-primary scale-110" : "text-brand-primary/40 hover:text-brand-primary/60"}`}
            >
              <Calendar className="w-5 h-5" />
              <span className="text-[10px] font-bold">{strings.nav_earned}</span>
            </button>
            <button
              id="bottom-agent-account"
              onClick={() => setActiveTab("account")}
              className={`flex flex-col items-center gap-1 p-2 cursor-pointer transition-all ${activeTab === "account" ? "text-brand-primary scale-110" : "text-brand-primary/40 hover:text-brand-primary/60"}`}
            >
              <User className="w-5 h-5" />
              <span className="text-[10px] font-bold">
                {strings.client_account}
              </span>
            </button>
          </>
        )}
      </nav>

      {selectedNotification && (() => {
        const isMarathonStarted = selectedNotification.type === "marathon_started";
        const isMarathonApproved = selectedNotification.type === "marathon_approved";
        const isReferralActivated = selectedNotification.type === "referral_activated";
        const isAccountActivated = selectedNotification.type === "account_activated";
        const isCorrectionRequest = selectedNotification.type === "deposit_correction_request_received";
        const isCorrectionReviewed = selectedNotification.type === "deposit_correction_reviewed";
        let title = selectedNotification.title;
        let body = selectedNotification.body;
        if (isMarathonStarted) {
          title = strings.notif_marathon_started_title || "New Marathon Campaign Started!";
          const name = selectedNotification.body.match(/"([^"]+)"/)?.[1] || "Campaign";
          body = (strings.notif_marathon_started_body || "A new marathon campaign \"{name}\" has been started by the GM.").replace("{name}", name);
        } else if (isMarathonApproved) {
          title = strings.notif_marathon_approved_title || "Marathon Proposal Approved!";
          const isProposer = selectedNotification.body.toLowerCase().startsWith("your");
          const name = selectedNotification.body.match(/"([^"]+)"/)?.[1] || "Campaign";
          if (isProposer) {
            body = (strings.notif_marathon_proposer_approved_body || "Your marathon proposal \"{name}\" has been approved and activated by the GM!").replace("{name}", name);
          } else {
            body = (strings.notif_marathon_approved_body || "The marathon campaign \"{name}\" has been approved and activated by the GM!").replace("{name}", name);
          }
        } else if (isReferralActivated) {
          title = strings.notif_referral_activated_title || "Referral Account Activated";
          const refNameMatch = selectedNotification.body.match(/referral (.*?)(?:'s| is)/);
          const refName = refNameMatch?.[1] || "Referral";
          body = (strings.notif_referral_activated_body || "Your referral {name}'s account is now active and verified! Your recruitment commission has been credited.").replace("{name}", refName);
        } else if (isAccountActivated) {
          title = strings.notif_account_activated_title || "Welcome! Account Activated";
          body = strings.notif_account_activated_body || "Your NGACCUL member account has been successfully verified and activated. You can now log in and manage your savings & loans.";
        } else if (isCorrectionRequest) {
          title = strings.notif_deposit_correction_request_title || "Deposit Correction Request";
          const agentMatch = selectedNotification.body.match(/Agent (.*?) requested/);
          const agentName = agentMatch?.[1] || "Agent";
          const txMatch = selectedNotification.body.match(/transaction (NGC-TX-[^\s.]+)/);
          const txId = txMatch?.[1] || "NGC-TX-XXXXX";
          const reasonMatch = selectedNotification.body.match(/Reason: (.*)$/);
          const reason = reasonMatch?.[1] || "";
          body = (strings.notif_deposit_correction_request_body || "Daily Collector {agentName} requested a correction for transaction {txId}. Reason: {reason}")
            .replace("{agentName}", agentName)
            .replace("{txId}", txId)
            .replace("{reason}", reason);
        } else if (isCorrectionReviewed) {
          const isApproved = selectedNotification.title.toLowerCase().includes("approved");
          title = isApproved
            ? (strings.notif_deposit_correction_approved_title || "Deposit Correction Approved")
            : (strings.notif_deposit_correction_rejected_title || "Deposit Correction Rejected");
          if (isApproved) {
            const txMatch = selectedNotification.body.match(/transaction ([^\s.]+)/);
            const txId = txMatch?.[1] || "";
            const amountMatch = selectedNotification.body.match(/amount of ([^\s]+) FCFA/);
            const amount = amountMatch?.[1] || "";
            body = (strings.notif_deposit_correction_approved_body || "Your deposit correction request for transaction {txId} was approved with confirmed amount of {amount} FCFA.")
              .replace("{txId}", txId)
              .replace("{amount}", amount);
          } else {
            const reasonMatch = selectedNotification.body.match(/Reason: (.*)$/);
            const reason = reasonMatch?.[1] || "None specified";
            body = (strings.notif_deposit_correction_rejected_body || "Your deposit correction request was rejected. Reason: {reason}")
              .replace("{reason}", reason);
          }
        }
        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[60] p-4 font-numeric animate-fade-in">
            <div className="gradient-border-glow bg-white dark:bg-[#150B2E] border border-brand-primary/10 w-full max-w-sm rounded-2xl p-5 shadow-xl text-brand-primary space-y-4">
              <div className="flex justify-between items-start">
                <span className="px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary text-[9px] font-bold uppercase tracking-wider">
                  {selectedNotification.type.replace(/_/g, " ")}
                </span>
                <button
                  onClick={() => setSelectedNotification(null)}
                  className="p-1 rounded-full hover:bg-brand-surface text-brand-primary/40 hover:text-brand-primary transition-all cursor-pointer flex items-center justify-center"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-1">
                <h3 className="font-display font-black text-sm text-brand-primary">
                  {title}
                </h3>
                <p className="text-[10px] text-brand-primary/60 font-numeric">
                  {new Date(selectedNotification.created_at).toLocaleString()}
                </p>
              </div>

              <div className="p-3.5 bg-brand-surface/20 dark:bg-[#1c0f38] rounded-xl border border-brand-primary/5">
                <p className="text-xs text-brand-primary/90 leading-relaxed break-words whitespace-pre-line">
                  {body}
                </p>
              </div>

              {selectedNotification.reference_id && (
                <div className="text-[10px] text-brand-primary/60 flex items-center gap-1">
                  <span className="font-semibold">Reference:</span>
                  <span className="font-mono bg-brand-surface px-1 py-0.5 rounded">
                    #{selectedNotification.reference_id.slice(0, 8)}
                  </span>
                </div>
              )}

              <button
                onClick={() => setSelectedNotification(null)}
                className="w-full py-2 bg-brand-primary text-white hover:bg-brand-primary/90 text-xs font-bold rounded-xl transition-all uppercase tracking-wider cursor-pointer"
              >
                Okay
              </button>
            </div>
          </div>
        );
      })()}
      <GlobalLoading 
        isLoading={isRegisteringClient || isDepositing} 
        message={
          isRegisteringClient 
            ? "Registering new client account & credentials..." 
            : isDepositing 
              ? "Processing your transaction deposit request..." 
              : undefined
        } 
      />
    </div>
  );
};
