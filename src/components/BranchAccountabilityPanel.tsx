import React, { useState, useEffect } from "react";
import { Profile, BranchID, MarginSubmission } from "../types";
import { exportPDF, NestedPdfSheetSpec as NestedExcelSheetSpec, NestedPdfSection as NestedExcelSection } from "../utils/pdfExport";
import { STATIC_BRANCHES, dbService } from "../services/db";
import { 
  Building2, 
  ClipboardCheck, 
  Download, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp, 
  ChevronRight, 
  User, 
  Clock, 
  Send, 
  RefreshCw, 
  FileSpreadsheet, 
  AlertCircle, 
  Calendar,
  Check
} from "lucide-react";

interface BranchAccountabilityPanelProps {
  user: Profile;
  allProfiles: Profile[];
  strings: any;
  showBanner: (msg: string, type: "success" | "error") => void;
  language?: string;
}

export const BranchAccountabilityPanel: React.FC<BranchAccountabilityPanelProps> = ({
  user,
  allProfiles,
  strings,
  showBanner,
  language = "en"
}) => {
  const [submissions, setSubmissions] = useState<MarginSubmission[]>([]);
  const [expandedBranches, setExpandedBranches] = useState<{ [branchId: string]: boolean }>({});
  const [expandedSubmissions, setExpandedSubmissions] = useState<{ [submissionId: string]: boolean }>({});
  const [isProcessing, setIsProcessing] = useState(false);

  // Load submissions initially and on changes
  const loadSubmissions = () => {
    const fetched = dbService.getMarginSubmissions(user);
    setSubmissions(fetched);
  };

  useEffect(() => {
    loadSubmissions();
    if (user.role === "branch_admin" && user.branch_id) {
      setExpandedBranches({ [user.branch_id]: true });
    }
  }, [user]);

  // Group submissions by static branches
  const branchesToDisplay = user.role === "branch_admin"
    ? STATIC_BRANCHES.filter((b) => b.id === user.branch_id)
    : STATIC_BRANCHES;

  const branchGroups = branchesToDisplay.map((branch) => {
    const branchSubs = submissions.filter((s) => s.branch_id === branch.id);
    const totalMargin = branchSubs.reduce((sum, s) => sum + s.total_margin_fcfa, 0);
    return {
      branch,
      submissions: branchSubs,
      totalMargin,
    };
  });

  const toggleBranch = (branchId: string) => {
    setExpandedBranches((prev) => ({
      ...prev,
      [branchId]: !prev[branchId],
    }));
  };

  const toggleSubmission = (subId: string) => {
    setExpandedSubmissions((prev) => ({
      ...prev,
      [subId]: !prev[subId],
    }));
  };

  const handleAcknowledge = async (subId: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await dbService.acknowledgeMarginReport(user, subId);
      showBanner(
        language === "fr" 
          ? "Rapprochement approuvé et accusé de réception enregistré !" 
          : language === "ff" 
          ? "Rapor njaɓugol laaɓinaama kadi jaɓama!" 
          : "Reconciliation report successfully acknowledged!", 
        "success"
      );
      loadSubmissions();
    } catch (err: any) {
      showBanner(err.message || "Failed to acknowledge submission", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  // Build Nested Section for a single submission
  const getSubmissionSection = (sub: MarginSubmission): NestedExcelSection => {
    const submitter = allProfiles.find((p) => p.id === sub.submitted_by);
    const submitterName = submitter ? submitter.full_name : sub.submitted_by;
    const acknowledger = sub.acknowledged_by 
      ? (allProfiles.find((p) => p.id === sub.acknowledged_by)?.full_name || sub.acknowledged_by)
      : "";

    const rows = sub.itemized_breakdown.map((item) => {
      const clientProfile = allProfiles.find((p) => p.id === item.client_id);
      const clientName = clientProfile ? `${clientProfile.full_name} (${clientProfile.unique_display_id || item.client_id})` : item.client_id;
      
      const agentProfile = item.agent_id ? allProfiles.find((p) => p.id === item.agent_id) : undefined;
      const agentName = agentProfile ? `${agentProfile.full_name} (${agentProfile.unique_display_id || item.agent_id})` : (item.agent_id || "Direct");

      return [
        clientName,
        agentName,
        item.amount,
        item.fee,
        item.date.slice(0, 16).replace("T", " ")
      ];
    });

    const statusText = sub.status === "acknowledged" 
      ? (acknowledger ? `Acknowledged by ${acknowledger} on ${sub.acknowledged_at?.slice(0, 10)}` : "Acknowledged")
      : "Pending Review / Submitted";

    return {
      headerLabel: `Period: ${sub.period_start} to ${sub.period_end}`,
      headerSubLabel: `Submitted by: ${submitterName} on ${sub.submitted_at.slice(0, 10)} | Status: ${statusText} | Total Margin Fee: ${sub.total_margin_fcfa.toLocaleString()} FCFA | ${sub.itemized_breakdown.length} transactions`,
      rows,
    };
  };

  // Export This Branch
  const handleExportBranch = async (branchId: string, branchName: string) => {
    const branchSubs = submissions.filter((s) => s.branch_id === branchId);
    if (branchSubs.length === 0) {
      showBanner(
        language === "fr" 
          ? "Aucune soumission à exporter pour cette succursale." 
          : "No submissions found to export for this branch.", 
        "error"
      );
      return;
    }

    try {
      const sections = branchSubs.map((sub) => getSubmissionSection(sub));
      const sheetName = branchName.slice(0, 30); // Excel limits to 31 chars

      const spec: NestedExcelSheetSpec = {
        sheetName,
        columnHeaders: ["Client", "DC / Collector", "Amount (FCFA)", "Fee Margin (FCFA)", "Transaction Date"],
        columnWidths: [35, 35, 20, 20, 25],
        sections,
      };

      await exportPDF([spec], `${branchName.replace(/\s+/g, "_")}_Margin_Accountability.pdf`);
      showBanner(
        language === "fr" 
          ? "Rapport de succursale exporté avec succès !" 
          : "Branch report exported successfully!", 
        "success"
      );
    } catch (e: any) {
      showBanner(e.message || "Export failed", "error");
    }
  };

  // Export All Branches
  const handleExportAllBranches = async () => {
    const activeBranches = branchGroups.filter((g) => g.submissions.length > 0);
    if (activeBranches.length === 0) {
      showBanner(
        language === "fr" 
          ? "Aucun rapport de rapprochement n'est disponible pour l'exportation." 
          : "No reconciliation reports available to export.", 
        "error"
      );
      return;
    }

    try {
      const sheetsSpec: NestedExcelSheetSpec[] = activeBranches.map((g) => {
        const sections = g.submissions.map((sub) => getSubmissionSection(sub));
        const sheetName = g.branch.name.slice(0, 30);
        return {
          sheetName,
          columnHeaders: ["Client", "DC / Collector", "Amount (FCFA)", "Fee Margin (FCFA)", "Transaction Date"],
          columnWidths: [35, 35, 20, 20, 25],
          sections,
        };
      });

      await exportPDF(sheetsSpec, `Company_All_Branches_Accountability.pdf`);
      showBanner(
        language === "fr" 
          ? "Rapport global multi-succursales exporté avec succès !" 
          : "Global multi-branch accountability report exported successfully!", 
        "success"
      );
    } catch (e: any) {
      showBanner(e.message || "Export failed", "error");
    }
  };

  return (
    <div id="branch-accountability-dashboard" className="space-y-6 animate-fade-in text-xs text-brand-primary dark:text-white">
      {/* Title & Top Action Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#150b24] rounded-3xl border border-brand-secondary/15 p-6 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-xl font-display font-black tracking-tight text-brand-primary dark:text-white uppercase flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-brand-primary dark:text-white" />
            <span>{strings.branch_accountability_title || "Branch Margin Reconciliation"}</span>
          </h2>
          <p className="text-gray-500 dark:text-white/60 max-w-2xl text-[11px] font-medium">
            {user.role === "pdg"
              ? (strings.branch_accountability_subtitle || "Accountability Interface - Monitor and export reported branch margin reconciliation submissions.")
              : (language === "fr"
                  ? "Suivi et export de vos rapports de rapprochement de marge soumis."
                  : language === "ff"
                      ? "Ƴeewugo e nneldu njaɓe jippinaaɗe kuugal njaɓugol ceede."
                      : "Monitor and export your branch's reported margin reconciliation submissions.")}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start md:self-center">
          <button
            id="btn-export-all-branches"
            onClick={handleExportAllBranches}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-primary hover:bg-brand-primary/95 text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-white" />
            <span>{user.role === "pdg" 
              ? (strings.branch_accountability_export_all || "Export All Branches")
              : (strings.branch_accountability_export_branch || "Export This Branch")}</span>
          </button>
          <button
            onClick={loadSubmissions}
            className="p-2.5 text-gray-500 dark:text-white/60 hover:text-brand-primary hover:bg-brand-secondary/5 rounded-xl border border-brand-secondary/15 transition-all bg-white dark:bg-[#150b24] cursor-pointer"
            title="Reload submissions"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Groups list */}
      <div className="space-y-4">
        {branchGroups.every((g) => g.submissions.length === 0) ? (
          <div className="bg-white dark:bg-[#150b24] rounded-3xl border border-brand-secondary/10 p-12 text-center text-gray-400 dark:text-white/40 font-medium space-y-2">
            <AlertCircle className="w-12 h-12 text-gray-300 dark:text-white/30 mx-auto" />
            <p className="text-sm">{strings.branch_accountability_no_submissions || "No margin reports have been submitted yet."}</p>
          </div>
        ) : (
          branchGroups.map((group) => {
            const { branch, submissions: subs, totalMargin } = group;
            if (subs.length === 0) return null; // Only show branches with submissions

            const isBranchExpanded = !!expandedBranches[branch.id];

            return (
              <div 
                key={branch.id} 
                id={`branch-group-${branch.id}`}
                className="bg-white dark:bg-[#150b24] rounded-3xl border border-brand-secondary/15 overflow-hidden shadow-xs transition-all"
              >
                {/* Branch Group Accordion Header */}
                <div 
                  onClick={() => toggleBranch(branch.id)}
                  className="flex items-center justify-between p-5 bg-brand-surface/20 dark:bg-[#1c0f38]/40 hover:bg-brand-surface/40 cursor-pointer select-none transition-colors border-b border-brand-secondary/5"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-brand-primary/10 rounded-2xl">
                      <Building2 className="w-5 h-5 text-brand-primary dark:text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-display font-black text-brand-primary dark:text-white uppercase tracking-wide">
                        {branch.name}
                      </h3>
                      <div className="flex items-center gap-3 text-[10px] text-gray-500 dark:text-white/60 mt-0.5 font-medium">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-gray-400 dark:text-white/40" />
                          <span>{subs.length} {strings.branch_accountability_submissions_count || "Submissions"}</span>
                        </span>
                        <span>•</span>
                        <span>{branch.location}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-[10px] uppercase font-bold text-gray-400 dark:text-white/40 tracking-wider">
                        {strings.branch_accountability_reported_margin || "Reported Margin"}
                      </div>
                      <div className="text-sm font-numeric font-black text-brand-primary dark:text-white">
                        {totalMargin.toLocaleString()} FCFA
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        id={`btn-export-branch-${branch.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExportBranch(branch.id, branch.name);
                        }}
                        className="p-2 text-brand-primary dark:text-white hover:bg-brand-primary hover:text-white rounded-xl border border-brand-primary/20 transition-all cursor-pointer bg-white dark:bg-[#150b24]"
                        title={strings.branch_accountability_export_branch || "Export This Branch"}
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <div className="p-1.5 text-gray-400 hover:text-brand-primary transition-colors">
                        {isBranchExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Submissions List under this branch */}
                {isBranchExpanded && (
                  <div className="p-6 space-y-4 divide-y divide-brand-secondary/10 bg-white dark:bg-[#150b24]">
                    {subs.map((sub, sIdx) => {
                      const isSubExpanded = !!expandedSubmissions[sub.id];
                      const submitter = allProfiles.find((p) => p.id === sub.submitted_by);
                      const submitterName = submitter ? submitter.full_name : sub.submitted_by;
                      const acknowledger = sub.acknowledged_by 
                        ? (allProfiles.find((p) => p.id === sub.acknowledged_by)?.full_name || sub.acknowledged_by)
                        : "";

                      return (
                        <div key={sub.id} className={`pt-4 ${sIdx === 0 ? "pt-0" : ""}`}>
                          {/* Submission row summary */}
                          <div 
                            onClick={() => toggleSubmission(sub.id)}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl hover:bg-brand-secondary/5 cursor-pointer transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <div className="p-1.5 bg-brand-secondary/10 rounded-lg text-brand-secondary mt-1">
                                <Calendar className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="font-bold text-gray-700 dark:text-white text-[12px]">
                                  {sub.period_start} to {sub.period_end}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-500 dark:text-white/60 mt-1">
                                  <span className="flex items-center gap-1">
                                    <User className="w-3 h-3 text-gray-400 dark:text-white/40" />
                                    <span>Submitted by: <strong>{submitterName}</strong></span>
                                  </span>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-gray-400 dark:text-white/40" />
                                    <span>At: {sub.submitted_at.slice(0, 10)} {sub.submitted_at.slice(11, 16)}</span>
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-4">
                              <div className="text-right">
                                <div className="text-[11px] font-black text-gray-800 dark:text-white">
                                  {sub.total_margin_fcfa.toLocaleString()} FCFA
                                </div>
                                <div className="text-[9px] text-gray-400 dark:text-white/40 mt-0.5">
                                  {sub.itemized_breakdown.length} transactions
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                  sub.status === "acknowledged" 
                                    ? "bg-emerald-500/10 text-emerald-600" 
                                    : "bg-amber-500/10 text-amber-600"
                                }`}>
                                  {sub.status === "acknowledged" 
                                    ? (strings.margin_status_acknowledged || "Acknowledged") 
                                    : (strings.margin_status_submitted || "Submitted")}
                                </span>
                                {isSubExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                              </div>
                            </div>
                          </div>

                          {/* Submission itemized details */}
                          {isSubExpanded && (
                            <div className="mt-3 ml-3 sm:ml-9 p-4 bg-brand-surface/10 dark:bg-[#1c0f38]/50 rounded-2xl border border-brand-secondary/10 space-y-4 animate-fade-in">
                              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                <h4 className="text-[11px] uppercase font-black tracking-wider text-brand-secondary dark:text-white/80 flex items-center gap-1.5">
                                  <ClipboardCheck className="w-3.5 h-3.5" />
                                  <span>{strings.branch_accountability_details || "Itemized Breakdown"}</span>
                                </h4>
                                {sub.status === "submitted" && user.role === "pdg" && (
                                  <button
                                    id={`btn-acknowledge-submission-${sub.id}`}
                                    disabled={isProcessing}
                                    onClick={() => handleAcknowledge(sub.id)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-bold text-[10px] transition-all cursor-pointer shadow-xs"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Acknowledge Report</span>
                                  </button>
                                )}
                                {sub.status === "acknowledged" && (
                                  <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span>Acknowledged by {acknowledger} on {sub.acknowledged_at?.slice(0, 10)}</span>
                                  </div>
                                )}
                              </div>

                              <div className="overflow-x-auto rounded-xl border border-brand-secondary/10 bg-white dark:bg-[#150b24]">
                                <table className="w-full text-left border-collapse text-xs">
                                  <thead>
                                    <tr className="bg-brand-surface/30 dark:bg-[#1c0f38]/50 border-b border-brand-secondary/5 text-[9px] uppercase font-bold text-gray-500 dark:text-white/60 tracking-wider">
                                      <th className="p-2.5">Client</th>
                                      <th className="p-2.5">DC</th>
                                      <th className="p-2.5 text-right">Amount (FCFA)</th>
                                      <th className="p-2.5 text-right">Fee Margin (FCFA)</th>
                                      <th className="p-2.5">Date</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-brand-secondary/5 font-medium text-[10px] text-gray-600 dark:text-white/80">
                                    {sub.itemized_breakdown.map((item) => {
                                      const clientProfile = allProfiles.find((p) => p.id === item.client_id);
                                      const clientLabel = clientProfile 
                                        ? `${clientProfile.full_name} (${clientProfile.unique_display_id || item.client_id})` 
                                        : item.client_id;
                                      
                                      const agentProfile = item.agent_id ? allProfiles.find((p) => p.id === item.agent_id) : undefined;
                                      const agentLabel = agentProfile 
                                        ? `${agentProfile.full_name} (${agentProfile.unique_display_id || item.agent_id})` 
                                        : (item.agent_id || "Direct");

                                      return (
                                        <tr key={item.transaction_id} className="hover:bg-brand-secondary/5 transition-colors">
                                          <td className="p-2.5 font-bold text-brand-primary dark:text-white">{clientLabel}</td>
                                          <td className="p-2.5">{agentLabel}</td>
                                          <td className="p-2.5 text-right font-numeric font-bold text-gray-700 dark:text-white">
                                            {item.amount.toLocaleString()} FCFA
                                          </td>
                                          <td className="p-2.5 text-right font-numeric font-black text-brand-secondary dark:text-brand-accent/90">
                                            {item.fee.toLocaleString()} FCFA
                                          </td>
                                          <td className="p-2.5 text-gray-400 dark:text-white/40">
                                            {item.date.slice(0, 10)} {item.date.slice(11, 16)}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
