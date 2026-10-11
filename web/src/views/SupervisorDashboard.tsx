import React, { useState } from "react";
import type { Case, Policy, User } from "../api";
import { date, human } from "../api";
import { StatusBadge } from "../ui";

export function SupervisorDashboard({
  cases,
  policy,
  user,
  onOpenCase,
  onRefresh,
  busy,
}: {
  cases: Case[];
  policy: Policy | null;
  user: User;
  onOpenCase: (item: Case) => void;
  onRefresh: () => void;
  busy: boolean;
}) {
  const disputes = cases.filter(
    (c) =>
      c.workflow_state === "SUPERVISOR_REVIEW" ||
      c.workflow_state === "CITIZEN_VERIFICATION" ||
      c.sla_status === "OVERDUE",
  );

  const [activeTab, setActiveTab] = useState<"DISPUTES" | "ALL">("DISPUTES");
  const displayedCases = activeTab === "DISPUTES" ? disputes : cases;

  return (
    <div className="flex flex-col w-full gap-6">
      {/* Operational Context Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-1 border-b border-[#d9cdba]/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#dce9ff] text-[#0b1c30] text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-[#f77f00] animate-pulse"></span>
            <span className="tracking-wide">SUPERVISOR CONTROL CONSOLE</span>
          </div>
          <span className="text-[#c4c5d7]">•</span>
          <div className="flex items-center gap-1.5 text-xs text-[#434655] font-mono">
            <span className="material-symbols-outlined text-[16px] text-[#f77f00]">
              badge
            </span>
            <span>ID: SUPV-OPS-01</span>
            <span className="text-[#0b1c30] font-semibold">
              ({user.display_name})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-[#e5eeff] text-[#374559] font-mono text-xs">
            <span className="material-symbols-outlined text-[15px]">
              schedule
            </span>
            <span>WARD CLOCK: IST (Asia/Kolkata)</span>
          </div>
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-[#dce9ff] hover:bg-[#d3e4fe] text-[#0037b0] font-semibold text-xs transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[16px]">
              refresh
            </span>
            <span>Sync Queue</span>
          </button>
        </div>
      </div>

      {/* Header Banner & Macro SLA Dashboard */}
      <div className="relative overflow-hidden rounded-xl bg-white p-6 border border-[#d9cdba] shadow-sm">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 relative z-10">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded bg-[#eff4ff] text-[#565e74] text-[10px] font-bold uppercase tracking-wider">
                Sector 01-A & B
              </span>
              <span className="text-[#c4c5d7]">/</span>
              <span className="text-[#565e74] text-xs">
                Municipal Public SLAs
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-[#0b1c30] tracking-tight mb-1">
              Ward Operations & Supervisor Oversight
            </h1>
            <p className="text-xs text-[#434655] leading-relaxed">
              Real-time statutory queue arbitration, civic dispute mitigation,
              and SLA variance oversight under Municipal Citizen Charter 2024.
            </p>
          </div>

          {/* Quick Alert Diagnostic */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-[#ffdad6]/40 border border-[#ba1a1a]/20">
              <div className="w-10 h-10 rounded-lg bg-[#ba1a1a]/10 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[#ba1a1a] text-[22px]">
                  gavel
                </span>
              </div>
              <div>
                <div className="text-xs font-bold text-[#ba1a1a] flex items-center gap-1">
                  <span>Active Dispute Review Rail</span>
                  <span className="w-2 h-2 rounded-full bg-[#ba1a1a] animate-ping"></span>
                </div>
                <div className="text-[11px] text-[#434655]">
                  {disputes.length} case(s) requiring supervisor arbitration
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-4 border-t border-[#eff4ff]">
          <div className="p-3 bg-[#eff4ff] rounded-lg">
            <span className="text-[10px] text-[#434655] uppercase font-bold block">
              Supervisor Scope
            </span>
            <span className="text-2xl font-bold text-[#0b1c30] mt-0.5 block">
              {cases.length}
            </span>
            <span className="text-[10px] text-[#0037b0]">Ward A & B Total</span>
          </div>
          <div className="p-3 bg-[#ffdad6]/40 rounded-lg">
            <span className="text-[10px] text-[#ba1a1a] uppercase font-bold block">
              Disputes / Reviews
            </span>
            <span className="text-2xl font-bold text-[#ba1a1a] mt-0.5 block">
              {disputes.length}
            </span>
            <span className="text-[10px] text-[#ba1a1a]">
              Immediate Arbitration
            </span>
          </div>
          <div className="p-3 bg-[#eff4ff] rounded-lg">
            <span className="text-[10px] text-[#434655] uppercase font-bold block">
              Verification Waits
            </span>
            <span className="text-2xl font-bold text-[#f77f00] mt-0.5 block">
              {
                cases.filter((c) => c.workflow_state === "CITIZEN_VERIFICATION")
                  .length
              }
            </span>
            <span className="text-[10px] text-[#f77f00]">
              Awaiting citizen sign-off
            </span>
          </div>
          <div className="p-3 bg-emerald-50 rounded-lg">
            <span className="text-[10px] text-emerald-800 uppercase font-bold block">
              Resolved & Closed
            </span>
            <span className="text-2xl font-bold text-emerald-800 mt-0.5 block">
              {cases.filter((c) => c.workflow_state === "CLOSED").length}
            </span>
            <span className="text-[10px] text-emerald-700">100% Certified</span>
          </div>
        </div>
      </div>

      {/* Disputes & Overdue Cases Queue */}
      <section className="bg-white rounded-xl border border-[#d9cdba] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[#eff4ff] flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-[#0b1c30]">
              Supervisor Escalation & Dispute Queue
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-[#eff4ff] text-[#434655] font-mono text-xs font-semibold">
              {disputes.length} Priority
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("DISPUTES")}
              className={`px-3 py-1 rounded text-xs font-semibold ${
                activeTab === "DISPUTES"
                  ? "bg-[#f77f00] text-white"
                  : "bg-[#eff4ff] text-[#434655]"
              }`}
            >
              Disputes & Waits ({disputes.length})
            </button>
            <button
              onClick={() => setActiveTab("ALL")}
              className={`px-3 py-1 rounded text-xs font-semibold ${
                activeTab === "ALL"
                  ? "bg-[#f77f00] text-white"
                  : "bg-[#eff4ff] text-[#434655]"
              }`}
            >
              All Ward Cases ({cases.length})
            </button>
          </div>
        </div>

        {displayedCases.length === 0 ? (
          <div className="p-12 text-center">
            <span className="material-symbols-outlined text-4xl text-emerald-600 mb-2">
              verified
            </span>
            <p className="text-sm font-semibold text-[#0b1c30]">
              No active disputes in queue
            </p>
            <p className="text-xs text-[#434655] mt-1">
              All grievances are running on schedule with zero unhandled citizen
              disputes.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#eff4ff]">
            {displayedCases.map((item) => (
              <div
                key={item.id}
                className="p-5 hover:bg-[#f8f9ff] transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3 flex-1">
                  <div className="w-10 h-10 rounded-lg bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center shrink-0 mt-0.5">
                    <span className="material-symbols-outlined text-[20px]">
                      {item.workflow_state === "SUPERVISOR_REVIEW"
                        ? "rebase_edit"
                        : item.workflow_state === "CITIZEN_VERIFICATION"
                          ? "schedule"
                          : "error"}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-xs font-bold text-[#0037b0] bg-[#e5eeff] px-2 py-0.5 rounded">
                        {item.id.slice(0, 8)}…
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[#eff4ff] text-[10px] font-semibold text-[#0b1c30]">
                        Ward {item.ward}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[#dce9ff] text-[10px] font-semibold text-[#0037b0]">
                        {human(item.department)}
                      </span>
                      <StatusBadge state={item.workflow_state} />
                    </div>
                    <h3 className="text-sm font-semibold text-[#0b1c30]">
                      {item.description}
                    </h3>
                    <p className="text-xs text-[#434655] mt-0.5">
                      Ground Site: {item.location} • Owner:{" "}
                      {item.owner_id
                        ? `Officer ${item.owner_id.slice(0, 8)}`
                        : "Unassigned"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="text-[10px] text-[#434655] uppercase font-bold">
                      SLA Status
                    </div>
                    <div
                      className={`font-mono text-xs font-semibold ${
                        item.sla_status === "OVERDUE"
                          ? "text-[#ba1a1a]"
                          : "text-[#0037b0]"
                      }`}
                    >
                      {item.sla_status} • Due{" "}
                      {date(item.current_deadline, item.timezone)}
                    </div>
                  </div>
                  <button
                    aria-label={`View case ${item.description}`}
                    onClick={() => onOpenCase(item)}
                    className="px-4 py-2 bg-[#f77f00] hover:bg-[#d96e00] text-white text-xs font-semibold rounded shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      gavel
                    </span>
                    <span>Arbitrate / Rework</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
