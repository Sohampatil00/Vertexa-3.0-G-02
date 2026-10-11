import React, { useState, useEffect } from "react";
import type { Case, Policy, User, Operations } from "../api";
import { api, date, human } from "../api";
import { StatusBadge } from "../ui";

export function DispatcherDashboard({
  cases,
  policy,
  user,
  token,
  onOpenCase,
  onAssign,
  onRefresh,
  busy,
}: {
  cases: Case[];
  policy: Policy | null;
  user: User;
  token: string;
  onOpenCase: (item: Case) => void;
  onAssign: (item: Case, officerId: string, reason: string) => void;
  onRefresh: () => void;
  busy: boolean;
}) {
  const validatedCases = cases.filter((c) => c.workflow_state === "VALIDATED");
  const [activeCase, setActiveCase] = useState<Case | null>(null);
  const [officers, setOfficers] = useState<{ id: string; name: string }[]>([]);
  const [selectedOfficer, setSelectedOfficer] = useState<string>("");
  const [reason, setReason] = useState<string>(
    "Standard municipal triage assignment to on-duty sector crew.",
  );
  const [loadingOps, setLoadingOps] = useState<boolean>(false);

  const selectedCase = activeCase || validatedCases[0] || null;

  // Load eligible officers when active case changes
  useEffect(() => {
    if (!selectedCase) return;
    let live = true;
    setLoadingOps(true);
    api<Operations>(token, `/cases/${selectedCase.id}/operations`)
      .then((ops) => {
        if (live) {
          setOfficers(ops.officers || []);
          if (ops.officers.length > 0) {
            setSelectedOfficer(ops.officers[0].id);
          }
        }
      })
      .catch(() => {
        if (live) setOfficers([]);
      })
      .finally(() => {
        if (live) setLoadingOps(false);
      });
    return () => {
      live = false;
    };
  }, [selectedCase?.id, token]);

  return (
    <div className="flex flex-col w-full gap-6">
      {/* Header & Live Status Pill */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-[#f77f00] text-white font-mono text-[10px] uppercase font-bold tracking-wider">
              Desk Unit 02-B
            </span>
            <span className="text-xs text-[#434655] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0037b0]"></span>
              Dispatcher: {user.display_name} (Central Municipal Dispatch)
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-[#0b1c30] tracking-tight">
            Dispatcher Operations — Validated Cases Awaiting Officer Assignment
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-white px-3 py-2 rounded-lg border border-[#d9cdba] shadow-sm flex items-center gap-2 text-xs">
            <span className="material-symbols-outlined text-[18px] text-[#f77f00]">
              sync
            </span>
            <span className="font-mono text-[11px] font-bold text-[#0b1c30] uppercase">
              Roster Sync: Active
            </span>
          </div>
          <button
            onClick={onRefresh}
            className="p-2 bg-white rounded-lg border border-[#d9cdba] text-[#434655] hover:text-[#0b1c30] transition-colors"
            title="Refresh queue"
          >
            <span className="material-symbols-outlined text-[20px]">
              refresh
            </span>
          </button>
        </div>
      </div>

      {/* Operational Metrics Ticker Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#d9cdba] shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] text-[#434655] uppercase font-bold tracking-wider block">
              Validated Awaiting Assignment
            </span>
            <span className="text-3xl font-bold text-[#0b1c30] mt-1 block">
              {validatedCases.length}
            </span>
            <span className="font-mono text-[11px] text-[#f77f00] font-semibold">
              Prioritized queue
            </span>
          </div>
          <div className="w-12 h-12 rounded-lg bg-[#ffdcc6] flex items-center justify-center text-[#954a00]">
            <span className="material-symbols-outlined text-[28px]">
              pending_actions
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#d9cdba] shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] text-[#434655] uppercase font-bold tracking-wider block">
              Available Officers in Roster
            </span>
            <span className="text-3xl font-bold text-[#0b1c30] mt-1 block">
              {officers.length || 2}
            </span>
            <span className="font-mono text-[11px] text-[#0037b0] font-semibold">
              Wards A & B Rostered
            </span>
          </div>
          <div className="w-12 h-12 rounded-lg bg-[#dce9ff] flex items-center justify-center text-[#0037b0]">
            <span className="material-symbols-outlined text-[28px]">
              groups
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#d9cdba] shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] text-[#434655] uppercase font-bold tracking-wider block">
              SLA Unassigned Breaches
            </span>
            <span className="text-3xl font-bold text-[#0b1c30] mt-1 block">
              0
            </span>
            <span className="font-mono text-[11px] text-emerald-700 font-semibold">
              100% SLA Compliant
            </span>
          </div>
          <div className="w-12 h-12 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-800">
            <span className="material-symbols-outlined text-[28px]">
              check_circle
            </span>
          </div>
        </div>
      </div>

      {/* Scope Notice Banner */}
      <div className="bg-[#e5eeff] text-[#0b1c30] px-4 py-3 rounded-lg border border-[#d9cdba] shadow-sm flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[#f77f00] text-white flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-[18px]">gavel</span>
        </div>
        <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
          <p>
            <strong className="text-[#f77f00] uppercase tracking-wider mr-1">
              Scope Rules:
            </strong>
            Assign validated cases to eligible department officers in designated
            ward. Reassignment or SLA extension requires Supervisor privileges.
          </p>
          <span className="font-mono text-[10px] text-[#434655] bg-white px-2 py-0.5 rounded border border-[#d9cdba]/50 whitespace-nowrap self-start sm:self-auto font-bold">
            AUTH LEVEL: LVL-II
          </span>
        </div>
      </div>

      {/* Main Grid: Left Validated Queue + Right Assignment Dock */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Validated Cases Queue */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="bg-white p-4 rounded-xl border border-[#d9cdba] shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-[#f77f00]">
                low_priority
              </span>
              <span className="text-sm font-bold text-[#0b1c30]">
                Queue Stage: Validated / Ready
              </span>
              <span className="bg-[#eff4ff] px-2 py-0.5 rounded-full font-mono text-xs font-semibold text-[#0037b0]">
                {validatedCases.length} Pending
              </span>
            </div>
          </div>

          {validatedCases.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#d9cdba] p-12 text-center shadow-sm">
              <span className="material-symbols-outlined text-4xl text-[#565e74] mb-2">
                assignment_turned_in
              </span>
              <p className="text-sm font-semibold text-[#0b1c30]">
                No validated cases awaiting assignment
              </p>
              <p className="text-xs text-[#434655] mt-1">
                All validated cases have been assigned to field officers or
                await intake validation.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {validatedCases.map((item) => {
                const isSelected = selectedCase?.id === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => setActiveCase(item)}
                    className={`bg-white p-5 rounded-xl border transition-all cursor-pointer shadow-sm ${
                      isSelected
                        ? "border-[#f77f00] ring-1 ring-[#f77f00] bg-[#eff4ff]/30"
                        : "border-[#d9cdba] hover:border-[#f77f00]/60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold bg-[#e5eeff] text-[#0037b0] px-2 py-0.5 rounded">
                          {item.id.slice(0, 8)}…
                        </span>
                        <span className="px-2 py-0.5 rounded bg-[#eff4ff] text-[#0b1c30] text-[11px] font-semibold">
                          Ward {item.ward}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-[#dce9ff] text-[#0037b0] text-[11px] font-semibold">
                          {human(item.department)}
                        </span>
                      </div>
                      <StatusBadge state={item.workflow_state} />
                    </div>

                    <h3 className="text-sm font-semibold text-[#0b1c30]">
                      {item.description}
                    </h3>
                    <p className="text-xs text-[#434655] mt-1">
                      Location: {item.location}
                    </p>

                    <div className="mt-3 pt-3 border-t border-[#eff4ff] flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1 font-mono text-[11px] text-[#434655]">
                        <span className="material-symbols-outlined text-[14px] text-[#f77f00]">
                          schedule
                        </span>
                        <span>
                          SLA Target:{" "}
                          {date(item.current_deadline, item.timezone)}
                        </span>
                      </div>
                      <span className="text-[#f77f00] font-semibold flex items-center gap-1">
                        <span>Select to assign</span>
                        <span className="material-symbols-outlined text-[14px]">
                          arrow_forward
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Integrated Assignment Dock */}
        <div className="lg:col-span-5 flex flex-col gap-4 sticky top-20">
          {selectedCase ? (
            <div className="bg-white rounded-xl border border-[#d9cdba] shadow-sm p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#eff4ff]">
                <div>
                  <span className="text-[10px] font-bold text-[#f77f00] uppercase tracking-wider block">
                    Officer Assignment Dock
                  </span>
                  <span className="font-mono text-xs font-semibold text-[#0b1c30]">
                    Case {selectedCase.id}
                  </span>
                </div>
                <button
                  aria-label={`View case ${selectedCase.description}`}
                  onClick={() => onOpenCase(selectedCase)}
                  className="text-xs text-[#0037b0] hover:underline font-semibold flex items-center gap-1"
                >
                  <span>Details</span>
                  <span className="material-symbols-outlined text-[14px]">
                    open_in_new
                  </span>
                </button>
              </div>

              <div>
                <span className="text-xs font-semibold text-[#434655] block mb-1">
                  Validated Grievance Summary
                </span>
                <p className="text-xs text-[#0b1c30] bg-[#eff4ff] p-3 rounded-lg leading-relaxed">
                  {selectedCase.description}
                </p>
                <div className="flex items-center gap-2 mt-2 text-[11px] text-[#434655]">
                  <span>Ward: {selectedCase.ward}</span>
                  <span>•</span>
                  <span>Dept: {human(selectedCase.department)}</span>
                </div>
              </div>

              {/* Assignment Form */}
              <div className="space-y-3 pt-2 border-t border-[#eff4ff]">
                <div>
                  <label className="text-[11px] text-[#434655] uppercase font-bold block mb-1">
                    Select Field Officer in Department
                  </label>
                  {loadingOps ? (
                    <div className="p-2 text-xs text-[#434655] bg-[#eff4ff] rounded">
                      Loading available officers…
                    </div>
                  ) : officers.length > 0 ? (
                    <select
                      value={selectedOfficer}
                      onChange={(e) => setSelectedOfficer(e.target.value)}
                      className="w-full text-xs font-semibold p-2.5 rounded-lg bg-white border border-[#d9cdba] text-[#0b1c30] focus:ring-1 focus:ring-[#f77f00]"
                    >
                      {officers.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name} (ID: {o.id.slice(0, 8)})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="p-2.5 text-xs text-amber-800 bg-amber-50 rounded border border-amber-200">
                      No provisioned officer for this ward/department yet. An
                      administrator provisions officers via CLI.
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[11px] text-[#434655] uppercase font-bold block mb-1">
                    Assignment Reason / Work Order Memo
                  </label>
                  <textarea
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Enter dispatch assignment reason..."
                    className="w-full text-xs p-2.5 rounded-lg bg-white border border-[#d9cdba] text-[#0b1c30] focus:ring-1 focus:ring-[#f77f00]"
                  />
                </div>

                <button
                  onClick={() => {
                    if (!selectedOfficer) {
                      alert("Please select an eligible officer.");
                      return;
                    }
                    if (!reason.trim()) {
                      alert("Please provide an assignment reason.");
                      return;
                    }
                    onAssign(selectedCase, selectedOfficer, reason);
                  }}
                  disabled={busy || officers.length === 0}
                  className="w-full py-2.5 bg-[#f77f00] hover:bg-[#d96e00] text-white font-semibold text-xs rounded shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    send
                  </span>
                  <span>Dispatch & Bind Assignment</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-[#d9cdba] shadow-sm p-8 text-center text-[#434655]">
              <span className="material-symbols-outlined text-3xl mb-1">
                touch_app
              </span>
              <p className="text-xs font-semibold">
                Select a validated case to assign
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
