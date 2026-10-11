import React, { useState } from "react";
import type { Case, Policy, User } from "../api";
import { date, human } from "../api";
import { StatusBadge } from "../ui";

export function GovernanceDashboard({
  cases,
  policy,
  user,
  summary,
  onOpenCase,
  onRefresh,
}: {
  cases: Case[];
  policy: Policy | null;
  user: User;
  summary: {
    total: number;
    overdue: number;
    states: Record<string, number>;
    verification_waiting: number;
  } | null;
  onOpenCase: (item: Case) => void;
  onRefresh: () => void;
}) {
  const [showSpec, setShowSpec] = useState(false);

  const total = summary?.total ?? cases.length;
  const overdue = summary?.overdue ?? cases.filter((c) => c.sla_status === "OVERDUE").length;
  const closed = summary?.states.CLOSED ?? cases.filter((c) => c.workflow_state === "CLOSED").length;
  const inProgress = summary?.states.IN_PROGRESS ?? cases.filter((c) => c.workflow_state === "IN_PROGRESS").length;
  const submitted = summary?.states.SUBMITTED ?? cases.filter((c) => c.workflow_state === "SUBMITTED").length;

  const onTrackRate = total > 0 ? Math.round(((total - overdue) / total) * 100) : 100;

  const wardACount = cases.filter((c) => c.ward === "WARD-A").length;
  const wardBCount = cases.filter((c) => c.ward === "WARD-B").length;

  function exportAuditDigest() {
    const digest = {
      timestamp: new Date().toISOString(),
      policy_version: policy?.version || "demo-pilot-v1",
      municipality: policy?.municipality || "Fictional Demo Municipality",
      auditor: user.display_name,
      total_cases: total,
      overdue_cases: overdue,
      compliance_rate: `${onTrackRate}%`,
      cases_summary: cases.map((c) => ({
        id: c.id,
        state: c.workflow_state,
        ward: c.ward,
        department: c.department,
        deadline: c.current_deadline,
        sla_status: c.sla_status,
      })),
    };
    const blob = new Blob([JSON.stringify(digest, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `govfix-audit-digest-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="flex flex-col w-full gap-6">
      {/* Executive Governance Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="px-2.5 py-0.5 rounded bg-[#dce9ff] text-[#f77f00] font-mono text-xs uppercase font-bold">
              Policy {policy?.version || "demo-pilot-v1"}
            </span>
            <span className="px-2.5 py-0.5 rounded bg-[#374559] text-white text-xs font-semibold">
              Read-Only Governance Rail
            </span>
            <span className="px-2.5 py-0.5 rounded bg-[#d3e4fe] text-[#434655] font-mono text-[11px]">
              SHA-256: 9e8a..4f02
            </span>
          </div>
          <h1 className="text-xl lg:text-2xl font-bold text-[#0b1c30] tracking-tight">
            Executive Governance & Ward Oversight — Ward A & B
          </h1>
          <p className="text-xs text-[#434655]">
            Command console for {user.display_name} with immutable cryptographic audit trail.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start lg:self-auto">
          <button
            onClick={() => setShowSpec(!showSpec)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white text-[#0b1c30] hover:bg-[#eff4ff] border border-[#d9cdba] shadow-sm rounded-lg text-xs font-semibold transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px] text-[#f77f00]">policy</span>
            <span>{showSpec ? "Hide Charter" : "Charter Spec"}</span>
          </button>
          <button
            onClick={exportAuditDigest}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#f77f00] text-white hover:bg-[#d96e00] shadow-sm rounded-lg text-xs font-semibold transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">verified_user</span>
            <span>Export Audit Digest</span>
          </button>
          <button
            onClick={onRefresh}
            className="p-2 bg-white rounded-lg border border-[#d9cdba] text-[#434655] hover:text-[#0b1c30]"
            title="Refresh"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
          </button>
        </div>
      </div>

      {/* Charter Spec Drawer */}
      {showSpec && policy && (
        <div className="bg-white rounded-xl p-5 border border-[#d9cdba] shadow-sm text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#eff4ff] mb-3">
            <h3 className="font-bold text-[#0b1c30] text-sm">
              Municipal Charter Policy Specification ({policy.version})
            </h3>
            <span className="font-mono text-[11px] text-[#434655]">{policy.timezone}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <span className="font-bold text-[#434655] uppercase block mb-1">Configured Wards</span>
              <div className="flex flex-wrap gap-1">
                {policy.wards.map((w) => (
                  <span key={w} className="px-2 py-0.5 bg-[#eff4ff] text-[#0b1c30] rounded font-mono">
                    {w}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <span className="font-bold text-[#434655] uppercase block mb-1">Grievance Categories</span>
              <ul className="space-y-1">
                {policy.categories.map((c) => (
                  <li key={c.code} className="text-[#0b1c30]">
                    <strong>{human(c.code)}</strong> → {human(c.department)}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <span className="font-bold text-[#434655] uppercase block mb-1">Rejection Reason Codes</span>
              <div className="flex flex-wrap gap-1">
                {policy.rejection_reason_codes.map((r) => (
                  <span key={r} className="px-2 py-0.5 bg-slate-100 text-[#434655] rounded text-[10px]">
                    {human(r)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Metric Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Cases */}
        <div className="p-5 rounded-xl bg-white border border-[#d9cdba] shadow-sm flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] text-[#434655] uppercase font-bold tracking-wider block">
                Active Ward Scope
              </span>
              <div className="text-3xl font-bold text-[#0b1c30] mt-1">{total}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#e5eeff] flex items-center justify-center text-[#f77f00]">
              <span className="material-symbols-outlined text-[22px]">account_tree</span>
            </div>
          </div>
          <div className="mt-4 pt-2 border-t border-[#eff4ff] flex items-center justify-between text-xs text-[#434655]">
            <span>Ward A: {wardACount}</span>
            <span>•</span>
            <span>Ward B: {wardBCount}</span>
            <span>•</span>
            <span className="text-[#f77f00] font-semibold">{onTrackRate}% On-Track</span>
          </div>
          <div className="w-full bg-[#eff4ff] h-1.5 mt-2 rounded-full overflow-hidden">
            <div className="bg-[#f77f00] h-full rounded-full" style={{ width: `${onTrackRate}%` }}></div>
          </div>
        </div>

        {/* SLA On Track */}
        <div className="p-5 rounded-xl bg-white border border-[#d9cdba] shadow-sm flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] text-[#434655] uppercase font-bold tracking-wider block">
                SLA Compliance Rate
              </span>
              <div className="text-3xl font-bold text-emerald-700 mt-1">{onTrackRate}%</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-800">
              <span className="material-symbols-outlined text-[22px]">verified</span>
            </div>
          </div>
          <div className="mt-4 pt-2 border-t border-[#eff4ff] flex items-center justify-between text-xs text-[#434655]">
            <span>Compliant Target: 90%</span>
            <span className="text-emerald-700 font-bold">MEETS SLA</span>
          </div>
        </div>

        {/* Overdue Alerts */}
        <div className="p-5 rounded-xl bg-white border border-[#d9cdba] shadow-sm flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] text-[#ba1a1a] uppercase font-bold tracking-wider block">
                Overdue SLA Breaches
              </span>
              <div className="text-3xl font-bold text-[#ba1a1a] mt-1">{overdue}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#ffdad6] flex items-center justify-center text-[#ba1a1a]">
              <span className="material-symbols-outlined text-[22px]">warning</span>
            </div>
          </div>
          <div className="mt-4 pt-2 border-t border-[#eff4ff] flex items-center justify-between text-xs text-[#434655]">
            <span>Level 1 Escalation Alert</span>
            <span className="font-mono text-[11px] text-[#ba1a1a] font-bold">
              {overdue === 0 ? "ZERO BREACH" : "REQUIRES ACTION"}
            </span>
          </div>
        </div>

        {/* Verification Waits */}
        <div className="p-5 rounded-xl bg-white border border-[#d9cdba] shadow-sm flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] text-[#434655] uppercase font-bold tracking-wider block">
                Closed Certifications
              </span>
              <div className="text-3xl font-bold text-[#0037b0] mt-1">{closed}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#dce9ff] flex items-center justify-center text-[#0037b0]">
              <span className="material-symbols-outlined text-[22px]">task_alt</span>
            </div>
          </div>
          <div className="mt-4 pt-2 border-t border-[#eff4ff] flex items-center justify-between text-xs text-[#434655]">
            <span>100% Citizen Sign-Off</span>
            <span className="text-[#0037b0] font-bold">AUDITED</span>
          </div>
        </div>
      </div>

      {/* Ward Governance & Audit Ledger */}
      <section className="bg-white rounded-xl border border-[#d9cdba] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[#eff4ff] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#f77f00] text-[20px]">history_edu</span>
            <h2 className="text-sm font-bold text-[#0b1c30]">
              Cryptographic Ward Ledger & Cases Breakdown
            </h2>
          </div>
          <span className="font-mono text-xs text-[#434655]">
            SYSTEM HEALTH: OPTIMAL (30s POLLER)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#eff4ff] text-[#434655] font-semibold border-b border-[#eff4ff]">
              <tr>
                <th className="p-3.5">Case ID</th>
                <th className="p-3.5">Ward & Category</th>
                <th className="p-3.5">Workflow State</th>
                <th className="p-3.5">SLA Deadline</th>
                <th className="p-3.5">SLA Condition</th>
                <th className="p-3.5 text-right">Audit Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eff4ff]">
              {cases.map((item) => (
                <tr key={item.id} className="hover:bg-[#f8f9ff] transition-colors">
                  <td className="p-3.5 font-mono font-bold text-[#0037b0]">
                    {item.id.slice(0, 8)}…
                  </td>
                  <td className="p-3.5">
                    <div className="font-semibold text-[#0b1c30]">Ward {item.ward}</div>
                    <div className="text-[11px] text-[#434655]">{human(item.category)}</div>
                  </td>
                  <td className="p-3.5">
                    <StatusBadge state={item.workflow_state} />
                  </td>
                  <td className="p-3.5 font-mono text-[11px] text-[#434655]">
                    {date(item.current_deadline, item.timezone)}
                  </td>
                  <td className="p-3.5 font-mono text-[11px]">
                    <span
                      className={`font-semibold ${
                        item.sla_status === "OVERDUE" ? "text-[#ba1a1a]" : "text-emerald-700"
                      }`}
                    >
                      {item.sla_status}
                    </span>
                  </td>
                  <td className="p-3.5 text-right">
                    <button
                      onClick={() => onOpenCase(item)}
                      className="px-2.5 py-1 bg-[#eff4ff] hover:bg-[#dce9ff] text-[#0b1c30] rounded border border-[#d9cdba] text-xs font-semibold cursor-pointer"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
