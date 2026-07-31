import React, { useState } from "react";
import { Profile, ClientBalance, Transaction, BranchID } from "../types";
import { exportPDF, NestedPdfSheetSpec as NestedExcelSheetSpec, NestedPdfSection as NestedExcelSection } from "../utils/pdfExport";
import { 
  ChevronRight, 
  ChevronDown, 
  User, 
  Briefcase, 
  Download, 
  Search, 
  CheckSquare, 
  Square,
  Building2
} from "lucide-react";

interface AgentPortfoliosPanelProps {
  user: any;
  allProfiles: Profile[];
  allBalances: ClientBalance[];
  allTxns: Transaction[];
  selectedBranches: BranchID[];
  strings: any;
  onSelectMember: (m: Profile) => void;
  showBanner: (msg: string, type: "success" | "error") => void;
}

export const AgentPortfoliosPanel: React.FC<AgentPortfoliosPanelProps> = ({
  user,
  allProfiles,
  allBalances,
  allTxns,
  selectedBranches,
  strings,
  onSelectMember,
  showBanner,
}) => {
  const isPdg = user.role === "pdg";
  const userBranch = user.branch_id as BranchID;

  // Search and view state
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"browse" | "all_branches">(isPdg ? "browse" : "browse");
  
  // Track selected branch for browse mode (PDG only)
  const activePdgBranches = selectedBranches.length > 0 ? selectedBranches : [userBranch];
  const [selectedBranchPdg, setSelectedBranchPdg] = useState<BranchID>(activePdgBranches[0]);

  // Track expanded groups (agents or branches)
  const [expandedAgents, setExpandedAgents] = useState<Record<string, boolean>>({});
  const [expandedBranches, setExpandedBranches] = useState<Record<string, boolean>>({});

  // Track selected agents for PDF export
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set());

  // Date formatting helper (dd/mm/yy)
  const formatDateDDMMYY = (isoString: string): string => {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "—";
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yy = String(date.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
  };

  // Branch Name Mapper (mimics layout elsewhere)
  const getBranchName = (branchId: string): string => {
    const names: Record<string, string> = {
      ngde: "Ngaoundéré",
      ngdl: "Ngaoundal",
      meig: "Meiganga",
      tiba: "Tibati",
      tign: "Tignère",
    };
    return names[branchId] || branchId.toUpperCase();
  };

  // Filter clients and agents
  const getBranchData = (branchId: BranchID) => {
    const branchClients = allProfiles.filter(
      (p) => p.role === "client" && p.branch_id === branchId
    );
    const branchAgents = allProfiles.filter(
      (p) => p.role === "agent" && p.branch_id === branchId
    );

    // Group clients by agent (recruited_by)
    const grouped: Record<string, Profile[]> = {};
    branchAgents.forEach((a) => {
      grouped[a.id] = [];
    });
    // Fallback or unassigned group (if recruited_by is not matching, but for these agents)
    branchClients.forEach((c) => {
      const recruitedBy = c.recruited_by || "";
      if (grouped[recruitedBy]) {
        grouped[recruitedBy].push(c);
      }
    });

    return {
      agents: branchAgents,
      groupedClients: grouped,
    };
  };

  // Fetch metrics for on-screen summary
  const getAgentMetrics = (agentId: string, clients: Profile[]) => {
    let totalBalance = 0;
    clients.forEach((c) => {
      const cb = allBalances.find((b) => b.client_id === c.id);
      if (cb) totalBalance += cb.balance;
    });

    return {
      clientCount: clients.length,
      totalBalance,
    };
  };

  const getClientWithdrawalsSummary = (clientId: string) => {
    const withdrawals = allTxns
      .filter((t) => t.client_id === clientId && t.type === "withdrawal" && t.status === "confirmed")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); // sort desc to find last

    if (withdrawals.length === 0) {
      return strings.portfolio_no_withdrawals || "No withdrawals recorded";
    }

    const lastDate = formatDateDDMMYY(withdrawals[0].created_at);
    return (strings.portfolio_last_withdrawal || "Last on {date}")
      .replace("{count}", withdrawals.length.toString())
      .replace("{date}", lastDate) + ` (${withdrawals.length})`;
  };

  // List of branches to render based on user role and selection
  const branchesToRender: BranchID[] = isPdg
    ? (viewMode === "browse" ? [selectedBranchPdg] : activePdgBranches)
    : [userBranch];

  // Helper to toggle selection for single agent
  const handleToggleAgent = (agentId: string) => {
    const next = new Set(selectedAgentIds);
    if (next.has(agentId)) {
      next.delete(agentId);
    } else {
      next.add(agentId);
    }
    setSelectedAgentIds(next);
  };

  // Toggle selection for all displayed agents
  const handleToggleAllAgents = (allDisplayedAgentIds: string[]) => {
    const allSelected = allDisplayedAgentIds.every((id) => selectedAgentIds.has(id));
    const next = new Set(selectedAgentIds);
    if (allSelected) {
      allDisplayedAgentIds.forEach((id) => next.delete(id));
    } else {
      allDisplayedAgentIds.forEach((id) => next.add(id));
    }
    setSelectedAgentIds(next);
  };

  // Generate PDF report
  const handleAgentPortfoliosExport = async () => {
    if (selectedAgentIds.size === 0) {
      showBanner("Please select at least one agent to export.", "error");
      return;
    }

    try {
      // Build sheets. We want option (b): one sheet per branch
      const sheets: NestedExcelSheetSpec[] = [];

      // Determine which branches are involved in the selection
      const activeBranchesForExport = isPdg ? activePdgBranches : [userBranch];

      activeBranchesForExport.forEach((branchId) => {
        const { agents, groupedClients } = getBranchData(branchId);
        
        // Filter agents that are selected
        const selectedAgentsInBranch = agents.filter((a) => selectedAgentIds.has(a.id));
        
        if (selectedAgentsInBranch.length === 0) return;

        const sections: NestedExcelSection[] = [];

        selectedAgentsInBranch.forEach((agent) => {
          const clients = groupedClients[agent.id] || [];
          // Sort clients alphabetically by full_name
          const sortedClients = [...clients].sort((a, b) => a.full_name.localeCompare(b.full_name));
          
          const { clientCount, totalBalance } = getAgentMetrics(agent.id, clients);

          const rows: (string | number)[][] = [];

          sortedClients.forEach((client) => {
            const balance = allBalances.find((b) => b.client_id === client.id)?.balance || 0;
            const clientWithdrawals = allTxns
              .filter((t) => t.client_id === client.id && t.type === "withdrawal" && t.status === "confirmed")
              .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); // asc per spec

            if (clientWithdrawals.length === 0) {
              rows.push([
                client.full_name,
                client.is_active ? (strings.portfolio_active || "Active") : (strings.portfolio_inactive || "Inactive"),
                balance,
                "—",
                "—"
              ]);
            } else {
              clientWithdrawals.forEach((tx, idx) => {
                rows.push([
                  client.full_name,
                  client.is_active ? (strings.portfolio_active || "Active") : (strings.portfolio_inactive || "Inactive"),
                  balance,
                  formatDateDDMMYY(tx.created_at),
                  tx.amount
                ]);
              });
            }
          });

          sections.push({
            headerLabel: agent.full_name,
            headerSubLabel: `${clientCount} clients — ${totalBalance.toLocaleString()} FCFA total balance`,
            rows,
          });
        });

        sheets.push({
          sheetName: getBranchName(branchId),
          columnHeaders: [
            strings.portfolio_client_name || "Client Name",
            strings.portfolio_client_status || "Status",
            `${strings.portfolio_client_balance || "Current Balance"} (FCFA)`,
            "Withdrawal Date",
            "Withdrawal Amount (FCFA)"
          ],
          sections,
        });
      });

      if (sheets.length === 0) {
        showBanner("No data to export for selected agents.", "error");
        return;
      }

      const dateStr = new Date().toISOString().split("T")[0];
      await exportPDF(sheets, `Agent_Portfolios_${dateStr}.pdf`);
      showBanner("DC portfolios exported as PDF successfully!", "success");
    } catch (err: any) {
      showBanner(err.message || "Failed to export portfolio report.", "error");
    }
  };

  // Collect all agents that are currently displayed to manage check all
  const displayedAgents: Profile[] = [];
  branchesToRender.forEach((bId) => {
    const { agents } = getBranchData(bId);
    agents.forEach((a) => {
      // filter with search term
      if (!searchTerm || a.full_name.toLowerCase().includes(searchTerm.toLowerCase())) {
        displayedAgents.push(a);
      }
    });
  });

  const allDisplayedAgentIds = displayedAgents.map((a) => a.id);
  const isAllChecked = allDisplayedAgentIds.length > 0 && allDisplayedAgentIds.every((id) => selectedAgentIds.has(id));

  return (
    <div className="space-y-6">
      {/* HEADER BREADCRUMB / HERO */}
      <div className="bg-white dark:bg-[#150b24] rounded-3xl p-6 shadow-sm border border-brand-secondary/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-black text-xl text-brand-primary dark:text-white">
            {strings.portfolio_title || "DC Portfolios Dashboard"}
          </h2>
          <p className="text-xs text-brand-primary/65 dark:text-white/65 mt-1 leading-relaxed max-w-2xl">
            {strings.portfolio_desc || "Monitor agent-recruited client portfolios, view balances and withdrawal statistics, and perform bulk PDF exports."}
          </p>
        </div>

        {/* BULK EXPORT ACTION */}
        <button
          onClick={handleAgentPortfoliosExport}
          disabled={selectedAgentIds.size === 0}
          className="flex items-center justify-center gap-2 px-5 py-3 bg-[#1A7A4A] hover:bg-[#145d38] text-white font-bold rounded-2xl text-xs shadow-sm transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap self-start md:self-auto"
        >
          <Download size={14} />
          {strings.portfolio_export_selected || "Export Selected to PDF"}
          {selectedAgentIds.size > 0 && ` (${selectedAgentIds.size})`}
        </button>
      </div>

      {/* CONTROLS BAR: SEARCH & PDG BRANCH TOGGLES */}
      <div className="bg-white dark:bg-[#150b24] rounded-3xl p-4 shadow-sm border border-brand-secondary/10 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-brand-primary/45 dark:text-white/45">
            <Search size={15} />
          </span>
          <input
            type="text"
            placeholder={strings.portfolio_search_agent || "Search agents..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#F8F5FB] dark:bg-[#1c0f38] dark:text-white dark:placeholder:text-white/40 border border-brand-secondary/20 rounded-2xl pl-10 pr-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-accent/50"
          />
        </div>

        {isPdg && (
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* View Mode Toggle */}
            <div className="bg-[#F8F5FB] dark:bg-[#1c0f38] p-1 rounded-2xl border border-brand-secondary/20 flex gap-1">
              <button
                onClick={() => setViewMode("browse")}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                  viewMode === "browse" 
                    ? "bg-white dark:bg-[#150b24] text-brand-primary dark:text-white shadow-sm" 
                    : "text-brand-primary/60 dark:text-white/60 hover:text-brand-primary dark:hover:text-white"
                }`}
              >
                {strings.portfolio_browse_by_branch || "Browse by branch"}
              </button>
              <button
                onClick={() => setViewMode("all_branches")}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                  viewMode === "all_branches" 
                    ? "bg-white dark:bg-[#150b24] text-brand-primary dark:text-white shadow-sm" 
                    : "text-brand-primary/60 dark:text-white/60 hover:text-brand-primary dark:hover:text-white"
                }`}
              >
                {strings.portfolio_all_branches || "All Branches"}
              </button>
            </div>

            {/* Branch selector for Browse mode */}
            {viewMode === "browse" && (
              <select
                value={selectedBranchPdg}
                onChange={(e) => setSelectedBranchPdg(e.target.value as BranchID)}
                className="bg-white dark:bg-[#150b24] dark:text-white border border-brand-secondary/20 rounded-2xl px-3 py-2 text-xs font-bold text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-accent/50 cursor-pointer"
              >
                {activePdgBranches.map((bId) => (
                  <option key={bId} value={bId}>
                    {getBranchName(bId)}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* MASTER LIST SECTION */}
      <div className="space-y-4">
        {/* Bulk Select Checkbox at table top */}
        {displayedAgents.length > 0 && (
          <div className="flex items-center gap-2 px-6">
            <button
              onClick={() => handleToggleAllAgents(allDisplayedAgentIds)}
              className="text-brand-primary/60 dark:text-white/60 hover:text-brand-primary dark:hover:text-white transition-all flex items-center gap-2 text-xs font-bold cursor-pointer"
            >
              {isAllChecked ? (
                <CheckSquare size={16} className="text-brand-accent" />
              ) : (
                <Square size={16} />
              )}
              {strings.portfolio_select_all || "Select All"} ({displayedAgents.length} {strings.agents || "agents"})
            </button>
          </div>
        )}

        {/* COLLAPSIBLE TREE BRANCHES & AGENTS */}
        <div className="space-y-4">
          {branchesToRender.map((branchId) => {
            const { agents, groupedClients } = getBranchData(branchId);
            
            // Filter agents by search term
            const filteredAgents = agents.filter((a) =>
              !searchTerm || a.full_name.toLowerCase().includes(searchTerm.toLowerCase())
            );

            if (isPdg && viewMode === "all_branches") {
              // In "All Branches" mode, wrap in a collapsible branch container
              const isBranchExpanded = expandedBranches[branchId] !== false; // expanded by default
              const toggleBranch = () => {
                setExpandedBranches({
                  ...expandedBranches,
                  [branchId]: !isBranchExpanded,
                });
              };

              // Compute aggregate stats for branch
              let branchClientCount = 0;
              let branchTotalBalance = 0;
              agents.forEach((a) => {
                const clients = groupedClients[a.id] || [];
                branchClientCount += clients.length;
                clients.forEach((c) => {
                  const cb = allBalances.find((b) => b.client_id === c.id);
                  if (cb) branchTotalBalance += cb.balance;
                });
              });

              return (
                <div key={branchId} className="bg-white dark:bg-[#150b24] rounded-3xl shadow-sm border border-brand-secondary/10 overflow-hidden">
                  {/* Branch Banner Header */}
                  <div 
                    onClick={toggleBranch}
                    className="bg-[#F8F5FB] dark:bg-[#1c0f38] px-6 py-4 border-b border-brand-secondary/10 flex items-center justify-between cursor-pointer hover:bg-brand-secondary/5 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isBranchExpanded ? <ChevronDown size={18} className="text-brand-primary dark:text-white" /> : <ChevronRight size={18} className="text-brand-primary dark:text-white" />}
                      <Building2 size={16} className="text-brand-accent" />
                      <span className="font-display font-black text-xs uppercase tracking-wider text-brand-primary dark:text-white">
                        {getBranchName(branchId)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] font-mono font-bold text-brand-primary/60 dark:text-white/60">
                      <span>{branchClientCount} clients</span>
                      <span className="text-[#1A7A4A]">{branchTotalBalance.toLocaleString()} FCFA</span>
                    </div>
                  </div>

                  {isBranchExpanded && (
                    <div className="p-4 space-y-4 bg-brand-surface/5">
                      {filteredAgents.length === 0 ? (
                        <p className="text-xs text-brand-primary/50 dark:text-white/50 text-center py-4">
                          {strings.portfolio_no_agents || "No agents found."}
                        </p>
                      ) : (
                        filteredAgents.map((agent) => (
                          <AgentAccordionItem
                            key={agent.id}
                            agent={agent}
                            clients={groupedClients[agent.id] || []}
                            isExpanded={!!expandedAgents[agent.id]}
                            onToggleExpand={() => setExpandedAgents({
                              ...expandedAgents,
                              [agent.id]: !expandedAgents[agent.id]
                            })}
                            isSelected={selectedAgentIds.has(agent.id)}
                            onToggleSelect={() => handleToggleAgent(agent.id)}
                            getAgentMetrics={getAgentMetrics}
                            getClientWithdrawalsSummary={getClientWithdrawalsSummary}
                            onSelectMember={onSelectMember}
                            strings={strings}
                            allBalances={allBalances}
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            }

            // In single branch / browse mode, render accordion items directly
            return (
              <div key={branchId} className="space-y-3">
                {isPdg && (
                  <div className="px-6 py-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary/40 dark:text-white/40 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-accent" />
                      {getBranchName(branchId)} {strings.branch || "Branch"}
                    </span>
                  </div>
                )}
                
                {filteredAgents.length === 0 ? (
                  <div className="bg-white dark:bg-[#150b24] rounded-3xl p-8 text-center border border-brand-secondary/10">
                    <p className="text-xs text-brand-primary/50 dark:text-white/50">
                      {strings.portfolio_no_agents || "No agents found for this branch."}
                    </p>
                  </div>
                ) : (
                  filteredAgents.map((agent) => (
                    <AgentAccordionItem
                      key={agent.id}
                      agent={agent}
                      clients={groupedClients[agent.id] || []}
                      isExpanded={!!expandedAgents[agent.id]}
                      onToggleExpand={() => setExpandedAgents({
                        ...expandedAgents,
                        [agent.id]: !expandedAgents[agent.id]
                      })}
                      isSelected={selectedAgentIds.has(agent.id)}
                      onToggleSelect={() => handleToggleAgent(agent.id)}
                      getAgentMetrics={getAgentMetrics}
                      getClientWithdrawalsSummary={getClientWithdrawalsSummary}
                      onSelectMember={onSelectMember}
                      strings={strings}
                      allBalances={allBalances}
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Extracted Agent accordion block to keep parent render ultra clean
interface AgentAccordionItemProps {
  agent: Profile;
  clients: Profile[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  isSelected: boolean;
  onToggleSelect: () => void;
  getAgentMetrics: (agentId: string, clients: Profile[]) => { clientCount: number; totalBalance: number };
  getClientWithdrawalsSummary: (clientId: string) => string;
  onSelectMember: (m: Profile) => void;
  strings: any;
  allBalances: ClientBalance[];
}

const AgentAccordionItem: React.FC<AgentAccordionItemProps> = ({
  agent,
  clients,
  isExpanded,
  onToggleExpand,
  isSelected,
  onToggleSelect,
  getAgentMetrics,
  getClientWithdrawalsSummary,
  onSelectMember,
  strings,
  allBalances,
}) => {
  const { clientCount, totalBalance } = getAgentMetrics(agent.id, clients);

  return (
    <div className="bg-white dark:bg-[#150b24] rounded-3xl border border-brand-secondary/10 shadow-sm overflow-hidden transition-all">
      {/* Agent Section Header */}
      <div className="flex items-center justify-between p-4 hover:bg-brand-secondary/5 transition-colors select-none">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Checkbox to select for PDF export */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
            className="text-brand-primary/50 dark:text-white/50 hover:text-brand-accent transition-colors cursor-pointer"
          >
            {isSelected ? (
              <CheckSquare size={18} className="text-brand-accent" />
            ) : (
              <Square size={18} />
            )}
          </button>

          {/* Label click expands/collapses */}
          <div 
            onClick={onToggleExpand}
            className="flex items-center gap-2 flex-1 cursor-pointer min-w-0"
          >
            {isExpanded ? <ChevronDown size={16} className="text-brand-primary/50 dark:text-white/50" /> : <ChevronRight size={16} className="text-brand-primary/50 dark:text-white/50" />}
            <div className="min-w-0">
              <span className="font-display font-extrabold text-xs text-brand-primary dark:text-white line-clamp-1">
                {agent.full_name}
              </span>
              <span className="text-[9px] font-mono text-brand-primary/45 dark:text-white/45">
                ID: {agent.id}
              </span>
            </div>
          </div>
        </div>

        {/* Summary Metrics */}
        <div 
          onClick={onToggleExpand}
          className="flex items-center gap-4 text-right cursor-pointer"
        >
          <div className="hidden sm:block">
            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-[#F8F5FB] dark:bg-[#1c0f38] text-brand-primary dark:text-white border border-brand-secondary/15">
              {(strings.portfolio_total_clients || "{count} clients").replace("{count}", clientCount.toString())}
            </span>
          </div>
          <div className="text-xs font-black text-brand-accent font-numeric">
            {totalBalance.toLocaleString()} FCFA
          </div>
        </div>
      </div>

      {/* Expanded Client List Table */}
      {isExpanded && (
        <div className="border-t border-brand-secondary/10 p-4 bg-[#FDFCFF] dark:bg-[#150b24] overflow-x-auto custom-scrollbar">
          {clients.length === 0 ? (
            <p className="text-[11px] text-brand-primary/45 dark:text-white/45 py-2 text-center">
              {strings.portfolio_agent_no_clients || "No clients assigned to this agent."}
            </p>
          ) : (
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="border-b border-brand-secondary/10 text-[10px] font-bold uppercase tracking-wider text-brand-primary/50 dark:text-white/50">
                  <th className="pb-2">{strings.portfolio_client_name || "Client Name"}</th>
                  <th className="pb-2">{strings.portfolio_client_status || "Status"}</th>
                  <th className="pb-2">{strings.portfolio_client_balance || "Current Balance"}</th>
                  <th className="pb-2">{strings.portfolio_client_withdrawals || "Withdrawals Summary"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-secondary/10 text-xs">
                {clients.map((client) => {
                  return (
                    <tr 
                      key={client.id}
                      onClick={() => onSelectMember(client)}
                      className="hover:bg-brand-secondary/5 cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 font-bold text-brand-primary dark:text-white flex items-center gap-1.5">
                        <User size={12} className="text-brand-primary/40 dark:text-white/40" />
                        <span>{client.full_name}</span>
                        <span className="text-[9px] font-mono text-brand-primary/40 dark:text-white/40 font-normal">({client.id})</span>
                      </td>
                      <td className="py-2.5">
                        {client.is_active ? (
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-100 text-emerald-800">
                            {strings.portfolio_active || "Active"}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-red-100 text-red-800">
                            {strings.portfolio_inactive || "Inactive"}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 font-black text-[#1A7A4A] font-numeric">
                        {(() => {
                          const clientBalance = allBalances.find((b) => b.client_id === client.id)?.balance;
                          return clientBalance !== undefined ? clientBalance.toLocaleString() : "—";
                        })()} FCFA
                      </td>
                      <td className="py-2.5 text-brand-primary/60 dark:text-white/60 font-mono text-[10px]">
                        {getClientWithdrawalsSummary(client.id)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};
