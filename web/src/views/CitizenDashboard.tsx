import { useState } from "react";
import type { Case, Policy, User } from "../api";
import { date, human } from "../api";
import { StatusBadge } from "../ui";
import { VoiceAccess } from "../voice";

type ReportFilter = "all" | "review" | "open" | "closed" | "rejected";

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
  const [filter, setFilter] = useState<ReportFilter>("all");
  const awaitingReview = cases.filter(
    (c) => c.workflow_state === "CITIZEN_VERIFICATION",
  );
  const open = cases.filter(
    (c) =>
      !["CLOSED", "REJECTED", "CITIZEN_VERIFICATION"].includes(
        c.workflow_state,
      ),
  );
  const closed = cases.filter((c) => c.workflow_state === "CLOSED");
  const rejected = cases.filter((c) => c.workflow_state === "REJECTED");
  const groups = { all: cases, review: awaitingReview, open, closed, rejected };
  const filters: {
    id: ReportFilter;
    label: string;
    detail: string;
    count: number;
  }[] = [
    {
      id: "review",
      label: "Awaiting your review",
      detail: "Check the resolution and photos",
      count: awaitingReview.length,
    },
    {
      id: "open",
      label: "Open reports",
      detail: "Awaiting review or being worked on",
      count: open.length,
    },
    {
      id: "closed",
      label: "Resolved reports",
      detail: "Resolutions you accepted",
      count: closed.length,
    },
    {
      id: "rejected",
      label: "Rejected reports",
      detail: "Reports declined during intake",
      count: rejected.length,
    },
  ];
  const voiceLanguages = user.voice_languages || [];

  return (
    <div className="flex w-full flex-col gap-6">
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0b1c30] lg:text-3xl">
            Welcome back, {user.display_name}
          </h1>
          <p className="mt-1 text-sm text-[#434655]">
            Report a local issue, track your reports, and review completed work.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {voiceLanguages.length > 0 && policy && (
            <button
              onClick={() => setShowVoice(!showVoice)}
              aria-expanded={showVoice}
              className="rounded border border-[#d9cdba] bg-[#e5eeff] px-4 py-2.5 text-xs font-semibold text-[#0037b0] hover:bg-[#dce9ff]"
            >
              {showVoice ? "Hide Voice Assistant" : "Voice Grievance"}
            </button>
          )}
          <button
            onClick={onNewGrievance}
            disabled={!policy}
            className="rounded bg-[#f77f00] px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#d96e00] disabled:opacity-50"
          >
            Report New Grievance
          </button>
          <button
            onClick={onRefresh}
            aria-label="Refresh my reports"
            className="rounded border border-[#d9cdba] bg-white p-2.5 text-[#434655] hover:bg-[#eff4ff]"
          >
            <span
              className="material-symbols-outlined text-[18px]"
              aria-hidden="true"
            >
              refresh
            </span>
          </button>
        </div>
      </section>

      {showVoice && policy && voiceLanguages.length > 0 && (
        <VoiceAccess
          token={token}
          policy={policy}
          languages={voiceLanguages}
          saved={onOpenCase}
        />
      )}

      <section
        aria-label="Filter my reports"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {filters.map(({ id, label, detail, count }) => (
          <button
            key={id}
            onClick={() => setFilter(filter === id ? "all" : id)}
            aria-pressed={filter === id}
            className={`rounded-xl border bg-white p-5 text-left shadow-sm hover:bg-[#f8f9ff] ${filter === id ? "border-[#0037b0] ring-1 ring-[#0037b0]" : "border-[#d9cdba]"}`}
          >
            <span className="block text-sm font-semibold text-[#0b1c30]">
              {label}
            </span>
            <span className="my-2 block text-3xl font-bold text-[#0b1c30]">
              {count}
            </span>
            <span className="block text-xs text-[#434655]">{detail}</span>
          </button>
        ))}
      </section>

      {awaitingReview.length > 0 && (
        <section className="rounded-xl border border-[#d9cdba] bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-[#0b1c30]">
            Review completed work
          </h2>
          <p className="mt-1 text-xs text-[#434655]">
            Review the resolution and photos. Accept if the issue is fixed, or
            dispute it if more work is needed.
          </p>
          <ul className="mt-4 divide-y divide-[#d9cdba]/50">
            {awaitingReview.map((item) => (
              <li
                key={item.id}
                className="flex flex-col justify-between gap-3 py-3 sm:flex-row sm:items-center"
              >
                <div>
                  <h3 className="text-sm font-semibold text-[#0b1c30]">
                    {item.description}
                  </h3>
                  <p className="mt-1 text-xs text-[#434655]">{item.location}</p>
                  {item.verification_due_at && (
                    <p className="mt-1 text-xs text-[#434655]">
                      Please respond by{" "}
                      {date(item.verification_due_at, item.timezone)}.
                    </p>
                  )}
                </div>
                <button
                  aria-label={`Review resolution for ${item.description}`}
                  onClick={() => onOpenCase(item)}
                  className="shrink-0 self-start rounded bg-[#f77f00] px-4 py-2 text-xs font-semibold text-white hover:bg-[#d96e00]"
                >
                  Review resolution
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-[#d9cdba] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d9cdba]/50 p-5">
          <div>
            <h2 className="text-base font-bold text-[#0b1c30]">
              My Registered Grievances
            </h2>
            <p className="mt-1 text-xs text-[#434655]">
              {filter === "all"
                ? "All your reports"
                : filters.find((entry) => entry.id === filter)?.label}{" "}
              · {groups[filter].length} reports
            </p>
          </div>
          {filter !== "all" && (
            <button
              onClick={() => setFilter("all")}
              className="rounded border border-[#d9cdba] px-3 py-2 text-xs font-semibold text-[#0037b0]"
            >
              Show all reports
            </button>
          )}
        </div>
        {groups[filter].length === 0 ? (
          <div className="p-10 text-center">
            <h3 className="text-sm font-semibold text-[#0b1c30]">
              {cases.length === 0
                ? "No grievances registered"
                : "No reports in this category"}
            </h3>
            <p className="mt-2 text-xs text-[#434655]">
              {cases.length === 0
                ? "Use Report New Grievance to submit your first issue."
                : "Choose another category to see your reports."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#eff4ff]">
            {groups[filter].map((item) => (
              <div
                key={item.id}
                className="flex flex-col justify-between gap-4 p-5 hover:bg-[#f8f9ff] lg:flex-row lg:items-center"
              >
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-[#0037b0]">
                      {item.id}
                    </span>
                    <StatusBadge state={item.workflow_state} />
                    {item.latitude !== null && item.longitude !== null && (
                      <span className="inline-flex items-center gap-1 rounded bg-[#eff4ff] px-2 py-0.5 text-[11px] font-medium text-[#0037b0]">
                        <span className="material-symbols-outlined text-[13px]">
                          near_me
                        </span>
                        GPS
                      </span>
                    )}
                    {typeof window !== "undefined" &&
                      localStorage.getItem(`govfix_photo_${item.id}`) && (
                        <span className="inline-flex items-center gap-1 rounded bg-[#eff4ff] px-2 py-0.5 text-[11px] font-medium text-[#0037b0]">
                          <span className="material-symbols-outlined text-[13px]">
                            photo_camera
                          </span>
                          Photo
                        </span>
                      )}
                  </div>
                  <h3 className="text-sm font-semibold text-[#0b1c30]">
                    {item.description}
                  </h3>
                  <p className="mt-1 text-xs text-[#434655]">
                    {item.location} · {human(item.department)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  {!["CLOSED", "REJECTED"].includes(item.workflow_state) && (
                    <div className="text-xs text-[#434655]">
                      <span className="block">Target resolution date</span>
                      <span
                        className={
                          item.sla_status === "OVERDUE"
                            ? "font-semibold text-[#ba1a1a]"
                            : "font-semibold text-[#0037b0]"
                        }
                      >
                        {date(item.current_deadline, item.timezone)}
                      </span>
                    </div>
                  )}
                  <button
                    aria-label={`View case ${item.description}`}
                    onClick={() => onOpenCase(item)}
                    className="rounded border border-[#d9cdba] bg-[#e5eeff] px-4 py-2 text-xs font-semibold text-[#0b1c30] hover:bg-[#dce9ff]"
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
