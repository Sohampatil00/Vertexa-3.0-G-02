import React, { useState } from "react";
import type { Case, Policy, User } from "../api";
import { date, human } from "../api";
import { StatusBadge } from "../ui";

export function FieldOfficerDashboard({
  cases,
  policy,
  user,
  onOpenCase,
  onAcceptAssignment,
  onRefresh,
  busy,
}: {
  cases: Case[];
  policy: Policy | null;
  user: User;
  onOpenCase: (item: Case) => void;
  onAcceptAssignment: (item: Case) => void;
  onRefresh: () => void;
  busy: boolean;
}) {
  const [filterState, setFilterState] = useState<
    "ALL" | "ASSIGNED" | "IN_PROGRESS"
  >("ALL");

  const myAssigned = cases.filter((c) => c.workflow_state === "ASSIGNED");
  const myInProgress = cases.filter((c) => c.workflow_state === "IN_PROGRESS");
  const myCompleted = cases.filter(
    (c) =>
      c.workflow_state === "RESOLUTION_SUBMITTED" ||
      c.workflow_state === "CITIZEN_VERIFICATION" ||
      c.workflow_state === "CLOSED",
  );

  const displayedCases = cases.filter((c) => {
    if (filterState === "ASSIGNED") return c.workflow_state === "ASSIGNED";
    if (filterState === "IN_PROGRESS")
      return c.workflow_state === "IN_PROGRESS";
    return (
      c.workflow_state === "ASSIGNED" ||
      c.workflow_state === "IN_PROGRESS" ||
      c.workflow_state === "RESOLUTION_SUBMITTED"
    );
  });

  return (
    <div className="flex flex-col w-full gap-6">
      {/* Officer Banner & Live Status */}
      <div className="relative overflow-hidden bg-[#e5eeff] rounded-xl p-6 border border-[#d9cdba] shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-[#f77f00] flex items-center justify-center text-white shadow-md shrink-0">
              <span className="material-symbols-outlined text-[30px]">
                engineering
              </span>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-xl lg:text-2xl font-bold text-[#0b1c30]">
                  Field Operations Console
                </h1>
                <span className="px-2.5 py-0.5 bg-[#ffdcc6] text-[#954a00] font-mono text-[10px] font-bold rounded">
                  BADGE #FO-09
                </span>
                <span className="px-2.5 py-0.5 bg-[#dce9ff] text-[#0037b0] text-[10px] font-semibold rounded uppercase">
                  Ward Operations Active
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#434655]">
                <span className="font-semibold text-[#0b1c30]">
                  {user.display_name}
                </span>
                <span>•</span>
                <span>Field Service & Ground Execution</span>
                <span>•</span>
                <span className="font-mono text-[11px]">
                  Asia/Kolkata (IST)
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg p-3.5 border border-[#d9cdba]/70 shadow-sm max-w-md">
            <div className="flex items-start gap-2.5">
              <span className="material-symbols-outlined text-[#f77f00] text-[20px] mt-0.5">
                verified_user
              </span>
              <div className="text-xs">
                <div className="font-semibold text-[#0b1c30] flex items-center justify-between">
                  <span>Ground Execution Protocol Strict</span>
                  <span className="font-mono text-[10px] text-[#f77f00] font-bold">
                    DISPATCH SYNCED
                  </span>
                </div>
                <p className="text-[11px] text-[#434655] mt-0.5">
                  Assigned cases require explicit field acceptance, photo upload
                  evidence of work, and resolution notes before citizen
                  inspection.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Metric / KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-4 border-t border-[#d9cdba]/50">
          <div
            onClick={() => setFilterState("ASSIGNED")}
            className="bg-white rounded-lg p-3.5 border border-[#d9cdba] shadow-sm flex items-center justify-between cursor-pointer hover:border-[#f77f00] transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#ffdcc6] flex items-center justify-center text-[#954a00]">
                <span className="material-symbols-outlined text-[22px]">
                  inbox
                </span>
              </div>
              <div>
                <div className="text-xl font-bold text-[#0b1c30]">
                  {myAssigned.length}
                </div>
                <div className="text-[11px] text-[#434655]">
                  Pending Acceptance
                </div>
              </div>
            </div>
            {myAssigned.length > 0 && (
              <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-[#ffdad6] text-[#ba1a1a] font-bold">
                ACTION REQ
              </span>
            )}
          </div>

          <div
            onClick={() => setFilterState("IN_PROGRESS")}
            className="bg-white rounded-lg p-3.5 border border-[#d9cdba] shadow-sm flex items-center justify-between cursor-pointer hover:border-[#f77f00] transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#dae2fd] flex items-center justify-center text-[#1d4ed8]">
                <span className="material-symbols-outlined text-[22px]">
                  construction
                </span>
              </div>
              <div>
                <div className="text-xl font-bold text-[#0b1c30]">
                  {myInProgress.length}
                </div>
                <div className="text-[11px] text-[#434655]">
                  In Active Execution
                </div>
              </div>
            </div>
            <span className="font-mono text-[10px] text-[#0037b0] font-semibold">
              ON SITE
            </span>
          </div>

          <div
            onClick={() => setFilterState("ALL")}
            className="bg-white rounded-lg p-3.5 border border-[#d9cdba] shadow-sm flex items-center justify-between cursor-pointer hover:border-[#f77f00] transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-800">
                <span className="material-symbols-outlined text-[22px]">
                  check_circle
                </span>
              </div>
              <div>
                <div className="text-xl font-bold text-[#0b1c30]">
                  {myCompleted.length}
                </div>
                <div className="text-[11px] text-[#434655]">
                  Rectifications Done
                </div>
              </div>
            </div>
            <span className="font-mono text-[10px] text-emerald-700 font-semibold">
              AUDITED
            </span>
          </div>
        </div>
      </div>

      {/* Assigned Work Orders List */}
      <section className="bg-white rounded-xl border border-[#d9cdba] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[#eff4ff] flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[#0b1c30]">
              Field Work Orders
            </span>
            <span className="px-2 py-0.5 rounded-full bg-[#eff4ff] text-[#434655] font-mono text-xs font-semibold">
              {displayedCases.length} Visible
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterState("ALL")}
              className={`px-3 py-1 rounded text-xs font-semibold ${
                filterState === "ALL"
                  ? "bg-[#f77f00] text-white"
                  : "bg-[#eff4ff] text-[#434655]"
              }`}
            >
              All ({cases.length})
            </button>
            <button
              onClick={() => setFilterState("ASSIGNED")}
              className={`px-3 py-1 rounded text-xs font-semibold ${
                filterState === "ASSIGNED"
                  ? "bg-[#f77f00] text-white"
                  : "bg-[#eff4ff] text-[#434655]"
              }`}
            >
              Needs Acceptance ({myAssigned.length})
            </button>
            <button
              onClick={() => setFilterState("IN_PROGRESS")}
              className={`px-3 py-1 rounded text-xs font-semibold ${
                filterState === "IN_PROGRESS"
                  ? "bg-[#f77f00] text-white"
                  : "bg-[#eff4ff] text-[#434655]"
              }`}
            >
              In Execution ({myInProgress.length})
            </button>
            <button
              onClick={onRefresh}
              className="p-1.5 bg-[#eff4ff] rounded text-[#434655] hover:text-[#0b1c30]"
              title="Refresh"
            >
              <span className="material-symbols-outlined text-[18px]">
                refresh
              </span>
            </button>
          </div>
        </div>

        {displayedCases.length === 0 ? (
          <div className="p-12 text-center">
            <span className="material-symbols-outlined text-4xl text-[#565e74] mb-2">
              task
            </span>
            <p className="text-sm font-semibold text-[#0b1c30]">
              No active work orders
            </p>
            <p className="text-xs text-[#434655] mt-1">
              There are no cases assigned to field execution under the current
              filter.
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
                  <div className="w-10 h-10 rounded-lg bg-[#e5eeff] flex items-center justify-center text-[#f77f00] shrink-0 mt-0.5">
                    <span className="material-symbols-outlined text-[22px]">
                      {item.workflow_state === "ASSIGNED"
                        ? "assignment"
                        : "build"}
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
                      Ground Site: {item.location}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 flex-wrap">
                  <div className="text-right">
                    <div className="text-[10px] text-[#434655] uppercase font-bold">
                      SLA Deadline
                    </div>
                    <div className="font-mono text-xs font-semibold text-[#f77f00]">
                      {date(item.current_deadline, item.timezone)}
                    </div>
                  </div>

                  {item.workflow_state === "ASSIGNED" && (
                    <button
                      onClick={() => onAcceptAssignment(item)}
                      disabled={busy}
                      className="px-4 py-2 bg-[#f77f00] hover:bg-[#d96e00] text-white text-xs font-semibold rounded shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        how_to_reg
                      </span>
                      <span>Accept Assignment</span>
                    </button>
                  )}

                  <button
                    aria-label={`View case ${item.description}`}
                    onClick={() => onOpenCase(item)}
                    className="px-4 py-2 bg-[#e5eeff] hover:bg-[#dce9ff] text-[#0b1c30] text-xs font-semibold rounded border border-[#d9cdba] transition-colors cursor-pointer"
                  >
                    View case
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
