import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Bell, Trash2, X, Check, Archive, RotateCcw, CheckSquare, Square, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Notification, Profile } from "../types";

interface NotificationCenterProps {
  user: Profile;
  notifications: Notification[];
  archivedNotifIds: string[];
  strings: any;
  theme?: "light" | "dark";
  onMarkNotificationRead: (id: string) => void;
  onMarkAllRead: () => void;
  onArchiveNotifications: (ids: string[]) => void;
  onRestoreNotifications: (ids: string[]) => void;
  onNotificationClick?: (n: Notification) => void;
  onClose: () => void;
  isMobile?: boolean;
  renderDetail?: (notification: Notification, goBack: () => void) => React.ReactNode;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  user,
  notifications,
  archivedNotifIds,
  strings,
  theme = "light",
  onMarkNotificationRead,
  onMarkAllRead,
  onArchiveNotifications,
  onRestoreNotifications,
  onNotificationClick,
  onClose,
  isMobile = false,
  renderDetail,
}) => {
  const [activeTab, setActiveTab] = useState<"unread" | "read" | "archived">("unread");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [localNotifications, setLocalNotifications] = useState<Notification[]>(notifications);
  const [detailNotification, setDetailNotification] = useState<Notification | null>(null);

  useEffect(() => {
    setLocalNotifications(notifications);
  }, [notifications]);

  const handleClose = () => {
    setDetailNotification(null);
    onClose();
  };

  const unarchivedList = localNotifications.filter((n) => !n.is_archived && !archivedNotifIds.includes(n.id));
  const archivedList = localNotifications.filter((n) => n.is_archived || archivedNotifIds.includes(n.id));

  const unreadList = unarchivedList.filter((n) => !n.is_read);
  const readList = unarchivedList.filter((n) => n.is_read);

  const activeList = activeTab === "unread"
    ? unreadList
    : activeTab === "read"
      ? readList
      : archivedList;

  const handleSelectToggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === activeList.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(activeList.map((n) => n.id));
    }
  };

  const handleBulkAction = () => {
    if (selectedIds.length === 0) return;
    if (activeTab === "archived") {
      onRestoreNotifications(selectedIds);
      setLocalNotifications((prev) =>
        prev.map((notif) =>
          selectedIds.includes(notif.id) ? { ...notif, is_archived: false } : notif
        )
      );
    } else {
      onArchiveNotifications(selectedIds);
      setLocalNotifications((prev) =>
        prev.map((notif) =>
          selectedIds.includes(notif.id) ? { ...notif, is_archived: true } : notif
        )
      );
    }
    setSelectedIds([]);
    setSelectionMode(false);
  };

  const translateNotification = (n: Notification) => {
    const isMarathonStarted = n.type === "marathon_started";
    const isMarathonApproved = n.type === "marathon_approved";
    const isReferralActivated = n.type === "referral_activated";
    const isAccountActivated = n.type === "account_activated";
    const isCorrectionRequest = n.type === "deposit_correction_request_received";
    const isCorrectionReviewed = n.type === "deposit_correction_reviewed";
    const isPdgBranchActivityDigest = n.type === "pdg_branch_activity_digest";

    let title = n.title;
    let body = n.body;

    if (isMarathonStarted) {
      title = strings.notif_marathon_started_title || "New Marathon Campaign Started!";
      const name = n.body.match(/"([^"]+)"/)?.[1] || "Campaign";
      body = (strings.notif_marathon_started_body || 'A new marathon campaign "{name}" has been started by the GM.').replace("{name}", name);
    } else if (isMarathonApproved) {
      title = strings.notif_marathon_approved_title || "Marathon Proposal Approved!";
      const isProposer = n.body.toLowerCase().startsWith("your");
      const name = n.body.match(/"([^"]+)"/)?.[1] || "Campaign";
      if (isProposer) {
        body = (strings.notif_marathon_proposer_approved_body || 'Your marathon proposal "{name}" has been approved and activated by the GM!').replace("{name}", name);
      } else {
        body = (strings.notif_marathon_approved_body || 'The marathon campaign "{name}" has been approved and activated by the GM!').replace("{name}", name);
      }
    } else if (isReferralActivated) {
      title = strings.notif_referral_activated_title || "Referral Account Activated";
      const refNameMatch = n.body.match(/referral (.*?)(?:'s| is)/);
      const refName = refNameMatch?.[1] || "Referral";
      body = (strings.notif_referral_activated_body || "Your referral {name}'s account is now active and verified! Your recruitment commission has been credited.").replace("{name}", refName);
    } else if (isAccountActivated) {
      title = strings.notif_account_activated_title || "Welcome! Account Activated";
      body = strings.notif_account_activated_body || "Your NGACCUL member account has been successfully verified and activated. You can now log in and manage your savings & loans.";
    } else if (isCorrectionRequest) {
      title = strings.notif_deposit_correction_request_title || "Deposit Correction Request";
      const agentMatch = n.body.match(/Daily Collector (.*?) requested/);
      const agentName = agentMatch?.[1] || "Daily Collector";
      const txMatch = n.body.match(/transaction (NGC-TX-[^\s.]+)/);
      const txId = txMatch?.[1] || "NGC-TX-XXXXX";
      const reasonMatch = n.body.match(/Reason: (.*)$/);
      const reason = reasonMatch?.[1] || "";
      body = (strings.notif_deposit_correction_request_body || "Daily Collector {agentName} requested a correction for transaction {txId}. Reason: {reason}")
        .replace("{agentName}", agentName)
        .replace("{txId}", txId)
        .replace("{reason}", reason);
    } else if (isCorrectionReviewed) {
      const isApproved = n.title.toLowerCase().includes("approved");
      title = isApproved
        ? (strings.notif_deposit_correction_approved_title || "Deposit Correction Approved")
        : (strings.notif_deposit_correction_rejected_title || "Deposit Correction Rejected");
      if (isApproved) {
        const txMatch = n.body.match(/transaction ([^\s.]+)/);
        const txId = txMatch?.[1] || "";
        const amountMatch = n.body.match(/amount of ([^\s]+) FCFA/);
        const amount = amountMatch?.[1] || "";
        body = (strings.notif_deposit_correction_approved_body || "Your deposit correction request for transaction {txId} was approved with confirmed amount of {amount} FCFA.")
          .replace("{txId}", txId)
          .replace("{amount}", amount);
      } else {
        const reasonMatch = n.body.match(/Reason: (.*)$/);
        const reason = reasonMatch?.[1] || "None specified";
        body = (strings.notif_deposit_correction_rejected_body || "Your deposit correction request was rejected. Reason: {reason}")
          .replace("{reason}", reason);
      }
    } else if (isPdgBranchActivityDigest) {
      title = n.title;
      body = n.body;
    }

    return { title, body };
  };

  const renderInnerContent = (isDesktopDrawer: boolean) => {
    if (detailNotification && renderDetail) {
      return (
        <div className="flex flex-col h-full min-h-0 space-y-3">
          <div className="flex justify-between items-center pb-2 font-display border-b border-brand-surface shrink-0">
            <button
              type="button"
              onClick={() => setDetailNotification(null)}
              className="flex items-center gap-1.5 text-xs font-bold text-brand-primary hover:text-brand-accent transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-brand-primary" />
              <span>{strings.back || "Back"}</span>
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="text-[10px] text-brand-accent hover:underline cursor-pointer font-bold"
            >
              Close
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar pr-1">
            {renderDetail(detailNotification, () => setDetailNotification(null))}
          </div>
        </div>
      );
    }

    return (
    <>
      {/* Header Panel */}
      <div className="flex justify-between items-center pb-2 mb-2 font-display border-b border-brand-surface shrink-0">
        <span className="font-bold text-xs text-brand-primary uppercase tracking-wider flex items-center gap-1.5">
          <Bell className="w-4 h-4 text-emerald-600 dark:text-emerald-400 animate-pulse" />
          {strings.notifications_feed || "Notifications"} ({activeList.length})
        </span>
        <div className="flex items-center gap-2">
          {selectionMode ? (
            <>
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[10px] text-brand-accent hover:underline cursor-pointer"
              >
                {selectedIds.length === activeList.length ? "Clear Selection" : "Select All"}
              </button>
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={handleBulkAction}
                  className="p-1 px-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition-all cursor-pointer flex items-center gap-1 text-[10px] font-bold"
                >
                  {activeTab === "archived" ? (
                    <>
                      <RotateCcw className="w-3 h-3 text-rose-600" />
                      <span>Restore</span>
                    </>
                  ) : (
                    <>
                      <Archive className="w-3 h-3 text-rose-600" />
                      <span>Archive</span>
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setSelectionMode(false);
                  setSelectedIds([]);
                }}
                className="text-[10px] text-brand-accent hover:underline cursor-pointer"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              {activeTab === "unread" && unreadList.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setLocalNotifications((prev) =>
                      prev.map((notif) => ({ ...notif, is_read: true }))
                    );
                    onMarkAllRead();
                  }}
                  className="text-[10px] text-brand-accent hover:underline cursor-pointer font-bold"
                >
                  Mark all read
                </button>
              )}
              {activeList.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectionMode(true);
                    setSelectedIds([]);
                  }}
                  className="text-[10px] text-brand-accent hover:underline cursor-pointer"
                >
                  Manage
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={handleClose}
            className="text-[10px] text-brand-accent hover:underline cursor-pointer font-bold"
          >
            Close
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-brand-surface mb-3 shrink-0">
        <button
          type="button"
          onClick={() => {
            setActiveTab("unread");
            setSelectionMode(false);
            setSelectedIds([]);
          }}
          className={`flex-1 py-1.5 pb-2 text-[11px] text-center border-b-2 transition-all cursor-pointer ${
            activeTab === "unread"
              ? "text-emerald-600 border-emerald-600 font-black"
              : "text-brand-primary/50 border-transparent font-medium hover:text-brand-primary/80"
          }`}
        >
          Unread ({unreadList.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab("read");
            setSelectionMode(false);
            setSelectedIds([]);
          }}
          className={`flex-1 py-1.5 pb-2 text-[11px] text-center border-b-2 transition-all cursor-pointer ${
            activeTab === "read"
              ? "text-emerald-600 border-emerald-600 font-black"
              : "text-brand-primary/50 border-transparent font-medium hover:text-brand-primary/80"
          }`}
        >
          Read ({readList.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab("archived");
            setSelectionMode(false);
            setSelectedIds([]);
          }}
          className={`flex-1 py-1.5 pb-2 text-[11px] text-center border-b-2 transition-all cursor-pointer ${
            activeTab === "archived"
              ? "text-emerald-600 border-emerald-600 font-black"
              : "text-brand-primary/50 border-transparent font-medium hover:text-brand-primary/80"
          }`}
        >
          Archived ({archivedList.length})
        </button>
      </div>

      {/* List Container */}
      <div className={`space-y-2 pr-1 custom-scrollbar overflow-x-hidden ${isDesktopDrawer ? "flex-1 overflow-y-auto" : "max-h-[280px] overflow-y-auto"}`}>
        <AnimatePresence initial={false}>
          {activeList.length === 0 ? (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xs text-brand-primary/60 text-center py-6 font-medium"
            >
              {activeTab === "archived"
                ? "No archived alerts."
                : activeTab === "read"
                  ? "No read alerts."
                  : strings.empty_notifications || "No notifications."}
            </motion.p>
          ) : (
            activeList.map((n) => {
              const { title, body } = translateNotification(n);
              const isSelected = selectedIds.includes(n.id);

              return (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className={`p-3 rounded-2xl text-xs space-y-1 cursor-pointer transition-all flex items-start gap-2.5 ${
                    n.is_read
                      ? "bg-brand-surface/40 opacity-55 border-l-4 border-transparent"
                      : "bg-brand-surface/80 border-l-4 border-brand-accent font-semibold"
                  } ${isSelected ? "ring-2 ring-brand-accent/50 bg-brand-accent/5" : ""}`}
                  onClick={() => {
                    if (selectionMode) {
                      handleSelectToggle(n.id);
                      return;
                    }
                    if (!n.is_read) {
                      setLocalNotifications((prev) =>
                        prev.map((notif) =>
                          notif.id === n.id ? { ...notif, is_read: true } : notif
                        )
                      );
                      onMarkNotificationRead(n.id);
                    }
                    if (renderDetail) {
                      setDetailNotification(n);
                    }
                    if (onNotificationClick) {
                      onNotificationClick(n);
                    }
                  }}
                >
                  {selectionMode && (
                    <div className="mt-0.5 shrink-0">
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-brand-accent" />
                      ) : (
                        <Square className="w-4 h-4 text-brand-primary/40" />
                      )}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between font-bold text-brand-primary items-start">
                      <span className="truncate pr-1 text-brand-primary font-bold">{title}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[9px] text-brand-primary/60 font-numeric">
                          {new Date(n.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {!n.is_read && (
                          <button
                            type="button"
                            title="Mark as read"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLocalNotifications((prev) =>
                                prev.map((notif) =>
                                  notif.id === n.id ? { ...notif, is_read: true } : notif
                                )
                              );
                              onMarkNotificationRead(n.id);
                            }}
                            className="p-0.5 rounded bg-brand-accent/10 hover:bg-brand-accent/20 text-brand-accent cursor-pointer transition-all shrink-0"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-brand-primary leading-normal break-words mt-0.5 text-[11px] font-normal">
                      {body}
                    </p>
                    {n.reference_id && (
                      <span className="text-[9px] text-brand-accent underline font-numeric cursor-pointer block mt-1">
                        Ref: #{n.reference_id.slice(0, 8)}
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </>
    );
  };

  if (isMobile) {
    return (
      <div
        className="gradient-border-glow-tab-active bg-white border-b border-brand-secondary/30 max-h-[420px] overflow-y-auto overflow-x-hidden custom-scrollbar shadow-inner p-4 space-y-3 z-30 text-brand-primary"
        id="notification_center_panel"
      >
        {renderInnerContent(false)}
      </div>
    );
  }

  return createPortal(
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-black/30 z-40"
        onClick={handleClose}
      />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="gradient-border-glow-tab-active fixed inset-y-0 right-0 h-full w-80 sm:w-96 bg-white border-l border-brand-secondary/25 rounded-l-3xl shadow-2xl p-4.5 z-50 text-brand-primary flex flex-col"
        id="notification_center_panel"
      >
        {renderInnerContent(true)}
      </motion.div>
    </>,
    document.body
  );
};
