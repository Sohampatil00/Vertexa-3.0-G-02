import React, { useState } from "react";
import type { Case, Policy, User } from "../api";
import { date, human } from "../api";
import { StatusBadge } from "../ui";

export function IntakeDashboard({
  cases,
  policy,
  user,
  onOpenCase,
  onValidate,
  onReject,
  onRefresh,
  busy,
}: {
  cases: Case[];
  policy: Policy | null;
  user: User;
  onOpenCase: (item: Case) => void;
  onValidate: (item: Case) => void;
  onReject: (item: Case, reasonCode: string, explanation: string) => void;
  onRefresh: () => void;
  busy: boolean;
}) {
  const [search, setSearch] = useState("");
  const [selectedWard, setSelectedWard] = useState<string>("ALL");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [activeItem, setActiveItem] = useState<Case | null>(null);

  // Rejection modal/form state
  const [rejecting, setRejecting] = useState(false);
  const [reasonCode, setReasonCode] = useState(
    policy?.rejection_reason_codes[0] || "OUT_OF_JURISDICTION",
  );
  const [explanation, setExplanation] = useState("");

  const submittedCases = cases.filter((c) => c.workflow_state === "SUBMITTED");
  const filteredCases = submittedCases.filter((item) => {
    if (selectedWard !== "ALL" && item.ward !== selectedWard) return false;
    if (selectedCategory !== "ALL" && item.category !== selectedCategory)
      return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        item.id.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.location.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const selectedCase =
    filteredCases.find((item) => item.id === activeItem?.id) || filteredCases[0] || null;

  return (
    <div className="flex flex-col w-full gap-6">
      {/* Top Officer Profile Bar */}
      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-xl bg-[#e5eeff] border border-[#d9cdba] shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-lg bg-[#f77f00] flex items-center justify-center shrink-0 text-white shadow-sm">
            <span className="material-symbols-outlined text-[26px]">
              how_to_reg
            </span>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-[#0b1c30]">
                Municipal Intake Queue
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-[#dae2fd] text-[#131b2e] font-mono text-[10px] uppercase font-semibold">
                Desk 04B
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#dce9ff] text-[#0037b0] text-[10px] font-semibold">
                Validation Active
              </span>
            </div>
            <p className="text-xs text-[#434655] mt-1">
              Officer:{" "}
              <strong className="text-[#0b1c30]">{user.display_name}</strong> •
              Intake & Triage Desk • Scope: Ward A & B
            </p>
          </div>
        </div>

        {/* Mini Metrics */}
        <div className="flex items-center gap-3 overflow-x-auto pb-1 sm:pb-0">
          <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg bg-white border border-[#d9cdba]/50 shadow-sm shrink-0">
            <div className="w-2.5 h-2.5 rounded-full bg-[#0037b0]"></div>
            <div>
              <span className="text-[10px] text-[#434655] uppercase block">
                Visible Queue
              </span>
              <span className="text-base font-bold text-[#0b1c30] leading-none">
                {String(submittedCases.length).padStart(2, "0")}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg bg-white border border-[#d9cdba]/50 shadow-sm shrink-0">
            <div className="w-2.5 h-2.5 rounded-full bg-[#ba1a1a] animate-pulse"></div>
            <div>
              <span className="text-[10px] text-[#ba1a1a] uppercase font-bold block">
                Pending Validation
              </span>
              <span className="text-base font-bold text-[#ba1a1a] leading-none">
                {String(submittedCases.length).padStart(2, "0")}
              </span>
            </div>
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
      </section>

      {/* Main Split: Queue Table (left) & Validation Inspector (right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Column: Submissions Table */}
        <div className="xl:col-span-7 flex flex-col gap-4">
          {/* Filters Bar */}
          <div className="p-4 rounded-xl bg-white border border-[#d9cdba] shadow-sm flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#434655] text-[18px]">
                  search
                </span>
                <input
                  type="text"
                  placeholder="Search Case ID or street location..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 bg-[#eff4ff] rounded-lg text-xs text-[#0b1c30] placeholder:text-[#434655] border border-transparent focus:border-[#d9cdba] focus:bg-white focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <select
                aria-label="Filter intake category"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="h-9 px-2.5 bg-[#eff4ff] rounded-lg text-xs text-[#0b1c30] border border-[#d9cdba]/50 focus:outline-none"
                >
                <option value="ALL">All Categories</option>
                  {policy?.categories.map((c) => (
                    <option key={c.code} value={c.code}>
                      {human(c.code)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Ward Filter Chips */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-[#eff4ff]">
              <span className="text-[11px] text-[#434655] mr-1 font-semibold uppercase">
                Ward:
              </span>
              <button
                onClick={() => setSelectedWard("ALL")}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  selectedWard === "ALL"
                    ? "bg-[#f77f00] text-white"
                    : "bg-[#eff4ff] text-[#434655] hover:bg-[#dce9ff]"
                }`}
              >
                All Wards ({submittedCases.length})
              </button>
              {policy?.wards.map((w) => {
                const count = submittedCases.filter((c) => c.ward === w).length;
                return (
                  <button
                    key={w}
                    onClick={() => setSelectedWard(w)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                      selectedWard === w
                        ? "bg-[#f77f00] text-white"
                        : "bg-[#eff4ff] text-[#434655] hover:bg-[#dce9ff]"
                    }`}
                  >
                    {w} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cases Queue List */}
          <div className="bg-white rounded-xl border border-[#d9cdba] shadow-sm overflow-hidden">
            <div className="p-4 border-b border-[#eff4ff] flex items-center justify-between">
              <span className="text-xs font-bold text-[#0b1c30] uppercase tracking-wider">
                Pending Triage Queue ({filteredCases.length})
              </span>
              <span className="font-mono text-[11px] text-[#434655]">
                SLA TARGET: 4h WINDOW
              </span>
            </div>

            {filteredCases.length === 0 ? (
              <div className="p-10 text-center">
                <span className="material-symbols-outlined text-4xl text-[#565e74] mb-2">
                  done_all
                </span>
                <p className="text-xs font-semibold text-[#0b1c30]">
                  Intake queue is clear
                </p>
                <p className="text-[11px] text-[#434655] mt-0.5">
                  No submitted cases awaiting validation under current filter.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#eff4ff]">
                {filteredCases.map((item) => {
                  const isSelected = selectedCase?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setActiveItem(item)}
                      className={`p-4 transition-colors cursor-pointer flex flex-col gap-2 ${
                        isSelected
                          ? "bg-[#e5eeff] border-l-4 border-l-[#f77f00]"
                          : "hover:bg-[#f8f9ff]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-[#0037b0]">
                            {item.id.slice(0, 8)}…
                          </span>
                          <span className="px-2 py-0.5 rounded bg-[#eff4ff] text-[10px] font-semibold text-[#0b1c30]">
                            Ward {item.ward}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-[#eff4ff] text-[10px] font-semibold text-[#0037b0]">
                            {human(item.department)}
                          </span>
                        </div>
                        <StatusBadge state={item.workflow_state} />
                      </div>

                      <h3 className="text-sm font-semibold text-[#0b1c30] line-clamp-1">
                        {item.description}
                      </h3>

                      <div className="flex items-center justify-between text-xs text-[#434655]">
                        <span className="truncate max-w-[280px]">
                          Location: {item.location}
                        </span>
                        <span className="font-mono text-[11px] text-[#0037b0]">
                          Due: {date(item.current_deadline, item.timezone)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Persistent Validation Inspector Dock */}
        <div className="xl:col-span-5 flex flex-col gap-4 sticky top-20">
          {selectedCase ? (
            <div className="bg-white rounded-xl border border-[#d9cdba] shadow-sm p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#eff4ff]">
                <div>
                  <span className="text-[10px] font-bold text-[#0037b0] uppercase tracking-wider block">
                    Validation Inspector
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
                  <span>View case</span>
                  <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                    open_in_new
                  </span>
                </button>
              </div>

              <div>
                <span className="text-xs font-bold text-[#434655] uppercase block mb-1">
                  Citizen Grievance Statement
                </span>
                <p className="text-xs text-[#0b1c30] bg-[#eff4ff] p-3 rounded-lg leading-relaxed whitespace-pre-wrap">
                  {selectedCase.description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 rounded bg-[#eff4ff]">
                  <span className="text-[10px] text-[#434655] uppercase block">
                    Ward & Sector
                  </span>
                  <span className="font-semibold text-[#0b1c30]">
                    Ward {selectedCase.ward}
                  </span>
                </div>
                <div className="p-2.5 rounded bg-[#eff4ff]">
                  <span className="text-[10px] text-[#434655] uppercase block">
                    Assigned Dept
                  </span>
                  <span className="font-semibold text-[#0b1c30]">
                    {human(selectedCase.department)}
                  </span>
                </div>
                <div className="col-span-2 p-2.5 rounded bg-[#eff4ff]">
                  <span className="text-[10px] text-[#434655] uppercase block">
                    Location Recorded
                  </span>
                  <span className="font-semibold text-[#0b1c30]">
                    {selectedCase.location}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-[#eff4ff] flex flex-col gap-2">
                {!rejecting ? (
                  <>
                    <button
                      onClick={() => onValidate(selectedCase)}
                      disabled={busy}
                      className="w-full py-2.5 bg-[#f77f00] hover:bg-[#d96e00] text-white font-semibold text-xs rounded shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        verified
                      </span>
                      <span>Validate & Advance to Dispatch</span>
                    </button>
                    <button
                      onClick={() => setRejecting(true)}
                      disabled={busy}
                      className="w-full py-2 bg-white hover:bg-[#ffdad6] text-[#ba1a1a] font-semibold text-xs rounded border border-[#ba1a1a]/40 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        block
                      </span>
                      <span>Reject with Coded Reason</span>
                    </button>
                  </>
                ) : (
                  <div className="space-y-3 bg-[#ffdad6]/30 p-3.5 rounded-lg border border-[#ba1a1a]/30">
                    <span className="text-xs font-bold text-[#ba1a1a] block">
                      Reject Case with Audit Trail
                    </span>
                    <div>
                      <label className="text-[10px] text-[#434655] uppercase font-semibold block mb-1">
                        Reason Code
                      </label>
                      <select
                        value={reasonCode}
                        onChange={(e) => setReasonCode(e.target.value)}
                        className="w-full text-xs p-2 rounded bg-white border border-[#d9cdba]"
                      >
                        {policy?.rejection_reason_codes.map((r) => (
                          <option key={r} value={r}>
                            {human(r)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-[#434655] uppercase font-semibold block mb-1">
                        Audited Explanation
                      </label>
                      <textarea
                        rows={2}
                        value={explanation}
                        onChange={(e) => setExplanation(e.target.value)}
                        placeholder="Explain reason for rejection..."
                        className="w-full text-xs p-2 rounded bg-white border border-[#d9cdba]"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (!explanation.trim()) {
                            alert("Please provide an explanation.");
                            return;
                          }
                          onReject(selectedCase, reasonCode, explanation);
                          setRejecting(false);
                        }}
                        disabled={busy}
                        className="flex-1 py-1.5 bg-[#ba1a1a] text-white text-xs font-semibold rounded"
                      >
                        Confirm Rejection
                      </button>
                      <button
                        onClick={() => setRejecting(false)}
                        className="px-3 py-1.5 bg-white border border-[#d9cdba] text-xs font-semibold rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-[#d9cdba] shadow-sm p-8 text-center text-[#434655]">
              <span className="material-symbols-outlined text-3xl mb-1">
                touch_app
              </span>
              <p className="text-xs font-semibold">
                Select a case from queue to validate
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
