import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  User,
  AlertTriangle,
  ArrowLeft,
  FileText,
  DollarSign,
  TrendingUp,
  Briefcase,
  ChevronRight,
  ShieldCheck,
  Building,
  Phone,
  Calendar,
  Percent
} from "lucide-react";
import { Profile, Transaction, Loan, ClientBalance, LoanRepayment } from "../types";
import { dbService, STATIC_BRANCHES } from "../services/db";

interface AccountInspectorPanelProps {
  user: Profile;
  allProfiles: Profile[];
  allTransactions: Transaction[];
  allLoans: Loan[];
  allBalances: ClientBalance[];
  strings: Record<string, string>;
  dataSaverMode: boolean;
  tappedPhotos: Record<string, boolean>;
  setTappedPhotos: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}

export const AccountInspectorPanel: React.FC<AccountInspectorPanelProps> = ({
  user,
  allProfiles,
  allTransactions,
  allLoans,
  allBalances,
  strings,
  dataSaverMode,
  tappedPhotos,
  setTappedPhotos
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [loggedProfileId, setLoggedProfileId] = useState<string | null>(null);

  // Auto-log access when selected profile changes
  useEffect(() => {
    if (selectedProfile && selectedProfile.id !== loggedProfileId) {
      setLoggedProfileId(selectedProfile.id);
      dbService.logAccountInspectorView(user, selectedProfile);
    }
  }, [selectedProfile, user, loggedProfileId]);

  // Handle clearing selection
  const handleBackToSearch = () => {
    setSelectedProfile(null);
    setLoggedProfileId(null);
  };

  // Search matches for clients and agents
  const searchResults = useMemo(() => {
    const validProfiles = allProfiles
      .filter((p) => p.role === "client" || p.role === "agent")
      .sort((a, b) => {
        const timeA = new Date(a.joined_at || ((a as any).created_at) || 0).getTime();
        const timeB = new Date(b.joined_at || ((b as any).created_at) || 0).getTime();
        return timeB - timeA;
      });

    if (!searchTerm.trim()) return validProfiles;
    const query = searchTerm.toLowerCase().trim();
    return validProfiles.filter((p) => {
      const nameMatch = p.full_name?.toLowerCase().includes(query);
      const phoneMatch = p.phone?.toLowerCase().includes(query);
      const displayIdMatch = p.unique_display_id?.toLowerCase().includes(query);
      return nameMatch || phoneMatch || displayIdMatch;
    });
  }, [searchTerm, allProfiles]);

  // Selected Profile Balance
  const profileBalance = useMemo(() => {
    if (!selectedProfile) return 0;
    if (selectedProfile.role === "agent") {
      return dbService.getAgentSavingsBalance(selectedProfile.id)?.balance || 0;
    }
    return allBalances.find((b) => b.client_id === selectedProfile.id)?.balance || 0;
  }, [selectedProfile, allBalances]);

  // Selected Profile Transactions
  const profileTransactions = useMemo(() => {
    if (!selectedProfile) return [];
    return allTransactions.filter(
      (t) => t.client_id === selectedProfile.id || t.agent_id === selectedProfile.id
    );
  }, [selectedProfile, allTransactions]);

  // Selected Profile Loans
  const profileLoans = useMemo(() => {
    if (!selectedProfile || selectedProfile.role !== "client") return [];
    return allLoans.filter((l) => l.client_id === selectedProfile.id);
  }, [selectedProfile, allLoans]);

  return (
    <div className="w-full space-y-6">
      {/* 1. Header Area */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white rounded-3xl border border-brand-secondary/15 p-6 shadow-xs animate-fade-in text-brand-primary">
        <div>
          <h2 className="font-display font-extrabold text-2xl tracking-tight">
            {strings.menu_account_inspector || "Account Inspector"}
          </h2>
          <p className="text-xs text-brand-primary/60 font-sans mt-1">
            {strings.perm_accounts_view_readonly_desc || "Read-only inspection of client and agent profiles."}
          </p>
        </div>
        {selectedProfile && (
          <button
            id="inspector-btn-back"
            onClick={handleBackToSearch}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-primary hover:bg-brand-accent text-white font-bold text-xs rounded-xl cursor-pointer transition-all shadow-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            {strings.back || "Back to Search"}
          </button>
        )}
      </div>

      {/* 2. PERSISTENT WARNING BANNER (When Profile Selected) */}
      {selectedProfile && (
        <div 
          id="inspector-warning-banner"
          className="bg-amber-50 border border-amber-200 rounded-3xl p-5 flex items-start gap-4 shadow-xs animate-fade-in text-amber-900"
        >
          <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-display font-bold text-sm">
              {strings.warning || "Attention"}
            </h4>
            <p className="text-xs font-semibold">
              {(strings.inspector_banner || "Read-Only Account Inspector — Viewing {name}'s account. No actions can be performed from this screen.")
                .replace("{name}", selectedProfile.full_name)}
            </p>
          </div>
        </div>
      )}

      {/* 3. Search and Selection Screen */}
      {!selectedProfile ? (
        <div className="bg-white rounded-3xl border border-brand-secondary/15 p-6 shadow-xs animate-fade-in text-brand-primary space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-brand-primary/70 uppercase tracking-wider block">
              {strings.table_member_name || "Profile Lookup"}
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-brand-primary/40 absolute left-4 top-3.5" />
              <input
                id="inspector-search-input"
                type="text"
                placeholder={strings.inspector_search_placeholder || "Search clients or agents by name, phone, or ID..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full text-xs font-numeric pl-11 pr-4 py-3.5 rounded-2xl border border-brand-secondary focus:outline-none focus:ring-1 focus:ring-brand-primary text-brand-primary"
              />
            </div>
          </div>

          {/* Search Results Display - Always visible by default */}
          <div className="space-y-3">
            <h3 className="font-display font-bold text-xs uppercase tracking-wider text-brand-primary/50">
              {searchTerm.trim() !== "" 
                ? `${strings.search_results || "Search Results"} (${searchResults.length})`
                : `${strings.inspector_section_profile_summary || "Profiles Directory"} (${searchResults.length})`}
            </h3>
            
            {searchResults.length > 0 ? (
              <div className="border border-brand-secondary/15 rounded-2xl overflow-hidden divide-y divide-brand-surface">
                {searchResults.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => setSelectedProfile(p)}
                    className="p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4 hover:bg-brand-surface/15 cursor-pointer transition-all animate-fade-in"
                  >
                    <div className="flex items-center gap-3">
                      <div className="gradient-border-glow-avatar rounded-full p-[1.5px] shrink-0">
                        {p.photo_url && (!dataSaverMode || tappedPhotos[p.id]) ? (
                          <img
                            src={p.photo_url}
                            alt={p.full_name}
                            className="w-10 h-10 rounded-full object-cover border border-brand-secondary/20"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div 
                            onClick={(e) => {
                              if (p.photo_url && dataSaverMode) {
                                e.stopPropagation();
                                setTappedPhotos(prev => ({ ...prev, [p.id]: true }));
                              }
                            }}
                            className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold uppercase border transition-all ${
                              p.photo_url && dataSaverMode && !tappedPhotos[p.id]
                                ? "bg-brand-accent/20 border-brand-accent text-brand-primary hover:bg-brand-accent/30 cursor-pointer"
                                : "bg-brand-surface/70 border-brand-secondary/10 text-brand-primary/50"
                            }`}
                          >
                            {p.photo_url && dataSaverMode && !tappedPhotos[p.id] ? "DS" : p.full_name.split(" ").map(n => n[0]).slice(0, 2).join("")}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="font-display font-bold text-sm text-brand-primary flex items-center gap-2">
                          {p.full_name}
                          <span className={`text-[9px] font-bold py-0.5 px-2 rounded-full font-sans uppercase border ${
                            p.role === "agent" 
                              ? "bg-brand-surface text-brand-accent border-brand-secondary/30" 
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }`}>
                            {p.role === "agent" ? (strings.agent || "DC") : (strings.client || "Client")}
                          </span>
                        </div>
                        <div className="text-[11px] text-brand-primary/50 font-mono mt-0.5">
                          ID: {p.unique_display_id} • {p.phone}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 justify-between sm:justify-end">
                      <div className="text-left sm:text-right font-numeric text-xs">
                        <span className="text-[10px] text-brand-primary/50 block font-bold uppercase">
                          {STATIC_BRANCHES.find(b => b.id === p.branch_id)?.name || "Branch"}
                        </span>
                        <span className="text-brand-primary/60 font-semibold">{p.subdivision}</span>
                      </div>
                      <ChevronRight className="w-5 h-5 text-brand-primary/30 hidden sm:block" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border border-brand-secondary/15 rounded-3xl p-10 text-center space-y-2">
                <User className="w-8 h-8 text-brand-primary/30 mx-auto" />
                <p className="text-xs text-brand-primary/50 font-semibold">
                  {strings.no_records || "No matching profiles found."}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* 4. READ-ONLY PROFILE FILE DISPLAY */
        <div className="space-y-6">
          {/* Section: Profile Info Cards */}
          <div className="bg-white rounded-3xl border border-brand-secondary/15 p-6 sm:p-8 shadow-xs animate-fade-in text-brand-primary space-y-6">
            <div className="flex flex-col sm:flex-row gap-6 justify-between items-start sm:items-center border-b border-brand-surface pb-6">
              <div className="flex gap-4 items-center">
                <div className="gradient-border-glow-avatar rounded-full p-[1.5px] shrink-0">
                  {selectedProfile.photo_url && (!dataSaverMode || tappedPhotos[selectedProfile.id]) ? (
                    <img
                      src={selectedProfile.photo_url}
                      alt={selectedProfile.full_name}
                      className="w-16 h-16 rounded-full object-cover border-2 border-brand-primary aspect-square shadow-sm"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div 
                      onClick={() => selectedProfile.photo_url && setTappedPhotos(prev => ({ ...prev, [selectedProfile.id]: true }))}
                      className={`w-16 h-16 rounded-full border-2 border-brand-primary flex items-center justify-center aspect-square transition-all ${
                        selectedProfile.photo_url && dataSaverMode && !tappedPhotos[selectedProfile.id]
                          ? "bg-brand-accent/20 border-brand-accent text-brand-primary hover:bg-brand-accent/30 cursor-pointer text-xs font-bold"
                          : "bg-brand-surface/70 text-brand-primary"
                      }`}
                    >
                      {selectedProfile.photo_url && dataSaverMode && !tappedPhotos[selectedProfile.id] ? (
                        "DS"
                      ) : (
                        <User className="w-8 h-8" />
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-display font-extrabold text-xl flex items-center gap-2 flex-wrap">
                    {selectedProfile.full_name}
                    <span className={`text-[9px] font-bold py-0.5 px-2.5 rounded-full font-sans uppercase border ${
                      selectedProfile.role === "agent" 
                        ? "bg-brand-surface text-brand-accent border-brand-secondary/30" 
                        : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    }`}>
                      {selectedProfile.role === "agent" ? (strings.agent || "DC") : (strings.client || "Client")}
                    </span>
                  </h3>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="bg-brand-primary text-white text-[10px] font-bold py-0.5 px-3 rounded-full font-numeric">
                      {selectedProfile.unique_display_id}
                    </span>
                    <span className="text-xs text-brand-primary/60 font-semibold flex items-center gap-1">
                      <Building className="w-3.5 h-3.5" />
                      {STATIC_BRANCHES.find(b => b.id === selectedProfile.branch_id)?.name || "Branch"} ({selectedProfile.subdivision})
                    </span>
                    <span className="text-xs text-brand-primary/60 font-semibold flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" />
                      {selectedProfile.phone}
                    </span>
                    {(() => {
                      const status = selectedProfile.account_status || (selectedProfile.is_active ? 'active' : 'inactive');
                      const badgeStyles = {
                        active: "bg-emerald-100 text-emerald-800 border-emerald-300",
                        inactive: "bg-rose-100 text-rose-800 border-rose-300",
                        frozen: "bg-sky-100 text-sky-800 border-sky-300",
                        paused: "bg-amber-100 text-amber-800 border-amber-300",
                      }[status] || "bg-emerald-100 text-emerald-800 border-emerald-300";
                      
                      const labels = {
                        active: "ACTIVE",
                        inactive: "DEACTIVATED",
                        frozen: "FROZEN",
                        paused: "PAUSED",
                      }[status] || "ACTIVE";

                      return (
                        <span className={`text-[9px] font-black py-0.5 px-2.5 rounded-full border uppercase tracking-wider ${badgeStyles}`}>
                          ● {labels}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* Profile Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-brand-surface/20 rounded-2xl p-4 border border-brand-surface space-y-1">
                <span className="text-[10px] text-brand-primary/50 block font-bold uppercase tracking-wide">
                  {strings.x_national_id_cni || "National ID / CNI"}
                </span>
                <span className="text-xs font-bold font-numeric">
                  {selectedProfile.national_id || "N/A"}
                </span>
              </div>

              <div className="bg-brand-surface/20 rounded-2xl p-4 border border-brand-surface space-y-1">
                <span className="text-[10px] text-brand-primary/50 block font-bold uppercase tracking-wide">
                  {strings.birthday || "Date of Birth"}
                </span>
                <span className="text-xs font-bold font-numeric">
                  {selectedProfile.birthday || "N/A"}
                </span>
              </div>

              <div className="bg-brand-surface/20 rounded-2xl p-4 border border-brand-surface space-y-1">
                <span className="text-[10px] text-brand-primary/50 block font-bold uppercase tracking-wide">
                  {strings.inspector_section_savings_balance || "Current Balance"}
                </span>
                <span className="text-sm font-extrabold font-numeric text-brand-accent">
                  {profileBalance.toLocaleString()} FCFA
                </span>
              </div>

              <div className="bg-brand-surface/20 rounded-2xl p-4 border border-brand-surface space-y-1">
                <span className="text-[10px] text-brand-primary/50 block font-bold uppercase tracking-wide">
                  {strings.table_join_date || "Enrollment Date"}
                </span>
                <span className="text-xs font-bold font-numeric flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-brand-primary/40" />
                  {selectedProfile.joined_at ? selectedProfile.joined_at.split("T")[0] : "N/A"}
                </span>
              </div>
            </div>
          </div>

          {/* Section: Transaction and Loan Histories */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Transaction History Column */}
            <div className="bg-white rounded-3xl border border-brand-secondary/15 p-6 shadow-xs animate-fade-in text-brand-primary space-y-4">
              <div className="flex items-center gap-2 border-b border-brand-surface pb-3">
                <TrendingUp className="w-5 h-5 text-brand-primary/60 shrink-0" />
                <h4 className="font-display font-extrabold text-sm uppercase tracking-wider text-brand-primary/80">
                  {strings.inspector_section_transactions || "Transaction History"} ({profileTransactions.length})
                </h4>
              </div>

              <div className="border border-brand-surface rounded-2xl overflow-hidden divide-y divide-brand-surface max-h-[400px] overflow-y-auto custom-scrollbar">
                {profileTransactions.map((t) => (
                  <div
                    key={t.id}
                    className="p-4 flex justify-between items-center text-xs hover:bg-brand-surface/5"
                  >
                    <div>
                      <span className="font-bold block capitalize text-brand-primary">
                        {strings.receipt_label ? strings.receipt_label.replace("{type}", t.type) : t.type}
                      </span>
                      <span className="text-[10px] text-brand-primary/40 block font-mono">
                        REF: {t.id.slice(0, 8).toUpperCase()} • {t.payment_method || "Cash"}
                      </span>
                      <span className="text-[10px] text-brand-primary/40 block mt-0.5">
                        {t.created_at ? t.created_at.split("T")[0] : ""} {t.created_at ? t.created_at.split("T")[1]?.slice(0, 5) : ""}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-extrabold font-numeric block text-brand-primary">
                        {t.amount.toLocaleString()} FCFA
                      </span>
                      <span className={`text-[9px] uppercase font-bold py-0.5 px-2 rounded-full inline-block ${
                        t.status === "confirmed" || t.status === "resolved"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                          : t.status === "disputed" || t.status === "rejected" || t.status === "escalated"
                          ? "bg-rose-50 text-rose-700 border border-rose-100"
                          : "bg-amber-50 text-amber-700 border border-amber-100"
                      }`}>
                        {t.status}
                      </span>
                    </div>
                  </div>
                ))}
                {profileTransactions.length === 0 && (
                  <div className="text-center py-10 space-y-2 text-brand-primary/50">
                    <FileText className="w-8 h-8 mx-auto text-brand-primary/30" />
                    <p className="text-xs font-semibold">
                      {strings.inspector_no_transactions || "No transactions found for this profile."}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Loan History Column (Or Commission settings for agents) */}
            <div className="bg-white rounded-3xl border border-brand-secondary/15 p-6 shadow-xs animate-fade-in text-brand-primary space-y-4">
              {selectedProfile.role === "client" ? (
                <>
                  <div className="flex items-center gap-2 border-b border-brand-surface pb-3">
                    <Percent className="w-5 h-5 text-brand-primary/60 shrink-0" />
                    <h4 className="font-display font-extrabold text-sm uppercase tracking-wider text-brand-primary/80">
                      {strings.inspector_section_loans || "Loan History"} ({profileLoans.length})
                    </h4>
                  </div>

                  <div className="border border-brand-surface rounded-2xl overflow-hidden divide-y divide-brand-surface max-h-[400px] overflow-y-auto custom-scrollbar">
                    {profileLoans.map((l) => (
                      <div
                        key={l.id}
                        className="p-4 space-y-3 hover:bg-brand-surface/5"
                      >
                        <div className="flex justify-between items-start text-xs">
                          <div>
                            <span className="font-bold block text-brand-primary">
                              {strings.mem_loan_purpose_prefix ? strings.mem_loan_purpose_prefix.replace("{purpose}", l.purpose) : l.purpose}
                            </span>
                            <span className="text-[10px] text-brand-primary/40 block font-numeric mt-0.5">
                              {strings.mem_loan_rate_line
                                ? strings.mem_loan_rate_line.replace("{pct}", String(l.interest_rate_pct)).replace("{months}", String(l.term_months))
                                : `${l.interest_rate_pct}% interest • ${l.term_months} Months`}
                            </span>
                            <span className="text-[10px] text-brand-primary/40 block">
                              Logged: {l.created_at ? l.created_at.split("T")[0] : ""}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-extrabold font-numeric block text-brand-primary">
                              {l.amount.toLocaleString()} FCFA
                            </span>
                            <span className={`text-[9px] uppercase font-bold py-0.5 px-2 rounded-full inline-block ${
                              l.status === "active" || l.status === "approved"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                : l.status === "rejected"
                                ? "bg-rose-50 text-rose-700 border border-rose-100"
                                : "bg-amber-50 text-amber-700 border border-amber-100"
                            }`}>
                              {l.status}
                            </span>
                          </div>
                        </div>

                        {/* Read-only repayments schedule */}
                        {(() => {
                          const repayments = dbService.getLoanRepayments(user, l.id);
                          if (repayments.length === 0) return null;
                          return (
                            <div className="bg-brand-surface/15 rounded-xl p-3 space-y-2 border border-brand-secondary/10">
                              <span className="text-[9px] uppercase font-bold text-brand-primary/60 block">
                                Repayments Schedule
                              </span>
                              <div className="divide-y divide-brand-surface/40 max-h-[120px] overflow-y-auto custom-scrollbar">
                                {repayments.map((r, rIdx) => (
                                  <div key={r.id || rIdx} className="py-1.5 flex justify-between items-center text-[10px]">
                                    <span className="font-mono text-brand-primary/60">
                                      Due {r.due_date}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold font-numeric">
                                        {r.amount_paid.toLocaleString()} / {r.amount_due.toLocaleString()} FCFA
                                      </span>
                                      <span className={`text-[8px] font-bold uppercase ${
                                        r.status === "confirmed" ? "text-emerald-600" : "text-amber-600"
                                      }`}>
                                        {r.status}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    ))}
                    {profileLoans.length === 0 && (
                      <div className="text-center py-10 space-y-2 text-brand-primary/50">
                        <Percent className="w-8 h-8 mx-auto text-brand-primary/30" />
                        <p className="text-xs font-semibold">
                          {strings.inspector_no_loans || "No loans on file for this client."}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* Sales Agent Specific Information */
                <>
                  <div className="flex items-center gap-2 border-b border-brand-surface pb-3">
                    <Briefcase className="w-5 h-5 text-brand-primary/60 shrink-0" />
                    <h4 className="font-display font-extrabold text-sm uppercase tracking-wider text-brand-primary/80">
                      Daily Collector Portfolio Overview
                    </h4>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-brand-surface/20 rounded-2xl p-4 border border-brand-surface space-y-3">
                      <span className="text-[10px] text-brand-primary/50 block font-bold uppercase tracking-wide">
                        Affiliation Summary
                      </span>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-brand-primary/60 font-semibold">Recruited Clients</span>
                          <span className="font-bold font-numeric">
                            {allProfiles.filter(p => p.recruited_by === selectedProfile.id).length}
                          </span>
                        </div>
                        <div className="flex justify-between items-center border-t border-brand-surface/40 pt-2">
                          <span className="text-brand-primary/60 font-semibold">Commission Accrual Rate</span>
                          <span className="font-bold font-numeric">
                            {(() => {
                              const config = dbService.getCommissionRates(user).find(r => r.branch_id === selectedProfile.branch_id);
                              return config ? `${config.deposit_pct}% on deposits` : "3% on deposits";
                            })()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="border border-brand-secondary/15 rounded-2xl p-5 text-center space-y-2 bg-brand-surface/5 border-dashed">
                      <ShieldCheck className="w-8 h-8 text-emerald-600 mx-auto" />
                      <p className="font-display font-bold text-xs text-emerald-800 uppercase tracking-wider">
                        Authorized Field DC
                      </p>
                      <p className="text-[11px] text-brand-primary/50">
                        All operations, deposit routing logs, and active status for this Daily Collector have been logged and verified by the system audit ledger.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
