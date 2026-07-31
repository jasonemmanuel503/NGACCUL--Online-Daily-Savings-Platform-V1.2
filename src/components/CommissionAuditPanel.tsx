import React from "react";
import { Profile } from "../types";
import { dbService, STATIC_BRANCHES } from "../services/db";
import { ShieldAlert, Users, CheckCircle2, AlertTriangle, Building2 } from "lucide-react";

interface CommissionAuditPanelProps {
  user: any;
  allProfiles: Profile[];
  strings: any;
  showBanner: (msg: string, type: "success" | "error") => void;
}

export const CommissionAuditPanel: React.FC<CommissionAuditPanelProps> = ({
  user,
  allProfiles,
  strings,
  showBanner
}) => {
  const agents = allProfiles.filter(p => p.role === "agent");

  const auditRows = agents.map(agent => {
    const agentLedger = dbService.getCommissionLedger(agent);
    const correctedEarned = agentLedger.reduce((sum, entry) => sum + entry.amount_fcfa, 0);
    const agentPayouts = dbService.getCommissionPayouts(user).filter(p => p.agent_id === agent.id);
    const totalPaid = agentPayouts.reduce((sum, payout) => sum + payout.amount_fcfa, 0);
    const overpaidAmount = totalPaid - correctedEarned;

    const branchName = STATIC_BRANCHES.find(b => b.id === agent.branch_id)?.name || agent.branch_id?.toUpperCase() || "N/A";

    return {
      agent,
      correctedEarned,
      totalPaid,
      branchName,
      overpaidAmount: overpaidAmount > 0 ? overpaidAmount : 0
    };
  })
  .filter(row => row.overpaidAmount > 0)
  .sort((a, b) => b.overpaidAmount - a.overpaidAmount);

  return (
    <div id="commission-audit-panel" className="bg-white dark:bg-[#150b24] rounded-3xl border border-brand-secondary/15 p-6 shadow-sm space-y-6 animate-fade-in text-xs font-sans text-brand-primary dark:text-white">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-brand-secondary/10">
        <div className="p-2 bg-brand-primary/10 text-brand-primary dark:text-white rounded-xl">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-display font-black uppercase tracking-wide">
            Agent Commission Payout Audit
          </h2>
          <p className="text-gray-500 dark:text-white/60 max-w-2xl text-[11px]">
            PDG diagnostic view comparing actual, deduplicated commission earnings against historic paid-out logs.
          </p>
        </div>
      </div>

      {/* Info card */}
      <div className="bg-amber-500/5 border border-amber-500/10 p-4 rounded-2xl flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="font-bold text-amber-800 dark:text-amber-400">Financial Reconciliation Guard</h4>
          <p className="text-gray-600 dark:text-white/70 leading-relaxed text-[11px]">
            This report lists agents whose total payouts exceed their true, corrected earnings due to the previously resolved double-counting bug. 
            <strong> This audit is strictly read-only.</strong> Do not automatically adjust any balances. Any offsets should be handled manually by the PDG.
          </p>
        </div>
      </div>

      {/* Result list */}
      <div className="border border-brand-secondary/15 rounded-2xl overflow-hidden shadow-xs bg-white dark:bg-[#150b24]">
        {auditRows.length === 0 ? (
          <div className="p-12 text-center space-y-3 flex flex-col items-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            <h3 className="text-sm font-bold text-gray-700 dark:text-white">All Clear — No Discrepancies Found</h3>
            <p className="text-gray-500 dark:text-white/60 max-w-md text-[11px]">
              No agents have been overpaid! The double-counted on-screen totals never translated to actual overpayments in practice. No reconciliation is needed.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-brand-primary text-white text-[10px] uppercase font-bold tracking-wider">
                  <th className="p-3">Agent Name</th>
                  <th className="p-3">Branch</th>
                  <th className="p-3 text-right">Corrected True Earned</th>
                  <th className="p-3 text-right">Total Payouts Logged</th>
                  <th className="p-3 text-right text-amber-400">Overpaid Difference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-secondary/10">
                {auditRows.map((row) => (
                  <tr key={row.agent.id} className="hover:bg-brand-secondary/5 transition-all font-medium">
                    <td className="p-3 font-bold text-brand-primary dark:text-white">
                      <div>{row.agent.full_name}</div>
                      <div className="text-[10px] text-gray-400 dark:text-white/40 font-mono">ID: {row.agent.id}</div>
                    </td>
                    <td className="p-3 text-gray-500 dark:text-white/60">
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-brand-secondary" />
                        <span>{row.branchName}</span>
                      </span>
                    </td>
                    <td className="p-3 text-right font-numeric font-bold text-gray-700 dark:text-white">
                      {row.correctedEarned.toLocaleString()} FCFA
                    </td>
                    <td className="p-3 text-right font-numeric font-bold text-gray-700 dark:text-white">
                      {row.totalPaid.toLocaleString()} FCFA
                    </td>
                    <td className="p-3 text-right font-numeric font-bold text-amber-600 bg-amber-500/5 dark:text-amber-400 dark:bg-amber-500/10">
                      +{row.overpaidAmount.toLocaleString()} FCFA
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
