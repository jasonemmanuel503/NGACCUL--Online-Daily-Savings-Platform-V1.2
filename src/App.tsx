import { useState, useEffect, FormEvent, useRef } from "react";
import {
  Languages,
  UserSquare2,
  ShieldCheck,
  AlertTriangle,
  HelpCircle,
  TrendingUp,
  UserCheck,
  Sun,
  Moon,
  Key,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
} from "lucide-react";
import { motion } from "motion/react";
import { dbService, hashPin } from "./services/db";
import { CONFIG } from "./config/constants";
import { isSupabaseConfigured, SupabaseService, getSupabase } from "./services/supabase";
import { Profile } from "./types";
import { T } from "./config/translations";
import { AppLock } from "./components/AppLock";
import { PasswordInput } from "./components/PasswordInput";
import { isValidPhone } from "./components/ValidatedInput";
import { GlobalLoading } from "./components/GlobalLoading";
import { MobileApp } from "./views/MobileApp";
import { AdminApp } from "./views/AdminApp";
import { AnimatedSlogan } from "./components/AnimatedSlogan";

export default function App() {
  const showSandboxSelector = false;
  const [language, setLanguage] = useState<"en" | "fr" | "ff">(() => {
    const savedSession = localStorage.getItem("ng_session");
    if (savedSession) {
      try {
        const u = JSON.parse(savedSession);
        if (u && u.preferred_language) {
          return u.preferred_language;
        }
      } catch {}
    }
    const savedLang = localStorage.getItem("ng_lang");
    if (savedLang) {
      return savedLang as "en" | "fr" | "ff";
    }
    // Auto-detect browser/device language on first run
    const browserLang = (navigator.language || (navigator.languages && navigator.languages[0]) || "").toLowerCase();
    if (browserLang.startsWith("fr")) {
      localStorage.setItem("ng_lang", "fr");
      return "fr";
    }
    localStorage.setItem("ng_lang", "en");
    return "en";
  });

  useEffect(() => {
    localStorage.setItem("ng_lang", language);
  }, [language]);

  const [currentUser, setCurrentUser] = useState<Profile | null>(() => {
    // Attempt session restore
    const saved = localStorage.getItem("ng_session");
    if (saved) {
      try {
        const parsedUser = JSON.parse(saved);
        if (parsedUser && parsedUser.full_name) {
          parsedUser.full_name = parsedUser.full_name.trim().toUpperCase();
        }
        return parsedUser;
      } catch {
        return null;
      }
    }
    return null;
  });

  useEffect(() => {
    if (currentUser && currentUser.preferred_language && currentUser.preferred_language !== language) {
      setLanguage(currentUser.preferred_language);
    }
  }, [currentUser]);

  const handleLanguageChange = async (lang: "en" | "fr" | "ff") => {
    setLanguage(lang);
    if (currentUser) {
      const updatedUser = { ...currentUser, preferred_language: lang };
      setCurrentUser(updatedUser);
      localStorage.setItem("ng_session", JSON.stringify(updatedUser));
      try {
        await dbService.updateProfile(updatedUser, currentUser.id, { preferred_language: lang });
      } catch (err) {
        console.error("Failed to update user language preference in DB:", err);
      }
    }
  };

  const theme = "dark";

  useEffect(() => {
    localStorage.setItem("ng_theme", "dark");
    const root = window.document.documentElement;
    root.classList.add("dark");
  }, []);

  // Biometric/PIN Secure local 2FA state
  const [isLocalUnlocked, setIsLocalUnlocked] = useState(false);

  const TIMEOUT_MS = (currentUser?.role === 'agent' 
    ? CONFIG.AGENT_SESSION_TIMEOUT_MINUTES 
    : CONFIG.SESSION_TIMEOUT_MINUTES) * 60 * 1000;

  useEffect(() => {
    if (!currentUser || !isLocalUnlocked) return;
    
    let timer: ReturnType<typeof setTimeout>;
    
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // Re-lock the app (don't log out, just require PIN re-entry)
        setIsLocalUnlocked(false);
      }, TIMEOUT_MS);
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, resetTimer));
    resetTimer(); // Start the timer on mount

    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [currentUser, isLocalUnlocked, TIMEOUT_MS]);

  useEffect(() => {
    if (!currentUser) {
      SupabaseService.unsubscribeFromNotifications();
      return;
    }

    // Live subscription
    SupabaseService.subscribeToNotifications(currentUser.id, (newNotif) => {
      dbService.injectRealtimeNotification(newNotif);
    });

    // Fetch unread notifications from Supabase and merge them
    const syncUnread = async () => {
      try {
        const unread = await SupabaseService.fetchUnreadNotifications(currentUser.id);
        if (unread && unread.length > 0) {
          const sorted = [...unread].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          sorted.forEach((n) => {
            dbService.injectRealtimeNotification(n);
          });
        }
      } catch (err) {
        console.error("Failed to sync unread notifications from Supabase:", err);
      }
    };
    syncUnread();

    // Reconnect/re-subscribe on visibility or network status changes
    const handleReconnect = () => {
      if (document.visibilityState === "visible" || navigator.onLine) {
        console.log("App active or online. Reconnecting notification subscription...");
        SupabaseService.subscribeToNotifications(currentUser.id, (newNotif) => {
          dbService.injectRealtimeNotification(newNotif);
        });
        syncUnread();
      }
    };

    window.addEventListener("visibilitychange", handleReconnect);
    window.addEventListener("online", handleReconnect);
    window.addEventListener("focus", handleReconnect);

    return () => {
      SupabaseService.unsubscribeFromNotifications();
      window.removeEventListener("visibilitychange", handleReconnect);
      window.removeEventListener("online", handleReconnect);
      window.removeEventListener("focus", handleReconnect);
    };
  }, [currentUser]);

  // Custom URL Redirect Navigation Portal Paths
  const getPortalFromPathName = (pathname: string): "client" | "agent" | "branch_admin" | "pdg" | "staff" => {
    const lower = pathname.toLowerCase();
    if (lower.includes("/portal/agent")) return "agent";
    if (lower.includes("/portal/admin") || lower.includes("/portal/branch_admin")) return "branch_admin";
    if (lower.includes("/portal/pdg")) return "pdg";
    if (lower.includes("/portal/staff")) return "staff";
    return "client";
  };

  const [activePortal, setActivePortal] = useState<"client" | "agent" | "branch_admin" | "pdg" | "staff">(() => {
    return getPortalFromPathName(window.location.pathname);
  });

  // Prefill helper states for Demo Testing
  const [selectedRoleOption, setSelectedRoleOption] = useState<
    "client" | "agent" | "branch_admin" | "pdg" | "staff"
  >(() => getPortalFromPathName(window.location.pathname));

  const [phoneInput, setPhoneInput] = useState("");
  const [passwordInput, setPasswordInput] = useState(""); // Default to empty string for security
  const [showPassword, setShowPassword] = useState(true);
  const [rememberMe, setRememberMe] = useState(false);

  const [pdgPinSetupProfile, setPdgPinSetupProfile] = useState<Profile | null>(null);
  const [setupCodeInput, setSetupCodeInput] = useState("");
  const [newPdgPinInput, setNewPdgPinInput] = useState("");
  const [confirmNewPdgPinInput, setConfirmNewPdgPinInput] = useState("");
  const [pdgSetupError, setPdgSetupError] = useState<string | null>(null);
  const [pdgSetupSubmitting, setPdgSetupSubmitting] = useState(false);
  const [pdgSetupSuccess, setPdgSetupSuccess] = useState<string | null>(null);

  // Auto-fill phone and password inputs when selectedRoleOption changes for seamless developer testing
  useEffect(() => {
    if ((import.meta as any).env?.PROD) return;
    try {
      const stored = localStorage.getItem("ng_remember_me");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === "object" && parsed.expiresAt && Date.now() < parsed.expiresAt) {
          // A valid remember_me exists, do not overwrite with seeds
          return;
        }
      }
    } catch (e) {
      // ignore
    }
    const matchedProfile = dbService.getSeededProfiles().find(p => p.role === selectedRoleOption);
    if (matchedProfile) {
      setPhoneInput(matchedProfile.phone);
      setPasswordInput(matchedProfile.role === "pdg" ? "112233" : "123456");
    }
  }, [selectedRoleOption]);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [loginAttempts, setLoginAttempts] = useState<{count: number; lockedUntil: number | null}>({ count: 0, lockedUntil: null });

  // Supabase Dynamic Cloud Database Sync status
  const [isSyncing, setIsSyncing] = useState(false);

  const strings = T[language] || T.en;

  // Handle back/forward navigation URL updates dynamically
  useEffect(() => {
    const handleUrlChange = () => {
      const portal = getPortalFromPathName(window.location.pathname);
      setActivePortal(portal);
      setSelectedRoleOption(portal);
    };

    window.addEventListener("popstate", handleUrlChange);
    return () => window.removeEventListener("popstate", handleUrlChange);
  }, []);

  // Update URL history subpath and sync state
  const navigateToPortal = (portal: "client" | "agent" | "branch_admin" | "pdg" | "staff") => {
    setActivePortal(portal);
    setSelectedRoleOption(portal);
    setLoginError(null);
    setPdgSetupSuccess(null);

    const pathSuffix = portal === "branch_admin" ? "admin" : portal;
    const targetUrl = `/portal/${pathSuffix}`;

    if (window.location.pathname !== targetUrl) {
      window.history.pushState({ portal }, "", targetUrl);
    }
  };

  // Redirect root endpoint to clean portal path on startup
  useEffect(() => {
    let rememberedPortal: "client" | "agent" | "branch_admin" | "pdg" | "staff" | null = null;
    const stored = localStorage.getItem("ng_remember_me");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === "object" && parsed.expiresAt) {
          if (Date.now() < parsed.expiresAt) {
            setPhoneInput(parsed.phone || "");
            setPasswordInput(parsed.password || "");
            setRememberMe(true);
            rememberedPortal = parsed.portal;
          } else {
            localStorage.removeItem("ng_remember_me");
          }
        }
      } catch (err) {
        console.error("Error parsing ng_remember_me:", err);
      }
    }

    const cleanPath = window.location.pathname;
    if (cleanPath === "/" || cleanPath === "") {
      navigateToPortal(rememberedPortal || "client");
    } else {
      const portal = rememberedPortal || getPortalFromPathName(cleanPath);
      setActivePortal(portal);
      setSelectedRoleOption(portal);
    }
  }, []);

  // Sync visual portal-specific parameters
  const getPortalStyles = () => {
    switch (activePortal) {
      case "client":
        return {
          bg: "bg-[#F3EEF9] dark:bg-[#120F1A]",
          accent: "text-[#4B2D7F]",
          cardBorder: "border-brand-secondary/35",
          title: strings.portal_client_title,
          desc: strings.portal_client_desc
        };
      case "agent":
        return {
          bg: "bg-[#F3EEF9] dark:bg-[#120F1A]",
          accent: "text-[#1B5E20] dark:text-[#81C784]",
          cardBorder: "border-[#A5D6A7]/40",
          title: strings.portal_agent_title,
          desc: strings.portal_agent_desc
        };
      case "branch_admin":
        return {
          bg: "bg-[#F3EEF9] dark:bg-[#120F1A]",
          accent: "text-[#263238] dark:text-[#90A4AE]",
          cardBorder: "border-[#B0BEC5]/40",
          title: strings.portal_admin_title,
          desc: strings.portal_admin_desc
        };
      case "pdg":
        return {
          bg: "bg-[#F3EEF9] dark:bg-[#120F1A]",
          accent: "text-[#004D40] dark:text-[#4DB6AC]",
          cardBorder: "border-[#80CBC4]/40",
          title: strings.portal_pdg_title,
          desc: strings.portal_pdg_desc
        };
      case "staff":
        return {
          bg: "bg-[#F3EEF9] dark:bg-[#120F1A]",
          accent: "text-[#F57F17] dark:text-[#FFF59D]",
          cardBorder: "border-[#FFF59D]/40",
          title: strings.portal_staff_title || "Staff Office Portal",
          desc: strings.portal_staff_desc || "Enter secure credentials to manage assigned backend branch operations."
        };
    }
  };

  const portalStyle = getPortalStyles();

  // Trigger Supabase Dynamic Fetch on Startup
  useEffect(() => {
    async function loadSupabaseData() {
      setIsSyncing(true);
      try {
        await dbService.syncFromSupabase();
        // Refresh session from updated profile data
        const sessionStr = localStorage.getItem("ng_session");
        if (sessionStr) {
          const sessionUser = JSON.parse(sessionStr) as Profile;
          const freshProfile = dbService.getSeededProfiles().find(p => p.id === sessionUser.id);
          if (freshProfile) {
            if (!freshProfile.is_active) {
              // Account was deactivated — force logout
              localStorage.removeItem("ng_session");
              setCurrentUser(null);
              setIsLocalUnlocked(false);
            } else {
              // Refresh session with latest profile data
              localStorage.setItem("ng_session", JSON.stringify(freshProfile));
              setCurrentUser(freshProfile);
            }
          }
        }
      } catch (err) {
        console.error("Supabase initial load failed:", err);
      } finally {
        setIsSyncing(false);
      }
    }
    loadSupabaseData();
  }, []);

  const handleRememberMeOnLoginSuccess = () => {
    if (rememberMe) {
      // SECURITY WARNING / TRADEOFF ACKNOWLEDGEMENT:
      // Storing the user's login phone number and raw sign-in PIN/password in browser localStorage (persisted for 7 days)
      // represents a conscious security tradeoff in favor of user convenience. In a high-security financial production
      // environment, raw credentials should never be stored client-side in an unencrypted/accessible state.
      // This is implemented as requested by the user to pre-fill the login form upon subsequent visits.
      localStorage.setItem("ng_remember_me", JSON.stringify({
        phone: phoneInput,
        password: passwordInput,
        portal: activePortal,
        expiresAt: Date.now() + CONFIG.REMEMBER_ME_DAYS * 24 * 60 * 60 * 1000
      }));
    } else {
      localStorage.removeItem("ng_remember_me");
    }
  };

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loginAttempts.lockedUntil && Date.now() < loginAttempts.lockedUntil) {
      const remaining = Math.ceil((loginAttempts.lockedUntil - Date.now()) / 60000);
      setLoginError(`Too many failed attempts. Try again in ${remaining} minute(s).`);
      return;
    }

    setLoginError(null);
    setPdgSetupSuccess(null);
    setIsSyncing(true);

    try {
      if (isSupabaseConfigured()) {
        // Lightweight check: if PIN/password is blank, check if this phone is a PDG requiring first-time setup
        if (!passwordInput.trim()) {
          const checkResult = await SupabaseService.authenticateUserInSupabase(phoneInput, "");
          if (checkResult.requiresPinSetup && checkResult.user) {
            setPdgPinSetupProfile(checkResult.user);
            setIsSyncing(false);
            return;
          }
          setLoginError("PIN/Password is required to sign in.");
          setIsSyncing(false);
          return;
        }

        let authResult = await SupabaseService.authenticateUserInSupabase(phoneInput, passwordInput);
        if (!authResult.success && authResult.requiresPinSetup && authResult.user) {
          setPdgPinSetupProfile(authResult.user);
          setIsSyncing(false);
          return;
        }
        if (!authResult.success && !(import.meta as any).env?.PROD) {
          // Fall back to local dbService to login with pre-seeded sandbox accounts (e.g. 699999999, etc.)
          const localAuth = await dbService.authenticateUser(phoneInput, passwordInput);
          if (localAuth.success) {
            authResult = localAuth;
          }
        }
        if (authResult.success && authResult.user) {
          const validatedUser = authResult.user;

          if (validatedUser.role !== activePortal) {
            setLoginError(`Authentication successful, but this account belongs to a '${validatedUser.role.toUpperCase()}' profile. Please switch to the corresponding Portal Tab to sign in.`);
            setLoginAttempts({ count: 0, lockedUntil: null });
            setIsSyncing(false);
            return;
          }

          // Fetch fresh financial details and tables for the logged user in real-time first
          await dbService.syncFromSupabase();

          localStorage.setItem("ng_session", JSON.stringify(validatedUser));
          setCurrentUser(validatedUser);
          handleRememberMeOnLoginSuccess();
          
          dbService.logSecurityEvent(validatedUser, "security.login_success", {
            info: `Successful user login through dynamic Supabase cloud authentication into Portal: ${activePortal}`
          });
          setLoginAttempts({ count: 0, lockedUntil: null });
        } else {
          const newCount = loginAttempts.count + 1;
          if (newCount >= CONFIG.MAX_LOGIN_ATTEMPTS) {
            setLoginAttempts({
              count: newCount,
              lockedUntil: Date.now() + CONFIG.LOGIN_LOCKOUT_WINDOW_MINUTES * 60 * 1000
            });
            setLoginError(`Account temporarily locked after ${CONFIG.MAX_LOGIN_ATTEMPTS} failed attempts. Try again in ${CONFIG.LOGIN_LOCKOUT_WINDOW_MINUTES} minutes.`);
          } else {
            setLoginAttempts(prev => ({ ...prev, count: newCount }));
            setLoginError(authResult.error || strings.invalid_credentials_toast);
          }
        }
      } else {
        if (!passwordInput.trim()) {
          setLoginError("PIN/Password is required to sign in.");
          setIsSyncing(false);
          return;
        }
        const authResult = await dbService.authenticateUser(phoneInput, passwordInput);
        if (authResult.success && authResult.user) {
          const validatedUser = authResult.user;
          if (!validatedUser.is_active) {
            setLoginError(
              strings.account_deactivated,
            );
            setIsSyncing(false);
            return;
          }

          if (validatedUser.role !== activePortal) {
            setLoginError(`Authentication successful, but this account belongs to a '${validatedUser.role.toUpperCase()}' profile. Please switch to the corresponding Portal Tab to sign in.`);
            setLoginAttempts({ count: 0, lockedUntil: null });
            setIsSyncing(false);
            return;
          }

          // Add small artificial delay to let user see the database syncing/authenticating spinner
          await new Promise((resolve) => setTimeout(resolve, 800));

          localStorage.setItem("ng_session", JSON.stringify(validatedUser));
          setCurrentUser(validatedUser);
          handleRememberMeOnLoginSuccess();
        } else {
          const newCount = loginAttempts.count + 1;
          if (newCount >= CONFIG.MAX_LOGIN_ATTEMPTS) {
            setLoginAttempts({
              count: newCount,
              lockedUntil: Date.now() + CONFIG.LOGIN_LOCKOUT_WINDOW_MINUTES * 60 * 1000
            });
            setLoginError(`Account temporarily locked after ${CONFIG.MAX_LOGIN_ATTEMPTS} failed attempts. Try again in ${CONFIG.LOGIN_LOCKOUT_WINDOW_MINUTES} minutes.`);
          } else {
            setLoginAttempts(prev => ({ ...prev, count: newCount }));
            setLoginError(authResult.error || strings.invalid_credentials_toast);
          }
        }
      }
    } catch (err: any) {
      setLoginError(err.message || strings.login_failed_generic);
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePdgPinSetupSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPdgSetupError(null);

    if (!setupCodeInput.trim()) {
      setPdgSetupError("Enter the setup code you were given.");
      return;
    }
    if (newPdgPinInput.length !== 6) {
      setPdgSetupError("PIN must be exactly 6 digits.");
      return;
    }
    if (newPdgPinInput !== confirmNewPdgPinInput) {
      setPdgSetupError("PINs do not match.");
      return;
    }

    setPdgSetupSubmitting(true);
    try {
      const result = await SupabaseService.completePdgPinSetup(
        pdgPinSetupProfile!.phone,
        setupCodeInput.trim(),
        newPdgPinInput,
      );
      if (result.success) {
        const phone = pdgPinSetupProfile!.phone;
        setPdgPinSetupProfile(null);
        setSetupCodeInput("");
        setNewPdgPinInput("");
        setConfirmNewPdgPinInput("");
        setPhoneInput(phone);
        setPasswordInput("");
        setLoginError(null);
        setPdgSetupSuccess("PIN created successfully. Please log in with your new PIN.");
      } else {
        setPdgSetupError(result.error || "Setup failed.");
      }
    } catch (err: any) {
      setPdgSetupError(err.message || "Setup failed.");
    } finally {
      setPdgSetupSubmitting(false);
    }
  };

  const handleLogout = () => {
    if (currentUser) {
      dbService.logSecurityEvent(currentUser, "security.logout", {
        info: "User initiated clean session logout",
      });
    }
    localStorage.removeItem("ng_session");
    setCurrentUser(null);
    setIsLocalUnlocked(false);
  };

  // Render Login state
  if (!currentUser) {
    return (
      <div
        id="login-stage-container"
        className={`min-h-screen ${portalStyle.bg} relative flex flex-col items-center justify-center p-6 text-brand-primary dark:text-violet-200 transition-all duration-500`}
      >
        {!pdgPinSetupProfile && (
          <div className="auth-aurora" aria-hidden="true">
            <div className="auth-aurora__blob auth-aurora__blob--one" />
            <div className="auth-aurora__blob auth-aurora__blob--two" />
            <div className="auth-aurora__blob auth-aurora__blob--three" />
          </div>
        )}

        <div className={`max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl shadow-xl overflow-hidden border ${portalStyle.cardBorder} flex flex-col p-8 space-y-6 transition-all duration-500`}>
          {/* Dynamic Language bar selector §11 */}
          <div className="flex justify-between items-center bg-brand-surface/60 dark:bg-slate-800/60 rounded-2xl p-2 border border-brand-secondary/15">
            <span className="text-[10px] font-bold tracking-wider uppercase flex items-center gap-1.5 pl-1.5 text-brand-primary dark:text-violet-300">
              <Languages className="w-3.5 h-3.5 text-brand-primary" />{" "}
              {strings.language}
            </span>
            <div className="flex gap-1 items-center">
              <button
                id="lang-en"
                type="button"
                onClick={() => handleLanguageChange("en")}
                className={`px-2.5 py-1 text-[10px] uppercase rounded-lg cursor-pointer transition-all ${language === "en" ? "active-lang-btn shadow-md font-black" : "text-brand-primary/80 dark:text-violet-200/80 hover:bg-brand-surface dark:hover:bg-slate-700/50 font-bold"}`}
              >
                EN
              </button>
              <button
                id="lang-fr"
                type="button"
                onClick={() => handleLanguageChange("fr")}
                className={`px-2.5 py-1 text-[10px] uppercase rounded-lg cursor-pointer transition-all ${language === "fr" ? "active-lang-btn shadow-md font-black" : "text-brand-primary/80 dark:text-violet-200/80 hover:bg-brand-surface dark:hover:bg-slate-700/50 font-bold"}`}
              >
                FR
              </button>
              <button
                id="lang-ff"
                type="button"
                onClick={() => handleLanguageChange("ff")}
                className={`px-2.5 py-1 text-[10px] uppercase rounded-lg cursor-pointer transition-all ${language === "ff" ? "active-lang-btn shadow-md font-black" : "text-brand-primary/80 dark:text-violet-200/80 hover:bg-brand-surface dark:hover:bg-slate-700/50 font-bold"}`}
              >
                FF
              </button>

            </div>
          </div>

          {/* Branded Logo Header matching §11 rules */}
          <div className="flex flex-col items-center text-center space-y-3">
            <img
              src="/branding/logo.svg"
              alt={strings.x_ngaccul_logo_badge}
              className="w-20 h-20 border-3 border-brand-primary/10 rounded-full shadow-md bg-white p-1"
              referrerPolicy="no-referrer"
            />
            <div>
              <h1 className="font-display font-extrabold text-2xl tracking-tight leading-none text-brand-primary dark:text-violet-100">
                NGACCUL
              </h1>
              <p className="text-[10px] text-brand-primary/60 dark:text-violet-300/60 font-semibold tracking-wider uppercase mt-1">
                Savings & Credit Cooperative
              </p>
            </div>
            <div className="bg-brand-primary/5 dark:bg-violet-950/20 rounded-xl py-2 px-2 w-full">
              <AnimatedSlogan slogan={strings.slogan} />
            </div>
          </div>

          {/* PORTAL SEPARATION NAVIGATION TABS WITH DISTINCT INTERFACES & URL PATHS */}
          <div className="flex flex-col space-y-2.5">
            <span className="text-[9px] font-black text-brand-primary/50 dark:text-violet-300/50 uppercase tracking-widest text-center">
              Cooperative Login Workspace Portals
            </span>
            <div className="grid grid-cols-5 gap-1 p-1 bg-brand-surface/70 dark:bg-slate-800/80 rounded-2xl border border-brand-secondary/15">
              {(["client", "agent", "branch_admin", "pdg", "staff"] as const).map((portal) => {
                const label = portal === "branch_admin"
                  ? (strings.portal_tab_admin || "BM")
                  : portal === "pdg"
                  ? (strings.portal_tab_pdg || "GM")
                  : portal === "agent"
                  ? (strings.portal_tab_agent || "DC")
                  : portal === "client"
                  ? (strings.portal_tab_client || "Client")
                  : portal === "staff"
                  ? (strings.portal_tab_staff || "Staff")
                  : portal;
                const isActive = activePortal === portal;
                return (
                  <button
                    key={portal}
                    type="button"
                    onClick={() => navigateToPortal(portal)}
                    className={`relative py-2 px-1 text-[9px] font-black uppercase tracking-wider rounded-xl cursor-pointer transition-all duration-300 ${
                      isActive
                        ? "gradient-border-glow-tab-active bg-brand-primary text-white shadow-md scale-[1.02]"
                        : "text-brand-primary/60 dark:text-violet-300/60 hover:text-brand-primary hover:bg-brand-surface dark:hover:bg-slate-700/50"
                    }`}
                  >
                    <span className="relative z-[2]">{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Dynmamic portal contextual cards pointing out separation */}
            <div className="bg-brand-surface/30 dark:bg-slate-800/50 p-3.5 rounded-2xl border border-brand-secondary/10 space-y-1">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${activePortal === "client" ? "bg-purple-500" : activePortal === "agent" ? "bg-emerald-500" : activePortal === "branch_admin" ? "bg-blue-500" : "bg-amber-500"} animate-pulse`} />
                <h2 className={`text-xs font-black uppercase tracking-wider ${portalStyle.accent}`}>
                  {portalStyle.title}
                </h2>
              </div>
              <p className="text-[10px] text-brand-primary/70 dark:text-violet-300/70 leading-relaxed font-semibold">
                {portalStyle.desc}
              </p>
              <div className="text-[8px] font-mono text-brand-primary/40 dark:text-violet-300/40 uppercase tracking-widest pt-0.5">
                Direct URL: <span className="underline select-all font-bold">/portal/{activePortal === "branch_admin" ? "admin" : activePortal}</span>
              </div>
            </div>
          </div>

          {/* Login page heading */}
          <div className="w-full text-center">
            <h2 className="text-lg font-black uppercase tracking-widest text-brand-primary dark:text-violet-100">
              {strings.x_login_heading || "Login"}
            </h2>
          </div>

          <>
              {/* DEVELOPER LIVE PREFILL DEMO ACCOUNTS ASSISTANT */}
              {showSandboxSelector && (
                <div className="bg-brand-surface/40 rounded-2xl p-4 border border-brand-secondary/35 text-xs space-y-2">
                  <span className="font-bold text-[10px] text-brand-accent uppercase tracking-wider block flex items-center gap-1">
                    <UserCheck className="w-3.5 text-brand-accent" /> Premium Demo
                    Sandbox Account Selector
                  </span>
                  <p className="text-[10px] text-brand-primary/70 leading-normal">
                    Select a cooperative role profile block to auto-load
                    pre-registered sandbox phone credentials instantly:
                  </p>

                  <div className="grid grid-cols-4 gap-1.5 pt-1.5">
                    {(["client", "agent", "branch_admin", "pdg"] as const).map(
                      (rl) => (
                        <button
                          id={`sandbox-${rl}`}
                          key={rl}
                          onClick={() => setSelectedRoleOption(rl)}
                          className={`py-1 px-1 rounded text-[9px] font-bold capitalize truncate cursor-pointer ${
                            selectedRoleOption === rl
                              ? "bg-brand-primary text-white"
                              : "bg-white hover:bg-brand-surface text-brand-primary border border-brand-secondary/20"
                          }`}
                        >
                          {rl === "branch_admin" ? "BM" : rl === "pdg" ? "GM" : rl === "agent" ? "DC" : rl}
                        </button>
                      ),
                    )}
                  </div>
                  {/* Active sandbox info labels */}
                  {dbService
                    .getSeededProfiles()
                    .find((p) => p.role === selectedRoleOption) && (
                    <div className="text-[9px] font-mono text-[#7C4DCC]/80 font-semibold pt-1">
                      Loaded:{" "}
                      {
                        dbService
                          .getSeededProfiles()
                          .find((p) => p.role === selectedRoleOption)?.full_name
                      }{" "}
                      ({selectedRoleOption === "branch_admin" ? "BM" : selectedRoleOption === "pdg" ? "GM" : selectedRoleOption === "agent" ? "DC" : selectedRoleOption.toUpperCase()})
                    </div>
                  )}
                </div>
              )}

              {pdgSetupSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 flex items-center gap-2">
                  <ShieldCheck className="w-4 shrink-0 text-emerald-500 animate-pulse" />
                  <span className="font-medium">{pdgSetupSuccess}</span>
                </div>
              )}

              {loginError && (
                <div className="bg-[#FDF2F2] border border-[#FDF2F2] rounded-xl p-3 text-xs text-[#B42318] flex items-center gap-2">
                  <AlertTriangle className="w-4 shrink-0" />
                  <span className="font-medium">{loginError}</span>
                </div>
              )}

              {/* AUTHENTICATION FORM FIELDS */}
              {pdgPinSetupProfile ? (
                <form onSubmit={handlePdgPinSetupSubmit} className="space-y-4">
                  <p className="text-xs text-brand-primary/70">
                    First-time GM login for <strong>{pdgPinSetupProfile.full_name}</strong>. Enter the one-time setup code you were given, then choose your permanent 6-digit PIN.
                  </p>

                  {pdgSetupError && (
                    <div className="bg-[#FDF2F2] border border-[#FDF2F2] rounded-xl p-3 text-xs text-[#B42318] flex items-center gap-2">
                      <AlertTriangle className="w-4 shrink-0" />
                      <span className="font-medium">{pdgSetupError}</span>
                    </div>
                  )}

                  <div className="space-y-1.5 text-brand-primary">
                    <label className="text-xs font-bold text-brand-primary/80">Setup Code</label>
                    <input
                      type="text"
                      required
                      value={setupCodeInput}
                      onChange={(e) => setSetupCodeInput(e.target.value)}
                      className="w-full text-xs font-numeric p-3 rounded-xl border border-brand-secondary focus:outline-none focus:ring-1 focus:ring-brand-primary bg-white"
                    />
                  </div>

                  <div className="space-y-1.5 text-brand-primary">
                    <label className="text-xs font-bold text-brand-primary/80">New 6-Digit PIN</label>
                    <PasswordInput
                      id="pdg-setup-new-pin"
                      required
                      maxLength={6}
                      inputMode="numeric"
                      value={newPdgPinInput}
                      onChange={(e) => setNewPdgPinInput(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                      className="w-full text-xs p-3 rounded-xl border border-brand-secondary focus:outline-none focus:ring-1 focus:ring-brand-primary bg-white"
                    />
                  </div>

                  <div className="space-y-1.5 text-brand-primary">
                    <label className="text-xs font-bold text-brand-primary/80">Confirm PIN</label>
                    <PasswordInput
                      id="pdg-setup-confirm-pin"
                      required
                      maxLength={6}
                      inputMode="numeric"
                      value={confirmNewPdgPinInput}
                      onChange={(e) => setConfirmNewPdgPinInput(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                      className="w-full text-xs p-3 rounded-xl border border-brand-secondary focus:outline-none focus:ring-1 focus:ring-brand-primary bg-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={pdgSetupSubmitting}
                    className="w-full py-3.5 bg-brand-primary hover:bg-brand-accent text-white text-xs font-bold rounded-2xl cursor-pointer shadow-lg transition-all active:scale-[0.99] uppercase tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-60"
                  >
                    <ShieldCheck className="w-4 h-4 text-emerald-400" /> {pdgSetupSubmitting ? "Setting up..." : "Set PIN & Continue"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div className="space-y-1.5 text-brand-primary">
                    <label className="text-xs font-bold text-brand-primary/80">
                      {activePortal === "client"
                        ? (language === "fr" ? "Téléphone / Numéro de compte (4 chiffres)" : language === "ff" ? "Lamba talfon / Lamba limoore" : "Phone / 4-Digit Account Number")
                        : activePortal === "agent"
                        ? (language === "fr" ? "Téléphone / Code Agent (4 chiffres)" : language === "ff" ? "Lamba talfon / Lamba kuuwoowo" : "Phone / 4-Digit Agent Code")
                        : strings.phone}
                    </label>
                    <div className="gradient-border-glow-field rounded-xl">
                      {(() => {
                        const str = phoneInput.trim();
                        let phoneBorderClass = "border border-brand-secondary focus:outline-none bg-white";
                        if (str.length > 0) {
                          const isDigits = /^\d+$/.test(str);
                          const is4DigitAccount = isDigits && str.length === 4 && (activePortal === "client" || activePortal === "agent");
                          const isPhoneValid = isValidPhone(str);
                          if (is4DigitAccount || isPhoneValid) {
                            phoneBorderClass = "!border-2 !border-emerald-500 !ring-2 !ring-emerald-500/30 !bg-emerald-500/5 text-emerald-700 font-bold";
                          } else if (!isDigits || (str.length !== 4 && str.length > 9) || (str.length > 4 && str.length < 9)) {
                            phoneBorderClass = "!border-2 !border-red-500 !ring-2 !ring-red-500/30 !bg-red-500/5 text-red-700";
                          }
                        }
                        return (
                          <input
                            id="login-phonenumber-input"
                            type="text"
                            required
                            placeholder={
                              activePortal === "client"
                                ? "e.g. 677XXXXXX or 4301"
                                : activePortal === "agent"
                                ? "e.g. 677XXXXXX or 2049"
                                : strings.x_eg_677xxxxxx
                            }
                            value={phoneInput}
                            onChange={(e) => setPhoneInput(e.target.value)}
                            className={`w-full text-xs font-numeric p-3 rounded-xl placeholder:text-brand-primary/30 text-brand-primary transition-all relative z-[2] ${phoneBorderClass}`}
                          />
                        );
                      })()}
                    </div>
                  </div>

                  <div className="space-y-1.5 text-brand-primary">
                    <label className="text-xs font-bold text-brand-primary/80">
                      {strings.password}
                    </label>
                    <div className="gradient-border-glow-field relative w-full rounded-xl">
                      {(() => {
                        const str = passwordInput;
                        let passBorderClass = "border border-brand-secondary focus:outline-none bg-white";
                        if (str.length > 0) {
                          const isNumeric = /^\d+$/.test(str);
                          if (isNumeric && str.length === 6) {
                            passBorderClass = "!border-2 !border-emerald-500 !ring-2 !ring-emerald-500/30 !bg-emerald-500/5 text-emerald-700 font-bold";
                          } else if (isNumeric && str.length > 6) {
                            passBorderClass = "!border-2 !border-red-500 !ring-2 !ring-red-500/30 !bg-red-500/5 text-red-700";
                          } else if (!isNumeric && str.length >= 4) {
                            passBorderClass = "!border-2 !border-emerald-500 !ring-2 !ring-emerald-500/30 !bg-emerald-500/5 text-emerald-700";
                          }
                        }
                        return (
                          <input
                            id="login-password-input"
                            type={showPassword ? "text" : "password"}
                            value={passwordInput}
                            onChange={(e) => setPasswordInput(e.target.value)}
                            className={`w-full text-xs p-3 pr-10 rounded-xl transition-all relative z-[2] ${passBorderClass}`}
                          />
                        );
                      })()}
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', zIndex: 3 }}
                        className="text-brand-primary/50 hover:text-brand-primary"
                        tabIndex={-1}
                        aria-label={showPassword ? "Hide PIN" : "Show PIN"}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1 pb-1">
                    <input
                      id="login-remember-me-checkbox"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 accent-brand-primary rounded border-brand-secondary focus:ring-brand-primary cursor-pointer"
                    />
                    <label
                      htmlFor="login-remember-me-checkbox"
                      className="text-xs font-bold text-brand-primary/80 cursor-pointer select-none"
                    >
                      {strings.remember_me || (language === "fr" ? "Se souvenir de moi" : language === "ff" ? "Mijtora am" : "Remember Me")}
                    </label>
                  </div>

                  <div className="space-y-3">
                    <button
                      id="btn-login-submit"
                      type="submit"
                      className="w-full py-3.5 bg-brand-primary hover:bg-brand-accent text-white text-xs font-bold rounded-2xl cursor-pointer shadow-lg transition-all active:scale-[0.99] uppercase tracking-wider flex items-center justify-center gap-1.5"
                    >
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />{" "}
                      {strings.login_submit}
                    </button>
                  </div>
                </form>
              )}
            </>
        </div>
        <GlobalLoading isLoading={isSyncing} message="Authenticating & syncing portal..." />
      </div>
    );
  }

  // 2FA PIN app lock module verification for client, agent, and pdg platforms (§3.1 & §3.2)
  if (
    !isLocalUnlocked &&
    (currentUser.role === "client" || currentUser.role === "agent" || currentUser.role === "pdg")
  ) {
    return (
      <AppLock
        user={currentUser}
        language={language}
        onUnlocked={() => setIsLocalUnlocked(true)}
      />
    );
  }

  // PORTAL SELECTOR ROUTING BY USER ROLE TIERS
  if (currentUser.role === "client" || currentUser.role === "agent") {
    return (
      <MobileApp
        user={currentUser}
        onLogout={handleLogout}
        language={language}
        onChangeLanguage={handleLanguageChange}
        theme={theme}
        onToggleTheme={() => {}}
        onUpdateUser={(updatedUser) => {
          setCurrentUser(updatedUser);
          localStorage.setItem("ng_session", JSON.stringify(updatedUser));
        }}
        onCredentialsChanged={() => {
          localStorage.removeItem("ng_remember_me");
          setRememberMe(false);
        }}
      />
    );
  }

  // Office control board for admins (omit Local PIN overlay protection, standard auth only)
  return (
    <AdminApp
      user={currentUser}
      onLogout={handleLogout}
      language={language}
      onChangeLanguage={handleLanguageChange}
      theme={theme}
      onToggleTheme={() => {}}
      strings={strings}
    />
  );
}
