import React, { useState } from "react";
import type { Case, Policy, User } from "../api";
import { date, human } from "../api";
import { StatusBadge } from "../ui";
import { VoiceAccess } from "../voice";

export function CitizenDashboard({
  cases,
  policy,
  user,
  token,
  onOpenCase,
  onNewGrievance,
  onRefresh,
}: {
  cases: Case[];
  policy: Policy | null;
  user: User;
  token: string;
  onOpenCase: (item: Case) => void;
  onNewGrievance: () => void;
  onRefresh: () => void;
}) {
  const [showVoice, setShowVoice] = useState(false);

  const awaitingVerification = cases.filter(
    (c) => c.workflow_state === "CITIZEN_VERIFICATION",
  );
  const inProgressCases = cases.filter(
    (c) =>
      c.workflow_state === "IN_PROGRESS" ||
      c.workflow_state === "ASSIGNED" ||
      c.workflow_state === "VALIDATED" ||
      c.workflow_state === "SUBMITTED",
  );
  const closedCases = cases.filter(
    (c) => c.workflow_state === "CLOSED" || c.workflow_state === "REJECTED",
  );

  const urgentCase = awaitingVerification[0] || null;

  return (
    <div className="flex flex-col w-full gap-6">
      {/* Top Banner & Quick Action Hub */}
      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded bg-[#dce9ff] text-[#0037b0] text-[11px] font-semibold uppercase tracking-wider">
              Demo policy active • {cases.length} grievances visible
            </span>
            <span className="inline-flex items-center gap-1.5 text-[#434655] text-xs">
              <span className="w-2 h-2 rounded-full bg-[#f77f00] animate-pulse"></span>
              Civic SLA Node: Ward Operations
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[#0b1c30] tracking-tight mt-1">
            Welcome back, {user.display_name}
          </h1>
          <p className="text-xs md:text-sm text-[#434655]">
            Registered Citizen Profile • Municipal Grievance Tracking & Verification Portal
          </p>
        </div>

        <div className="flex items-center gap-3 self-start lg:self-center flex-wrap">
          <button
            onClick={() => setShowVoice(!showVoice)}
            className="px-4 py-2.5 bg-[#e5eeff] hover:bg-[#dce9ff] text-[#0037b0] font-semibold text-xs rounded border border-[#d9cdba] transition-all flex items-center gap-2 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">mic</span>
            <span>{showVoice ? "Hide Voice Assistant" : "Voice Grievance"}</span>
          </button>
          <button
            onClick={onNewGrievance}
            className="px-5 py-2.5 bg-[#f77f00] hover:bg-[#d96e00] text-white font-semibold text-xs rounded shadow-sm hover:shadow transition-all flex items-center gap-2 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            <span>Report New Grievance</span>
          </button>
          <button
            onClick={onRefresh}
            className="p-2.5 bg-white hover:bg-[#eff4ff] text-[#434655] rounded border border-[#d9cdba] transition-colors"
            title="Refresh cases"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
          </button>
        </div>
      </section>

      {/* Voice Assistant Collapsible Bar */}
      {showVoice && policy && (
        <div className="rounded-xl border border-[#d9cdba] bg-white p-4 shadow-sm">
          <VoiceAccess token={token} policy={policy} saved={onOpenCase} />
        </div>
      )}

      {/* Metric Summary Bento Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Urgent Citizen Action */}
        <div className="relative bg-white p-5 rounded-xl border border-[#d9cdba] shadow-sm flex flex-col justify-between overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#ba1a1a]"></div>
          <div>
            <div className="flex items-start justify-between mb-3">
              <div>
                <span className="text-[11px] text-[#ba1a1a] uppercase font-bold tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#ba1a1a] animate-ping"></span>
                  Action Required
                </span>
                <span className="text-sm font-semibold text-[#0b1c30] block mt-0.5">
                  Awaiting Your Verification
                </span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[20px]">assignment_turned_in</span>
              </div>
            </div>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-3xl font-bold text-[#0b1c30]">
                {String(awaitingVerification.length).padStart(2, "0")}
              </span>
              <span className="text-xs text-[#434655]">Case(s) awaiting your review</span>
            </div>
          </div>
          <div className="bg-[#ffdad6]/60 p-2.5 rounded flex items-center justify-between text-xs font-medium text-[#93000a]">
            <span>Confirm or dispute resolution</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </div>
        </div>

        {/* Card 2: Active Dispatch */}
        <div className="relative bg-white p-5 rounded-xl border border-[#d9cdba] shadow-sm flex flex-col justify-between overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#f77f00]"></div>
          <div>
            <div className="flex items-start justify-between mb-3">
              <div>
                <span className="text-[11px] text-[#434655] uppercase font-bold tracking-wider">
                  Active Dispatch
                </span>
                <span className="text-sm font-semibold text-[#0b1c30] block mt-0.5">
                  In Progress & Assigned
                </span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-[#ffdcc6] text-[#954a00] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[20px]">hourglass_top</span>
              </div>
            </div>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-3xl font-bold text-[#0b1c30]">
                {String(inProgressCases.length).padStart(2, "0")}
              </span>
              <span className="text-xs text-[#434655]">Active municipal work orders</span>
            </div>
          </div>
          <div className="bg-[#eff4ff] p-2.5 rounded flex items-center justify-between text-xs text-[#434655]">
            <div className="flex items-center gap-1 font-mono text-[11px]">
              <span className="material-symbols-outlined text-[14px] text-[#f77f00]">schedule</span>
              <span>Under municipal SLA</span>
            </div>
            <span className="font-semibold text-[#0037b0]">Active</span>
          </div>
        </div>

        {/* Card 3: Closed Cases */}
        <div className="relative bg-white p-5 rounded-xl border border-[#d9cdba] shadow-sm flex flex-col justify-between overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#dce9ff]"></div>
          <div>
            <div className="flex items-start justify-between mb-3">
              <div>
                <span className="text-[11px] text-[#434655] uppercase font-bold tracking-wider">
                  Historical Archive
                </span>
                <span className="text-sm font-semibold text-[#0b1c30] block mt-0.5">
                  Completed & Closed
                </span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-[#e5eeff] text-[#434655] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[20px]">verified</span>
              </div>
            </div>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-3xl font-bold text-[#0b1c30]">
                {String(closedCases.length).padStart(2, "0")}
              </span>
              <span className="text-xs text-[#434655]">Resolved grievances</span>
            </div>
          </div>
          <div className="bg-[#eff4ff] p-2.5 rounded flex items-center justify-between text-xs text-[#434655]">
            <span>100% verified resolution track</span>
            <span className="font-mono text-[11px]">ARCHIVED</span>
          </div>
        </div>
      </section>

      {/* Immediate Action Required Highlight Card */}
      {urgentCase && (
        <section className="bg-white rounded-xl border border-[#d9cdba] shadow-sm p-6 overflow-hidden">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#d9cdba]/50">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ba1a1a] animate-pulse"></span>
              <h2 className="text-base font-bold text-[#0b1c30]">Immediate Action Required</h2>
              <span className="px-2 py-0.5 rounded bg-[#ffdad6] text-[#ba1a1a] text-[10px] font-bold uppercase">
                1 Case Awaiting Citizen Verification
              </span>
            </div>
            <span className="text-xs text-[#434655] font-mono">
              Auto-closes after review window if unanswered
            </span>
          </div>

          <div className="flex flex-col lg:flex-row gap-6 items-start">
            <div className="w-full lg:w-64 bg-[#eff4ff] p-4 rounded-lg border border-[#d9cdba]/60 flex flex-col items-center justify-center text-center shrink-0">
              <div className="w-12 h-12 rounded-full bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center mb-2">
                <span className="material-symbols-outlined text-[24px]">task_alt</span>
              </div>
              <span className="font-semibold text-xs text-[#0b1c30]">Resolution Submitted</span>
              <p className="text-[11px] text-[#434655] mt-1">
                Field team marked this work complete and supplied resolution evidence.
              </p>
              <button
                onClick={() => onOpenCase(urgentCase)}
                className="mt-3 w-full py-1.5 bg-white hover:bg-[#dce9ff] text-xs font-semibold rounded border border-[#d9cdba] transition-colors"
              >
                Inspect Full Evidence
              </button>
            </div>

            <div className="flex-1 flex flex-col justify-between w-full">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="font-mono text-xs font-semibold bg-[#e5eeff] text-[#0037b0] px-2 py-0.5 rounded">
                    Case {urgentCase.id.slice(0, 8)}…
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#e5eeff] text-[#0b1c30] text-xs font-medium">
                    {human(urgentCase.category)}
                  </span>
                  <StatusBadge state={urgentCase.workflow_state} />
                </div>
                <h3 className="text-lg font-bold text-[#0b1c30] tracking-tight mt-1">
                  {urgentCase.description}
                </h3>
                <p className="text-xs text-[#434655] mt-1">
                  Location: {urgentCase.location} • Ward {urgentCase.ward}
                </p>

                <div className="bg-[#eff4ff] p-3.5 rounded-lg mt-3 border border-[#d9cdba]/50">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0b1c30] mb-1">
                    <span className="material-symbols-outlined text-[16px] text-[#f77f00]">
                      verified_user
                    </span>
                    <span>Field Resolution Ready For Review</span>
                  </div>
                  <p className="text-xs text-[#434655] leading-relaxed">
                    Please inspect the work performed at this site. You have the right to either accept the resolution and close the case or dispute it to dispatch a supervised rework.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-4 mt-2">
                <button
                  onClick={() => onOpenCase(urgentCase)}
                  className="px-5 py-2.5 bg-[#f77f00] hover:bg-[#d96e00] text-white font-semibold text-xs rounded flex items-center gap-2 cursor-pointer shadow-sm transition-all"
                >
                  <span className="material-symbols-outlined text-[18px]">thumb_up</span>
                  <span>Review & Verify Resolution</span>
                </button>
                <button
                  onClick={() => onOpenCase(urgentCase)}
                  className="px-5 py-2.5 bg-[#e5eeff] hover:bg-[#dce9ff] text-[#0b1c30] font-semibold text-xs rounded flex items-center gap-2 cursor-pointer border border-[#d9cdba] transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">report_problem</span>
                  <span>Dispute / Report Incomplete</span>
                </button>
                <span className="text-xs text-[#434655] ml-auto hidden md:inline">
                  Your feedback audits municipal performance
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Active Grievances Table & Queue */}
      <section className="bg-white rounded-xl border border-[#d9cdba] shadow-sm overflow-hidden">
        <div className="p-5 border-b border-[#d9cdba]/50 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-base font-bold text-[#0b1c30]">My Registered Grievances</h2>
            <p className="text-xs text-[#434655]">
              Live civic dispatch tracker under GovFix Service Level Agreement
            </p>
          </div>
          <span className="text-xs font-semibold text-[#434655] bg-[#eff4ff] px-2.5 py-1 rounded border border-[#d9cdba]/60">
            {cases.length} Total
          </span>
        </div>

        {cases.length === 0 ? (
          <div className="p-12 text-center">
            <span className="material-symbols-outlined text-4xl text-[#565e74] mb-2">assignment_add</span>
            <h3 className="font-semibold text-sm text-[#0b1c30]">No grievances registered</h3>
            <p className="text-xs text-[#434655] mt-1 max-w-sm mx-auto">
              You haven't reported any municipal grievances yet. Click below to submit your first case.
            </p>
            <button
              onClick={onNewGrievance}
              className="mt-4 px-4 py-2 bg-[#f77f00] text-white text-xs font-semibold rounded hover:bg-[#d96e00]"
            >
              Report New Grievance
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#eff4ff]">
            {cases.map((item) => (
              <div
                key={item.id}
                className="p-5 hover:bg-[#f8f9ff] transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3 flex-1">
                  <div className="w-10 h-10 rounded-lg bg-[#e5eeff] flex items-center justify-center text-[#0037b0] shrink-0 mt-0.5">
                    <span className="material-symbols-outlined text-[20px]">
                      {item.category.includes("WATER")
                        ? "water_drop"
                        : item.category.includes("WASTE") || item.category.includes("SAN")
                          ? "delete_sweep"
                          : "engineering"}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-xs font-semibold text-[#0037b0] bg-[#e5eeff] px-2 py-0.5 rounded">
                        {item.id.slice(0, 8)}…
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[#eff4ff] text-[#0b1c30] text-[11px] font-medium">
                        {human(item.department)}
                      </span>
                      <StatusBadge state={item.workflow_state} />
                    </div>
                    <h4 className="text-sm font-semibold text-[#0b1c30]">
                      {item.description}
                    </h4>
                    <p className="text-xs text-[#434655] mt-0.5">
                      Location: {item.location} • Ward {item.ward}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 self-start lg:self-center shrink-0">
                  <div className="text-right">
                    <div className="text-[11px] text-[#434655]">Target Deadline</div>
                    <div
                      className={`font-mono text-xs font-semibold ${
                        item.sla_status === "OVERDUE" ? "text-[#ba1a1a]" : "text-[#0037b0]"
                      }`}
                    >
                      {date(item.current_deadline, item.timezone)}
                    </div>
                  </div>
                  <button
                    onClick={() => onOpenCase(item)}
                    className="px-4 py-2 bg-[#e5eeff] hover:bg-[#dce9ff] text-[#0b1c30] text-xs font-semibold rounded border border-[#d9cdba] transition-colors cursor-pointer"
                  >
                    View Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Citizen SLA Guarantee Footer Notice */}
      <section className="bg-[#eff4ff] rounded-xl p-5 border border-[#d9cdba]/70">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#dce9ff] text-[#0037b0] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">policy</span>
            </div>
            <div>
              <span className="text-xs text-[#0037b0] uppercase font-bold tracking-wider">
                GovFix Citizen SLA Guarantee & Oversight Charter
              </span>
              <p className="text-xs text-[#0b1c30] mt-0.5 max-w-2xl leading-relaxed">
                Every grievance has an assigned municipal department, a deterministic SLA deadline in Asia/Kolkata timezone, and a verifiable resolution audit trail. You hold the final sign-off.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-[#434655] bg-white px-3 py-1.5 rounded border border-[#d9cdba]">
            <span className="material-symbols-outlined text-[16px] text-[#f77f00]">verified</span>
            <span>PUBLIC GUARANTEE ACTIVE</span>
          </div>
        </div>
      </section>
    </div>
  );
}
