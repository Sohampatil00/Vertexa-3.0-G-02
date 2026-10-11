import { useEffect, useState, type ReactNode } from "react";
import { api, ApiError, date, human, type Policy, type User } from "./api";
import { cn, secondary, ErrorText, Field } from "./ui";

export type Dashboard = "citizen" | "officer" | "operations" | "auditor";
export type Summary = {
  total: number;
  overdue: number;
  states: Record<string, number>;
  verification_waiting: number;
};
export type Queue = {
  id: string;
  label: string;
  state?: string;
  overdue?: boolean;
  waiting?: boolean;
};

export const dashboards: Record<
  Dashboard,
  { title: string; description: string; help: string }
> = {
  citizen: {
    title: "Citizen dashboard",
    description:
      "Your reports, progress and resolution decisions in one place.",
    help: "Review submitted resolutions before accepting or disputing them. Your confirmation decides whether a case can close.",
  },
  officer: {
    title: "Officer dashboard",
    description: "Your assignments, field work and evidence of completion.",
    help: "Accept an assignment, complete the work, then upload evidence and submit your resolution. Only the current owner can act.",
  },
  operations: {
    title: "Supervisor / Operations dashboard",
    description:
      "Route work, monitor deadlines and manage cases that need attention.",
    help: "Select a queue to review cases in your assigned wards. Available actions follow your intake, dispatch or supervisory grants.",
  },
  auditor: {
    title: "Auditor dashboard",
    description:
      "Inspect case history, ownership and the policy behind each decision.",
    help: "This dashboard is read-only. Open a case to inspect its timeline, ownership history, evidence and delivery diagnostics.",
  },
};

export function availableDashboards(user: User): Dashboard[] {
  const roles = new Set(user.roles.map((grant) => grant.role));
  return (
    ["citizen", "officer", "operations", "auditor"] as Dashboard[]
  ).filter((view) => {
    if (view === "citizen") return roles.has("CITIZEN");
    if (view === "officer") return roles.has("OFFICER");
    if (view === "auditor") return roles.has("AUDITOR");
    return ["INTAKE_OFFICER", "DISPATCHER", "SUPERVISOR", "WARD_HEAD"].some(
      (role) => roles.has(role),
    );
  });
}

export function dashboardQueues(view: Dashboard, user: User): Queue[] {
  const queues: Queue[] = [{ id: "overview", label: "Overview" }];
  const has = (role: string) => user.roles.some((grant) => grant.role === role);
  if (view === "citizen")
    queues.push(
      { id: "cases", label: "My grievances" },
      {
        id: "verify",
        label: "Review resolutions",
        state: "CITIZEN_VERIFICATION",
      },
      { id: "closed", label: "Closed grievances", state: "CLOSED" },
    );
  if (view === "officer")
    queues.push(
      { id: "cases", label: "My work" },
      { id: "assigned", label: "Accept assignments", state: "ASSIGNED" },
      { id: "progress", label: "Work in progress", state: "IN_PROGRESS" },
      { id: "overdue", label: "Overdue assignments", overdue: true },
      {
        id: "verify",
        label: "Awaiting citizen response",
        state: "CITIZEN_VERIFICATION",
      },
    );
  if (view === "operations") {
    queues.push({ id: "cases", label: "All scoped cases" });
    if (has("INTAKE_OFFICER") || has("SUPERVISOR"))
      queues.push({
        id: "validation",
        label: "Validation queue",
        state: "SUBMITTED",
      });
    if (has("DISPATCHER") || has("SUPERVISOR"))
      queues.push({
        id: "assignment",
        label: "Assignment queue",
        state: "VALIDATED",
      });
    queues.push({ id: "overdue", label: "Overdue cases", overdue: true });
    if (has("SUPERVISOR") || has("WARD_HEAD"))
      queues.push(
        { id: "disputes", label: "Dispute review", state: "SUPERVISOR_REVIEW" },
        { id: "waiting", label: "Unanswered verification", waiting: true },
      );
  }
  if (view === "auditor")
    queues.push(
      { id: "cases", label: "Case audit register" },
      { id: "overdue", label: "SLA exceptions", overdue: true },
      { id: "closed", label: "Closed case audits", state: "CLOSED" },
      { id: "policy", label: "Policy reference" },
      { id: "system", label: "System readiness" },
    );
  return queues;
}

export function summaryCards(
  view: Dashboard,
  summary: Summary,
): [string, number][] {
  const count = (state: string) => summary.states[state] || 0;
  if (view === "citizen")
    return [
      ["My grievances", summary.total],
      ["Open grievances", summary.total - count("CLOSED") - count("REJECTED")],
      ["Ready for my review", count("CITIZEN_VERIFICATION")],
      ["Closed grievances", count("CLOSED")],
    ];
  if (view === "officer")
    return [
      ["Cases in work view", summary.total],
      ["Awaiting acceptance", count("ASSIGNED")],
      ["Work in progress", count("IN_PROGRESS")],
      ["Overdue assignments", summary.overdue],
    ];
  if (view === "operations")
    return [
      ["Awaiting validation", count("SUBMITTED")],
      ["Awaiting assignment", count("VALIDATED")],
      ["Overdue cases", summary.overdue],
      ["Disputes for review", count("SUPERVISOR_REVIEW")],
      ["Unanswered verification", summary.verification_waiting],
    ];
  return [
    ["Cases in audit scope", summary.total],
    ["Closed cases", count("CLOSED")],
    ["Rejected cases", count("REJECTED")],
    ["Current SLA exceptions", summary.overdue],
  ];
}

export function DashboardShell({
  view,
  user,
  active,
  choose,
  changeDashboard,
  children,
}: {
  view: Dashboard;
  user: User;
  active: string;
  choose: (queue: Queue) => void;
  changeDashboard: (view: Dashboard) => void;
  children: ReactNode;
}) {
  const available = availableDashboards(user);
  const wards = [
    ...new Set(user.roles.map((grant) => grant.ward).filter(Boolean)),
  ];
  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-5 py-8 lg:grid-cols-[16rem_1fr]">
      <aside className="self-start rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold text-blue-700">
          {view === "auditor" ? "READ-ONLY OVERSIGHT" : "YOUR WORKSPACE"}
        </p>
        <h2 className="mt-2 text-lg font-semibold">{dashboards[view].title}</h2>
        <p className="mt-2 text-xs text-slate-500">
          {view === "citizen"
            ? "Your own grievances"
            : `Scope: ${wards.join(", ") || "Assigned role scope"}`}
        </p>
        {available.length > 1 && (
          <div className="mt-4">
            <Field label="Switch dashboard">
              <select
                value={view}
                onChange={(event) =>
                  changeDashboard(event.target.value as Dashboard)
                }
              >
                {available.map((key) => (
                  <option key={key} value={key}>
                    {dashboards[key].title}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <nav
          aria-label={`${dashboards[view].title} navigation`}
          className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-1"
        >
          {dashboardQueues(view, user).map((queue) => (
            <button
              key={queue.id}
              aria-current={active === queue.id ? "page" : undefined}
              onClick={() => choose(queue)}
              className={cn(
                "rounded-lg px-3 py-3 text-left text-sm font-medium",
                active === queue.id
                  ? "bg-blue-50 text-blue-800"
                  : "text-slate-600 hover:bg-slate-50",
              )}
            >
              {queue.label}
            </button>
          ))}
        </nav>
        <p className="mt-5 border-t border-slate-200 pt-4 text-xs text-slate-500">
          Permissions are checked by the server on every action.
        </p>
      </aside>
      <div className="min-w-0 space-y-6">{children}</div>
    </main>
  );
}

export function PolicyReference({ policy }: { policy: Policy }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold">Policy reference</h2>
      <p className="mt-2 text-sm text-slate-600">
        {policy.municipality} · {policy.version} · {policy.timezone}
      </p>
      <p className="mt-3 text-sm text-slate-600">
        Read-only intake policy. Existing cases retain the policy version
        recorded in their case details.
      </p>
      <dl className="mt-5 space-y-4 text-sm">
        <div>
          <dt className="font-semibold">Configured wards</dt>
          <dd className="mt-1">{policy.wards.join(", ")}</dd>
        </div>
        <div>
          <dt className="font-semibold">Categories and evidence rules</dt>
          <dd className="mt-2 space-y-2">
            {policy.categories.map((category) => (
              <p key={category.code}>
                {human(category.code)} · {human(category.department)} ·{" "}
                {category.resolution_evidence.map(human).join(", ") ||
                  "No required evidence"}
              </p>
            ))}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Rejection reason codes</dt>
          <dd className="mt-1">
            {policy.rejection_reason_codes.map(human).join(", ")}
          </dd>
        </div>
      </dl>
    </section>
  );
}

type Status = {
  status: string;
  readiness: { status: string; checks: Record<string, boolean> };
  alerts: string[];
  worker: { recent_success: boolean; last_success_at: string | null } | null;
  notifications: Record<string, number> | null;
};
export function SystemReadiness({
  token,
  expired,
}: {
  token: string;
  expired: () => void;
}) {
  const [result, setResult] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    api<Status>(token, "/operations/status", { role: "AUDITOR" })
      .then((value) => {
        if (live) setResult(value);
      })
      .catch((err) => {
        if (live) {
          if (err instanceof ApiError && err.status === 401) expired();
          else setError(err.message);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [token, revision]);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">System readiness</h2>
        <button
          className={secondary}
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          Refresh system status
        </button>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Infrastructure status is shared across the deployment; case audit queues
        remain scoped to your grants.
      </p>
      <ErrorText message={error} />
      {loading ? (
        <p role="status" className="mt-4">
          Checking system status…
        </p>
      ) : (
        result && (
          <div className="mt-5 space-y-4">
            <p className="font-semibold capitalize">
              Deployment: {human(result.status)}
            </p>
            <dl className="grid grid-cols-2 gap-3">
              {Object.entries(result.readiness.checks).map(([key, ready]) => (
                <div key={key} className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-sm capitalize">{human(key)}</dt>
                  <dd className="mt-1 text-sm font-medium">
                    {ready ? "Passing" : "Needs attention"}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-sm">
              Worker:{" "}
              {result.worker?.recent_success
                ? "Recent successful cycle"
                : "No recent successful cycle"}
              {result.worker?.last_success_at
                ? ` · ${date(result.worker.last_success_at)}`
                : ""}
            </p>
            {result.notifications && (
              <p className="text-sm tabular-nums">
                Delivery backlog: {result.notifications.PENDING} pending ·{" "}
                {result.notifications.RETRY} retrying ·{" "}
                {result.notifications.FAILED} failed
              </p>
            )}
            {result.alerts.length > 0 && (
              <ul className="list-inside list-disc text-sm text-amber-800">
                {result.alerts.map((alert) => (
                  <li key={alert}>{human(alert)}</li>
                ))}
              </ul>
            )}
          </div>
        )
      )}
    </section>
  );
}
