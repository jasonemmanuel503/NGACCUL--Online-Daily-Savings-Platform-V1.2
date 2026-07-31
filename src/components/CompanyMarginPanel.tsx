import React, { useState } from "react";
import { Profile, Transaction, BranchID } from "../types";
import { exportPDF, NestedPdfSheetSpec as NestedExcelSheetSpec, NestedPdfSection as NestedExcelSection } from "../utils/pdfExport";
import { STATIC_BRANCHES, dbService } from "../services/db";
import { PeriodFilter, PeriodType } from "./PeriodFilter";
import { 
  Percent, 
  Download, 
  Search, 
  Building2, 
  ArrowUpDown,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Send,
  CheckCircle2,
  AlertOctagon,
  AlertTriangle,
  RefreshCw
} from "lucide-react";

interface CompanyMarginPanelProps {
  user: any;
  allProfiles: Profile[];
  allTxns: Transaction[];
  selectedBranches: BranchID[];
  strings: any;
  showBanner: (msg: string, type: "success" | "error") => void;
  marginPeriod: PeriodType;
  setMarginPeriod: (p: PeriodType) => void;
  marginStartDate: string;
  setMarginStartDate: (d: string) => void;
  marginEndDate: string;
  setMarginEndDate: (d: string) => void;
  language?: string;
}

export const CompanyMarginPanel: React.FC<CompanyMarginPanelProps> = ({
  user,
  allProfiles,
  allTxns,
  selectedBranches,
  strings,
  showBanner,
  marginPeriod,
  setMarginPeriod,
  marginStartDate,
  setMarginStartDate,
  marginEndDate,
  setMarginEndDate,
  language = "en"
}) => {
  const isPdg = user.role === "pdg";
  const isBranchAdmin = user.role === "branch_admin";
  const userBranch = user.branch_id as BranchID;

  // Search, Pagination, Sorting and View Type states
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<"client" | "agent" | "amount" | "fee" | "net" | "date" | "branch">("date");
  const [processingAgentIds, setProcessingAgentIds] = useState<Set<string>>(new Set());
  const [sortAsc, setSortAsc] = useState(false);
  const [marginType, setMarginType] = useState<"withdrawals" | "registrations">("withdrawals");

  const [submissions, setSubmissions] = useState(() => dbService.getMarginSubmissions(user));
  const [isSending, setIsSending] = useState(false);

  // Bulk Cash Remittance state
  const [bulkRemitModalOpen, setBulkRemitModalOpen] = useState(false);
  const [bulkRemitAgentId, setBulkRemitAgentId] = useState("");
  const [bulkRemitDate, setBulkRemitDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [bulkRemitCountedCash, setBulkRemitCountedCash] = useState("");
  const [isBulkRemitting, setIsBulkRemitting] = useState(false);

  React.useEffect(() => {
    setSubmissions(dbService.getMarginSubmissions(user));
  }, [user, allTxns]);

  const itemsPerPage = 15;
  const isRegistrations = marginType === "registrations";

  // Filter withdrawals matching company margin criteria
  const confirmedWithdrawals = allTxns.filter((tx) => {
    if (tx.type !== "withdrawal" || tx.status !== "confirmed") {
      return false;
    }

    if (isPdg) {
      if (selectedBranches.length > 0 && !selectedBranches.includes(tx.branch_id)) {
        return false;
      }
    } else {
      if (tx.branch_id !== userBranch) {
        return false;
      }
    }

    const txDate = new Date(tx.created_at);

    if (marginStartDate && txDate.getTime() < new Date(marginStartDate).getTime()) {
      return false;
    }
    if (marginEndDate && txDate.getTime() > new Date(marginEndDate).setHours(23, 59, 59, 999)) {
      return false;
    }

    return true;
  });

  const rawWithdrawalItems = confirmedWithdrawals.map((tx) => {
    const client = allProfiles.find((p) => p.id === tx.client_id);
    const effectiveAgentId = tx.agent_id || (client ? dbService.resolveEffectiveAgent(client.id, tx.created_at.slice(0, 10)) : "");
    const agent = allProfiles.find((p) => p.id === effectiveAgentId);
    
    const fee = tx.withdrawal_fee || Math.round(tx.amount * 0.03);
    const net = tx.amount - fee;
    const clientName = client ? client.full_name : "N/A";
    const agentName = agent ? agent.full_name : "N/A";
    const branchName = STATIC_BRANCHES.find(b => b.id === tx.branch_id)?.name || tx.branch_id.toUpperCase();

    return {
      tx,
      clientName,
      agentName,
      fee,
      net,
      branchName,
      date: tx.created_at.slice(0, 10)
    };
  });

  // Fetch and filter recruitment ledger entries
  const filteredRecruitments = dbService.getCommissionLedger(user).filter((l) => {
    if (l.type !== "recruitment") {
      return false;
    }

    if (isPdg) {
      if (selectedBranches.length > 0 && !selectedBranches.includes(l.branch_id)) {
        return false;
      }
    } else {
      if (l.branch_id !== userBranch) {
        return false;
      }
    }

    const accruedDate = new Date(l.accrued_at);

    if (marginStartDate && accruedDate.getTime() < new Date(marginStartDate).getTime()) {
      return false;
    }
    if (marginEndDate && accruedDate.getTime() > new Date(marginEndDate).setHours(23, 59, 59, 999)) {
      return false;
    }

    return true;
  });

  const rawRegistrationItems = filteredRecruitments.map((entry) => {
    const client = allProfiles.find((p) => p.id === entry.reference_id);
    const agent = allProfiles.find((p) => p.id === entry.agent_id);

    const agentShare = entry.amount_fcfa;
    const totalFee = entry.rate_snapshot?.recruitment_fee || 1000;
    const companyShare = totalFee - agentShare;

    const clientName = client ? client.full_name : "N/A";
    const agentName = agent ? agent.full_name : "N/A";
    const branchName = STATIC_BRANCHES.find(b => b.id === entry.branch_id)?.name || entry.branch_id.toUpperCase();

    return {
      entry,
      clientName,
      agentName,
      totalFee,
      agentShare,
      companyShare,
      branchName,
      date: entry.accrued_at.slice(0, 10)
    };
  });

  // Calculate totals for summary cards
  const totalWithdrawn = rawWithdrawalItems.reduce((sum, item) => sum + item.tx.amount, 0);
  const totalFeeMargin = rawWithdrawalItems.reduce((sum, item) => sum + item.fee, 0);
  const totalNetPayout = rawWithdrawalItems.reduce((sum, item) => sum + item.net, 0);

  const totalRegistrations = rawRegistrationItems.length;
  const totalRegistrationFees = rawRegistrationItems.reduce((sum, item) => sum + item.totalFee, 0);
  const totalAgentCommissionPaid = rawRegistrationItems.reduce((sum, item) => sum + item.agentShare, 0);
  const totalCompanyMarginRegistration = rawRegistrationItems.reduce((sum, item) => sum + item.companyShare, 0);

  // Active items based on tab selection
  const activeRawItems = isRegistrations ? rawRegistrationItems : rawWithdrawalItems;

  // Apply search filtering
  const filteredItems = activeRawItems.filter(item => {
    const query = searchTerm.toLowerCase();
    return (
      item.clientName.toLowerCase().includes(query) ||
      item.agentName.toLowerCase().includes(query) ||
      item.branchName.toLowerCase().includes(query)
    );
  });

  // Sort items
  const sortedItems = [...filteredItems].sort((a, b) => {
    let valA: any = "";
    let valB: any = "";
    if (sortBy === "client") {
      valA = a.clientName.toLowerCase();
      valB = b.clientName.toLowerCase();
    } else if (sortBy === "agent") {
      valA = a.agentName.toLowerCase();
      valB = b.agentName.toLowerCase();
    } else if (sortBy === "branch") {
      valA = a.branchName.toLowerCase();
      valB = b.branchName.toLowerCase();
    } else if (sortBy === "date") {
      valA = a.date;
      valB = b.date;
    } else {
      if (isRegistrations) {
        const regA = a as any;
        const regB = b as any;
        if (sortBy === "amount") {
          valA = regA.totalFee;
          valB = regB.totalFee;
        } else if (sortBy === "fee") {
          valA = regA.agentShare;
          valB = regB.agentShare;
        } else if (sortBy === "net") {
          valA = regA.companyShare;
          valB = regB.companyShare;
        }
      } else {
        const withA = a as any;
        const withB = b as any;
        if (sortBy === "amount") {
          valA = withA.tx.amount;
          valB = withB.tx.amount;
        } else if (sortBy === "fee") {
          valA = withA.fee;
          valB = withB.fee;
        } else if (sortBy === "net") {
          valA = withA.net;
          valB = withB.net;
        }
      }
    }

    if (valA < valB) return sortAsc ? -1 : 1;
    if (valA > valB) return sortAsc ? 1 : -1;
    return 0;
  });

  // Pagination slicing
  const totalPages = Math.ceil(sortedItems.length / itemsPerPage) || 1;
  const paginatedItems = sortedItems.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(field);
      setSortAsc(false);
    }
    setCurrentPage(1);
  };

  const handleExportExcel = async () => {
    try {
      const sheets: NestedExcelSheetSpec[] = [];

      // Determine active branches for export
      const activeBranchesToExport = isPdg 
        ? (selectedBranches.length > 0 ? selectedBranches : STATIC_BRANCHES.map(b => b.id))
        : [user.branch_id as BranchID];

      for (const branchId of activeBranchesToExport) {
        const branchObj = STATIC_BRANCHES.find(b => b.id === branchId);
        const branchName = branchObj ? branchObj.name : branchId.toUpperCase();
        const sections: NestedExcelSection[] = [];
        const sanitizedSheetName = branchName.replace(/[:\\/?*\[\]]/g, "").substring(0, 30);

        if (isRegistrations) {
          // Filter items for this branch
          const branchItems = rawRegistrationItems.filter(item => item.entry.branch_id === branchId);

          // Group by agent
          const agentGroups: { [agentId: string]: typeof rawRegistrationItems } = {};
          branchItems.forEach(item => {
            const agentId = item.entry.agent_id || "direct";
            if (!agentGroups[agentId]) {
              agentGroups[agentId] = [];
            }
            agentGroups[agentId].push(item);
          });

          const agentIds = Object.keys(agentGroups);
          if (agentIds.length === 0) {
            sections.push({
              headerLabel: strings.margin_no_records_registrations || "No itemized registration fee records found in this period.",
              rows: []
            });
          } else {
            for (const agtId of agentIds) {
              const grp = agentGroups[agtId];
              const agentProfile = allProfiles.find(p => p.id === agtId);
              const agentName = agtId === "direct" ? "Direct Client (No Agent)" : (agentProfile ? agentProfile.full_name : `Agent ID: ${agtId}`);

              const totalBranchAgentRegistrations = grp.length;
              const totalBranchAgentFees = grp.reduce((sum, x) => sum + x.totalFee, 0);
              const totalBranchAgentCompanyShare = grp.reduce((sum, x) => sum + x.companyShare, 0);

              const sectionRows = grp.map(item => [
                item.clientName,
                item.totalFee,
                item.agentShare,
                item.companyShare,
                item.date
              ]);

              sections.push({
                headerLabel: agentName,
                headerSubLabel: `${totalBranchAgentRegistrations} registrations | ${totalBranchAgentFees.toLocaleString()} FCFA collected | ${totalBranchAgentCompanyShare.toLocaleString()} FCFA company margin`,
                rows: sectionRows
              });
            }
          }

          sheets.push({
            sheetName: sanitizedSheetName,
            columnHeaders: [
              strings.margin_col_client || "Client Name",
              (strings.margin_col_total_fee || "Total Fee") + " (FCFA)",
              (strings.margin_col_agent_share || "DC Share") + " (FCFA)",
              (strings.margin_col_company_share || "Company Share") + " (FCFA)",
              strings.margin_col_date || "Date"
            ],
            columnWidths: [25, 18, 18, 18, 15],
            sections
          });
        } else {
          // Filter items for this branch
          const branchItems = rawWithdrawalItems.filter(item => item.tx.branch_id === branchId);

          // Group by agent
          const agentGroups: { [agentId: string]: typeof rawWithdrawalItems } = {};
          branchItems.forEach(item => {
            const client = allProfiles.find((p) => p.id === item.tx.client_id);
            const effectiveAgentId = item.tx.agent_id || (client ? dbService.resolveEffectiveAgent(client.id, item.tx.created_at.slice(0, 10)) : "") || "direct";
            if (!agentGroups[effectiveAgentId]) {
              agentGroups[effectiveAgentId] = [];
            }
            agentGroups[effectiveAgentId].push(item);
          });

          const agentIds = Object.keys(agentGroups);
          if (agentIds.length === 0) {
            sections.push({
              headerLabel: strings.margin_no_records || "No itemized withdrawal transactions found in this period.",
              rows: []
            });
          } else {
            for (const agtId of agentIds) {
              const grp = agentGroups[agtId];
              const agentProfile = allProfiles.find(p => p.id === agtId);
              const agentName = agtId === "direct" ? "Direct Client (No Agent)" : (agentProfile ? agentProfile.full_name : `Agent ID: ${agtId}`);
              
              const totalBranchAgentWithdrawn = grp.reduce((sum, x) => sum + x.tx.amount, 0);
              const totalBranchAgentFee = grp.reduce((sum, x) => sum + x.fee, 0);

              const sectionRows = grp.map(item => [
                item.clientName,
                item.tx.amount,
                item.fee,
                item.net,
                item.date
              ]);

              sections.push({
                headerLabel: agentName,
                headerSubLabel: `${grp.length} withdrawals | ${totalBranchAgentWithdrawn.toLocaleString()} FCFA withdrawn | ${totalBranchAgentFee.toLocaleString()} FCFA fee margin`,
                rows: sectionRows
              });
            }
          }

          sheets.push({
            sheetName: sanitizedSheetName,
            columnHeaders: [
              strings.margin_col_client || "Client Name",
              (strings.margin_col_amount || "Withdrawal Amount") + " (FCFA)",
              (strings.margin_col_fee || "3% Fee Margin") + " (FCFA)",
              (strings.margin_col_net || "Net Payout") + " (FCFA)",
              strings.margin_col_date || "Withdrawal Date"
            ],
            columnWidths: [25, 20, 18, 18, 15],
            sections
          });
        }
      }

      const dateStr = new Date().toISOString().split("T")[0];
      const viewPrefix = isRegistrations ? "Registrations_Margin" : "Withdrawal_Margin";
      const filename = `${viewPrefix}_${dateStr}.pdf`;
      await exportPDF(sheets, filename);
      showBanner(language === "fr" ? "Exportation réussie !" : language === "ff" ? "Wurtini bee Excel jaɓaama tigi!" : "Export completed successfully!", "success");
    } catch (e: any) {
      console.error(e);
      showBanner(e.message || "Export failed.", "error");
    }
  };

  const handleSendToPdg = async () => {
    setIsSending(true);
    try {
      const start = marginStartDate || new Date().toISOString().slice(0, 10);
      const end = marginEndDate || new Date().toISOString().slice(0, 10);
      await dbService.submitMarginReport(user, start, end);
      showBanner(
        language === "fr" 
          ? "Rapport de marge soumis avec succès !" 
          : language === "ff" 
          ? "Rapor tigi jippinaama bee jam!" 
          : "Margin report successfully submitted to GM!", 
        "success"
      );
      setSubmissions(dbService.getMarginSubmissions(user));
    } catch (err: any) {
      showBanner(err.message || "Failed to submit report", "error");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div id="company-margin-dashboard-panel" className="bg-white dark:bg-[#150b24] rounded-3xl border border-brand-secondary/15 p-6 shadow-sm space-y-6 animate-fade-in text-xs font-sans text-brand-primary dark:text-white">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-brand-secondary/10">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-brand-primary/10 text-brand-primary dark:text-white rounded-xl">
              <Percent className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-display font-black uppercase tracking-wide">
              {strings.margin_title || "Company Margin Analysis"}
            </h2>
          </div>
          <p className="text-gray-500 dark:text-white/60 max-w-2xl text-[11px]">
            {isRegistrations 
              ? (strings.margin_desc_registrations || "Monitor company margins collected from client registration fees, apply period filters, and export results to Excel.")
              : (strings.margin_desc || "Monitor itemized withdrawal fee margins, apply period filters, and export results to Excel.")}
          </p>
        </div>

        {/* Action controls */}
        <div className="flex items-center gap-3">
          {isBranchAdmin && (
            <button
              id="company-margin-send-pdg-btn"
              onClick={handleSendToPdg}
              disabled={isSending}
              className="flex items-center gap-2 px-4 py-2 bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-50 text-white rounded-xl font-bold cursor-pointer transition-all shadow-sm"
            >
              <Send className="w-4 h-4 text-white" />
              <span>{isSending ? (strings.margin_sending || "Sending...") : (strings.margin_send_to_pdg || "Send to GM")}</span>
            </button>
          )}
          <button
            id="company-margin-export-btn"
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-brand-accent hover:bg-brand-accent/90 text-white rounded-xl font-bold cursor-pointer transition-all shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span>{strings.portfolio_export_selected || "Export to Excel"}</span>
          </button>
        </div>
      </div>

      {/* Unified Filters section */}
      <div className="bg-brand-surface/30 p-4 rounded-2xl border border-brand-secondary/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* TABS SWITCHER */}
          <div className="flex items-center bg-white dark:bg-[#150b24] p-1 rounded-xl border border-brand-secondary/20 mr-2">
            <button
              type="button"
              onClick={() => {
                setMarginType("withdrawals");
                setSortBy("date");
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer ${
                marginType === "withdrawals"
                  ? "bg-brand-primary text-white shadow-xs"
                  : "text-brand-primary/60 dark:text-white/60 hover:text-brand-primary dark:hover:text-white"
              }`}
            >
              {strings.company_margin_withdrawals || "Withdrawals"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMarginType("registrations");
                setSortBy("date");
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer ${
                marginType === "registrations"
                  ? "bg-brand-primary text-white shadow-xs"
                  : "text-brand-primary/60 dark:text-white/60 hover:text-brand-primary dark:hover:text-white"
              }`}
            >
              {strings.company_margin_registrations || "Registrations"}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-500 dark:text-white/60 uppercase tracking-wider text-[10px]">
              {language === "fr" ? "Période" : language === "ff" ? "Wakkati" : "Period"}:
            </span>
            <PeriodFilter
              selectedPeriod={marginPeriod}
              onChangePeriod={(p) => {
                setMarginPeriod(p);
                setCurrentPage(1);
              }}
              startDate={marginStartDate}
              onStartDateChange={(d) => {
                setMarginStartDate(d);
                setCurrentPage(1);
              }}
              endDate={marginEndDate}
              onEndDateChange={(d) => {
                setMarginEndDate(d);
                setCurrentPage(1);
              }}
              className="py-1 px-2.5 gap-2 rounded-xl border border-brand-secondary/25 bg-white dark:bg-[#150b24] shadow-xs"
            />
          </div>
        </div>

        {/* Search input */}
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-brand-primary/45 dark:text-white/45" />
          <input
            id="company-margin-search"
            type="text"
            placeholder={isRegistrations ? (strings.portfolio_search_agent || "Search agents, clients...") : (strings.portfolio_search_agent || "Search agents, clients...")}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-brand-secondary/25 focus:ring-1 focus:ring-brand-accent focus:outline-hidden bg-white dark:bg-[#1c0f38] text-[11px] dark:text-white dark:placeholder:text-white/40"
          />
        </div>
      </div>

      {/* Summary Metrics Strip */}
      {isRegistrations ? (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-brand-primary/5 border border-brand-primary/10 rounded-2xl p-4 space-y-1">
            <span className="text-[10px] text-gray-400 dark:text-white/50 uppercase font-bold tracking-wider block">
              Total Registrations
            </span>
            <p className="text-xl font-display font-black text-brand-primary dark:text-white font-numeric">
              {totalRegistrations.toLocaleString()}
            </p>
          </div>

          <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 space-y-1">
            <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 uppercase font-bold tracking-wider block">
              Fees Collected
            </span>
            <p className="text-xl font-display font-black text-emerald-600 dark:text-emerald-400 font-numeric">
              {totalRegistrationFees.toLocaleString()}{" "}
              <span className="text-xs font-semibold text-emerald-500 dark:text-emerald-400/80">FCFA</span>
            </p>
          </div>

          <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4 space-y-1">
            <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80 uppercase font-bold tracking-wider block">
              DC Share Paid
            </span>
            <p className="text-xl font-display font-black text-amber-600 dark:text-amber-400 font-numeric">
              {totalAgentCommissionPaid.toLocaleString()}{" "}
              <span className="text-xs font-semibold text-amber-500 dark:text-amber-400/80">FCFA</span>
            </p>
          </div>

          <div className="bg-brand-accent/5 border border-brand-accent/10 rounded-2xl p-4 space-y-1">
            <span className="text-[10px] text-brand-accent dark:text-brand-accent/80 uppercase font-bold tracking-wider block">
              Company Margin
            </span>
            <p className="text-xl font-display font-black text-brand-accent dark:text-brand-accent font-numeric">
              {totalCompanyMarginRegistration.toLocaleString()}{" "}
              <span className="text-xs font-semibold text-brand-accent/80">FCFA</span>
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-brand-primary/5 border border-brand-primary/10 rounded-2xl p-4 space-y-1">
            <span className="text-[10px] text-gray-400 dark:text-white/50 uppercase font-bold tracking-wider block">
              {strings.margin_total_withdrawn || "Total Withdrawn"}
            </span>
            <p className="text-xl font-display font-black text-brand-primary dark:text-white font-numeric">
              {totalWithdrawn.toLocaleString()}{" "}
              <span className="text-xs font-semibold text-brand-secondary dark:text-white/80">FCFA</span>
            </p>
          </div>

          <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 space-y-1">
            <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 uppercase font-bold tracking-wider block">
              {strings.margin_total_fee || "Total Fee Margin (3%)"}
            </span>
            <p className="text-xl font-display font-black text-emerald-600 dark:text-emerald-400 font-numeric">
              {totalFeeMargin.toLocaleString()}{" "}
              <span className="text-xs font-semibold text-emerald-500 dark:text-emerald-400/80">FCFA</span>
            </p>
          </div>

          <div className="bg-brand-accent/5 border border-brand-accent/10 rounded-2xl p-4 space-y-1">
            <span className="text-[10px] text-brand-accent dark:text-brand-accent/80 uppercase font-bold tracking-wider block">
              {strings.margin_net_payout || "Total Net Payout"}
            </span>
            <p className="text-xl font-display font-black text-brand-accent dark:text-brand-accent font-numeric">
              {totalNetPayout.toLocaleString()}{" "}
              <span className="text-xs font-semibold text-brand-accent/80">FCFA</span>
            </p>
          </div>
        </div>
      )}

      {/* Itemized Table */}
      <div className="border border-brand-secondary/15 rounded-2xl overflow-hidden shadow-xs bg-white dark:bg-[#150b24]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-primary text-white text-[10px] uppercase font-bold tracking-wider">
                <th 
                  onClick={() => toggleSort("client")}
                  className="p-3 cursor-pointer hover:bg-brand-primary/95 transition-all select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>{strings.margin_col_client || "Client Name"}</span>
                    <ArrowUpDown className="w-3 h-3 opacity-80" />
                  </div>
                </th>
                <th 
                  onClick={() => toggleSort("agent")}
                  className="p-3 cursor-pointer hover:bg-brand-primary/95 transition-all select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>{isRegistrations ? (strings.margin_col_agent_recruited || "Recruiting DC") : (strings.margin_col_agent || "DC Name")}</span>
                    <ArrowUpDown className="w-3 h-3 opacity-80" />
                  </div>
                </th>
                {isPdg && (
                  <th 
                    onClick={() => toggleSort("branch")}
                    className="p-3 cursor-pointer hover:bg-brand-primary/95 transition-all select-none"
                  >
                    <div className="flex items-center gap-1">
                      <span>{strings.margin_col_branch || "Branch"}</span>
                      <ArrowUpDown className="w-3 h-3 opacity-80" />
                    </div>
                  </th>
                )}
                <th 
                  onClick={() => toggleSort("amount")}
                  className="p-3 text-right cursor-pointer hover:bg-brand-primary/95 transition-all select-none"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>{isRegistrations ? (strings.margin_col_total_fee || "Total Fee") : (strings.margin_col_amount || "Withdrawal Amount")}</span>
                    <ArrowUpDown className="w-3 h-3 opacity-80" />
                  </div>
                </th>
                <th 
                  onClick={() => toggleSort("fee")}
                  className="p-3 text-right cursor-pointer hover:bg-brand-primary/95 transition-all select-none"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>{isRegistrations ? (strings.margin_col_agent_share || "DC Share") : (strings.margin_col_fee || "3% Fee")}</span>
                    <ArrowUpDown className="w-3 h-3 opacity-80" />
                  </div>
                </th>
                <th 
                  onClick={() => toggleSort("net")}
                  className="p-3 text-right cursor-pointer hover:bg-brand-primary/95 transition-all select-none"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>{isRegistrations ? (strings.margin_col_company_share || "Company Share") : (strings.margin_col_net || "Net Payout")}</span>
                    <ArrowUpDown className="w-3 h-3 opacity-80" />
                  </div>
                </th>
                <th 
                  onClick={() => toggleSort("date")}
                  className="p-3 cursor-pointer hover:bg-brand-primary/95 transition-all select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>{strings.margin_col_date || "Date"}</span>
                    <ArrowUpDown className="w-3 h-3 opacity-80" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-secondary/10">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={isPdg ? 7 : 6} className="p-8 text-center text-gray-400 dark:text-white/40 font-medium">
                    {isRegistrations 
                      ? (strings.margin_no_records_registrations || "No itemized registration fee records found in this period.")
                      : (strings.margin_no_records || "No itemized withdrawal transactions found in this period.")}
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item: any, idx: number) => (
                  <tr key={isRegistrations ? `reg-${idx}-${item.entry.id}` : `with-${item.tx.id}`} className="hover:bg-brand-secondary/5 transition-all font-medium">
                    <td className="p-3 font-bold text-brand-primary dark:text-white">
                      {item.clientName}
                    </td>
                    <td className="p-3 text-gray-500 dark:text-white/60">
                      {item.agentName}
                    </td>
                    {isPdg && (
                      <td className="p-3">
                        <span className="flex items-center gap-1 text-gray-500 dark:text-white/60 font-bold">
                          <Building2 className="w-3 h-3 text-brand-secondary shrink-0" />
                          <span>{item.branchName}</span>
                        </span>
                      </td>
                    )}
                    <td className="p-3 text-right font-numeric font-bold text-gray-700 dark:text-white">
                      {(isRegistrations ? item.totalFee : item.tx.amount).toLocaleString()} FCFA
                    </td>
                    <td className="p-3 text-right font-numeric font-bold text-emerald-600 bg-emerald-500/5 dark:text-emerald-400 dark:bg-emerald-500/10">
                      {(isRegistrations ? item.agentShare : item.fee).toLocaleString()} FCFA
                    </td>
                    <td className="p-3 text-right font-numeric font-bold text-brand-accent">
                      {(isRegistrations ? item.companyShare : item.net).toLocaleString()} FCFA
                    </td>
                    <td className="p-3 text-gray-400 dark:text-white/40 font-numeric text-[11px]">
                      {item.date}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="bg-brand-surface/30 px-4 py-3 border-t border-brand-secondary/10 flex items-center justify-between">
            <span className="text-[10px] text-gray-500 dark:text-white/50 font-medium">
              {language === "fr" 
                ? `Affichage de ${(currentPage - 1) * itemsPerPage + 1} à ${Math.min(currentPage * itemsPerPage, sortedItems.length)} sur ${sortedItems.length} transactions`
                : language === "ff"
                ? `Hollugo ${(currentPage - 1) * itemsPerPage + 1} haa ${Math.min(currentPage * itemsPerPage, sortedItems.length)} dow ${sortedItems.length} njaɓugol`
                : `Showing ${(currentPage - 1) * itemsPerPage + 1} to ${Math.min(currentPage * itemsPerPage, sortedItems.length)} of ${sortedItems.length} transactions`
              }
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="p-1.5 rounded-lg border border-brand-secondary/25 bg-white dark:bg-[#150b24] disabled:opacity-45 hover:bg-gray-50 dark:hover:bg-[#1c0f38] transition-all cursor-pointer text-brand-primary dark:text-white"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[11px] font-bold px-2 text-brand-primary dark:text-white">
                {currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className="p-1.5 rounded-lg border border-brand-secondary/25 bg-white dark:bg-[#150b24] disabled:opacity-45 hover:bg-gray-50 dark:hover:bg-[#1c0f38] transition-all cursor-pointer text-brand-primary dark:text-white"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Submission History Section */}
      <div className="border border-brand-secondary/15 rounded-2xl overflow-hidden shadow-xs bg-white dark:bg-[#150b24] p-4 space-y-3">
        <h3 className="text-sm font-display font-black uppercase tracking-wide flex items-center gap-2 text-brand-primary dark:text-white">
          <Building2 className="w-4 h-4 text-brand-primary dark:text-white" />
          <span>{strings.margin_history_title || "Reconciliation Submission History"}</span>
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-brand-surface dark:bg-[#1c0f38] border-b border-brand-secondary/10 text-[10px] uppercase font-bold tracking-wider text-gray-500 dark:text-white/60">
                {isPdg && <th className="p-2">{strings.margin_col_branch || "Branch"}</th>}
                <th className="p-2">{strings.margin_history_col_period || "Covered Period"}</th>
                <th className="p-2 text-right">{strings.margin_history_col_total || "Total Margin Fee"}</th>
                <th className="p-2">{strings.margin_history_col_status || "Status"}</th>
                <th className="p-2">{strings.margin_history_col_submitted || "Submitted"}</th>
                <th className="p-2">{strings.margin_history_col_acknowledged || "Acknowledged"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-secondary/5">
              {submissions.length === 0 ? (
                <tr>
                  <td colSpan={isPdg ? 6 : 5} className="p-4 text-center text-gray-400 dark:text-white/40 font-medium">
                    {strings.margin_history_empty || "No reconciliation submission history found."}
                  </td>
                </tr>
              ) : (
                submissions.map((sub: any) => {
                  const branchName = STATIC_BRANCHES.find(b => b.id === sub.branch_id)?.name || sub.branch_id.toUpperCase();
                  const submitter = allProfiles.find(p => p.id === sub.submitted_by)?.full_name || sub.submitted_by;
                  const acknowledger = sub.acknowledged_by ? (allProfiles.find(p => p.id === sub.acknowledged_by)?.full_name || sub.acknowledged_by) : "";
                  return (
                    <tr key={sub.id} className="hover:bg-brand-secondary/5 transition-all text-[11px] font-medium">
                      {isPdg && <td className="p-2 font-bold text-brand-primary dark:text-white">{branchName}</td>}
                      <td className="p-2 text-gray-600 dark:text-white/60">
                        {sub.period_start} to {sub.period_end}
                      </td>
                      <td className="p-2 text-right font-numeric font-bold text-gray-700 dark:text-white">
                        {sub.total_margin_fcfa.toLocaleString()} FCFA
                      </td>
                      <td className="p-2">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                          sub.status === "acknowledged" 
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" 
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        }`}>
                          {sub.status === "acknowledged" ? (strings.margin_status_acknowledged || "Acknowledged") : (strings.margin_status_submitted || "Submitted")}
                        </span>
                      </td>
                      <td className="p-2 text-gray-500 dark:text-white/50">
                        <div>{sub.submitted_at.slice(0, 10)} {sub.submitted_at.slice(11, 16)}</div>
                        <div className="text-[9px] text-gray-400 dark:text-white/40">{submitter}</div>
                      </td>
                      <td className="p-2 text-gray-500 dark:text-white/50">
                        {sub.acknowledged_at ? (
                          <>
                             <div>{sub.acknowledged_at.slice(0, 10)} {sub.acknowledged_at.slice(11, 16)}</div>
                            <div className="text-[9px] text-gray-400 dark:text-white/40">{acknowledger}</div>
                          </>
                        ) : (
                          <span className="text-gray-400 dark:text-white/30 font-normal italic">--</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PENDING CASH DEPOSITS (AGENT-COLLECTED) GROUPED BY AGENT */}
      {(() => {
        let unremittedDeps = allTxns.filter((t) => {
          if (t.type !== "deposit") return false;
          if (!t.agent_id && !t.created_by) return false;
          if (t.payment_method === "mtn" || t.payment_method === "orange") return false;
          if (t.cash_remittance_confirmed) return false;
          if (t.is_archived) return false;
          if (t.status === "disputed" || t.status === "escalated" || t.status === "rejected") return false;
          const hasPendingCorrection = dbService.depositCorrectionRequests.some(
            (r: any) => r.transaction_id === t.id && r.status === "pending"
          );
          if (hasPendingCorrection) return false;
          if (!isPdg && t.branch_id !== userBranch) return false;
          if (isPdg && selectedBranches.length > 0 && !selectedBranches.includes(t.branch_id)) return false;
          return true;
        });

        const grouped: Record<string, { agentName: string; count: number; totalAmount: number }> = {};
        unremittedDeps.forEach((t) => {
          const agentId = t.agent_id || t.created_by || "unknown";
          const agentName = allProfiles.find((p) => p.id === agentId)?.full_name || "Unknown DC";
          if (!grouped[agentId]) grouped[agentId] = { agentName, count: 0, totalAmount: 0 };
          grouped[agentId].count += 1;
          grouped[agentId].totalAmount += Number(t.amount);
        });
        const groups = Object.entries(grouped);

        if (groups.length === 0) return null;

        const handleApproveAllForAgent = async (agentId: string, agentName: string, count: number, total: number) => {
          if (processingAgentIds.has(agentId)) return;
          const ok = window.confirm(
            `Approve ${count} deposit(s) totaling ${total.toLocaleString()} FCFA for ${agentName}? Confirm this matches the physical cash received.`
          );
          if (!ok) return;
          setProcessingAgentIds((prev) => new Set(prev).add(agentId));
          try {
            const res = await dbService.confirmAllPendingCashForAgent(user, agentId);
            showBanner(`Confirmed ${res.count} deposit(s) totaling ${res.totalAmount.toLocaleString()} FCFA for ${agentName}.`, "success");
          } catch (err: any) {
            showBanner(err.message || "Failed to confirm cash remittance.", "error");
          } finally {
            setProcessingAgentIds((prev) => {
              const next = new Set(prev);
              next.delete(agentId);
              return next;
            });
          }
        };

        return (
          <div className="bg-white dark:bg-[#1A103C] rounded-2xl p-5 border border-brand-secondary/15 shadow-xs space-y-3 font-sans">
            <h4 className="font-display font-black text-xs text-brand-primary dark:text-white uppercase tracking-wider">
              {strings.req_pending_cash_title || "Pending Cash Deposits — Agent Collections"}
            </h4>
            <div className="border border-brand-surface dark:border-white/10 rounded-xl overflow-hidden divide-y divide-brand-surface dark:divide-white/10">
              {groups.map(([agentId, data]) => {
                const isProcessing = processingAgentIds.has(agentId);
                return (
                  <div key={agentId} className="p-3.5 flex flex-col sm:flex-row gap-3 justify-between sm:items-center bg-brand-surface/5 dark:bg-white/5">
                    <div>
                      <span className="font-bold text-brand-primary dark:text-white block text-xs">{data.agentName}</span>
                      <span className="text-[10px] text-brand-primary/60 dark:text-white/60 block">
                        {data.count} pending deposit(s)
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-extrabold text-[#1A7A4A] dark:text-emerald-400 text-xs">
                        {data.totalAmount.toLocaleString()} FCFA
                      </span>
                      <button
                        id={`btn-margin-approve-all-${agentId}`}
                        disabled={isProcessing}
                        onClick={() => handleApproveAllForAgent(agentId, data.agentName, data.count, data.totalAmount)}
                        className={`px-3 py-1.5 text-white text-[10px] font-bold rounded-lg shadow-xs transition-all cursor-pointer ${
                          isProcessing ? "bg-gray-400 cursor-not-allowed opacity-60" : "bg-[#1A7A4A] hover:bg-[#145d38]"
                        }`}
                      >
                        {isProcessing ? "Processing..." : strings.btn_bulk_approve_all || "Approve All"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
};
