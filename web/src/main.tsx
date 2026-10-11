import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { cn, button, secondary, ErrorText, Field } from "./ui";
import { Inbox, SlaPanel } from "./sla";
import {
  api,
  ApiError,
  command,
  date,
  human,
  type Case,
  type Evidence,
  type Event,
  type Operations,
  type Policy,
  type Resolution,
  type User,
} from "./api";
import { VoiceAccess } from "./voice";
import {
  availableDashboards,
  dashboards,
  dashboardQueues,
  DashboardShell,
  PolicyReference,
  SystemReadiness,
  summaryCards,
  type Dashboard,
  type Queue,
  type Summary,
} from "./dashboards";
import "./style.css";
function App() {
  const [token, setToken] = useState(""); // Sessions stay in memory and disappear when the tab closes/reloads.
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const auth = await api<{ access_token: string }>("", "/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: data.get("username"),
          password: data.get("password"),
        }),
      });
      const me = await api<User>(auth.access_token, "/me");
      setToken(auth.access_token);
      setUser(me);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await api(token, "/auth/logout", { method: "POST" });
      setToken("");
      setUser(null);
      setError("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) expired();
      else setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function expired() {
    setToken("");
    setUser(null);
    setError("Your session expired. Sign in again.");
  }
  return (
    <div className="min-h-dvh">
      <div className="bg-slate-900 px-5 py-2 text-center text-xs text-slate-200">
        Demonstration · Fictional Demo Municipality · Rules require municipal
        approval
      </div>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div>
            <span className="text-xl font-semibold">
              GovFix<span className="text-blue-700">.</span>
            </span>
            <p className="text-sm text-slate-500">
              Municipal grievance operations
            </p>
          </div>
          {user && (
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium">{user.display_name}</p>
                <p className="text-xs text-slate-500">
                  {[...new Set(user.roles.map((r) => human(r.role)))].join(
                    " · ",
                  )}
                </p>
              </div>
              <button className={secondary} disabled={busy} onClick={logout}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>
      {user && error && (
        <div className="mx-auto max-w-7xl px-5 pt-4">
          <ErrorText message={error} />
        </div>
      )}
      {!user ? (
        <main className="mx-auto max-w-md px-5 py-16">
          <p className="mb-3 text-sm font-semibold text-blue-700">
            STAFF & CITIZEN ACCESS
          </p>
          <h1 className="text-3xl font-semibold">
            Every case has a next step.
          </h1>
          <p className="mb-8 mt-3 text-slate-600">
            Sign in to submit a grievance or manage your ward’s work.
          </p>
          <form
            onSubmit={login}
            className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <Field label="Username">
              <input
                name="username"
                autoComplete="username"
                required
                maxLength={100}
              />
            </Field>
            <Field label="Password">
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </Field>
            <ErrorText message={error} />
            <button disabled={busy} className={cn(button, "w-full")}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <p className="text-xs text-slate-500">
              Use an account provisioned by your demo administrator.
            </p>
          </form>
        </main>
      ) : (
        <Workspace token={token} user={user} expired={expired} />
      )}
    </div>
  );
}
function Workspace({
  token,
  user,
  expired,
}: {
  token: string;
  user: User;
  expired: () => void;
}) {
  const available = availableDashboards(user);
  const [dashboard, setDashboard] = useState<Dashboard>(
    available[0] || "citizen",
  );
  if (!available.length)
    return (
      <main className="mx-auto max-w-7xl px-5 py-8">
        <ErrorText message="This account has no dashboard role. Contact your administrator." />
      </main>
    );
  return (
    <DashboardWorkspace
      key={dashboard}
      token={token}
      user={user}
      expired={expired}
      dashboard={dashboard}
      changeDashboard={(next) => {
        if (available.includes(next)) setDashboard(next);
      }}
    />
  );
}
function DashboardWorkspace({
  token,
  user,
  expired,
  dashboard,
  changeDashboard,
}: {
  token: string;
  user: User;
  expired: () => void;
  dashboard: Dashboard;
  changeDashboard: (view: Dashboard) => void;
}) {
  const officer = dashboard === "officer";
  const citizen = dashboard === "citizen";
  const supervisor = dashboard === "operations" || dashboard === "auditor";
  const [activeQueue, setActiveQueue] = useState("overview");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [items, setItems] = useState<Case[]>([]);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selected, setSelected] = useState<Case | null>(null);
  const [intake, setIntake] = useState(false);
  const [state, setState] = useState("");
  const [owned, setOwned] = useState(officer);
  const [waitingOnly, setWaitingOnly] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    api<{ cases: Case[] }>(
      token,
      `/cases?limit=20&offset=${offset}&owned=${owned}&state=${state}&verification_waiting=${waitingOnly}&overdue=${overdueOnly}&mine=${citizen}`,
    )
      .then((list) => {
        if (live) setItems(list.cases);
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
  }, [
    token,
    state,
    owned,
    waitingOnly,
    overdueOnly,
    citizen,
    offset,
    revision,
  ]);
  useEffect(() => {
    let live = true;
    setSummary(null);
    Promise.all([
      api<{ policy: Policy }>(token, "/intake-options"),
      api<Summary>(token, `/operations/summary?owned=${owned}&mine=${citizen}`),
    ])
      .then(([options, totals]) => {
        if (live) {
          setPolicy(options.policy);
          setSummary(totals);
        }
      })
      .catch((err) => {
        if (live) {
          if (err instanceof ApiError && err.status === 401) expired();
          else setError(err.message);
        }
      });
    return () => {
      live = false;
    };
  }, [token, owned, citizen, revision]);
  function refreshed(item: Case) {
    setSelected(item);
    setIntake(false);
    setRevision((r) => r + 1);
  }
  function chooseQueue(queue: Queue) {
    setActiveQueue(queue.id);
    setState(queue.state || "");
    setOwned(officer);
    setWaitingOnly(Boolean(queue.waiting));
    setOverdueOnly(Boolean(queue.overdue));
    setOffset(0);
    setSelected(null);
    setIntake(false);
  }
  function customFilter() {
    setActiveQueue("custom");
    setOffset(0);
  }
  const queueTitle =
    activeQueue === "overview"
      ? citizen
        ? "Your recent grievances"
        : officer
          ? "Your current work"
          : dashboard === "auditor"
            ? "Recent cases for audit"
            : "Recent cases in scope"
      : dashboardQueues(dashboard, user).find(
          (queue) => queue.id === activeQueue,
        )?.label || "Filtered cases";
  return (
    <DashboardShell
      view={dashboard}
      user={user}
      active={activeQueue}
      choose={chooseQueue}
      changeDashboard={changeDashboard}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {dashboards[dashboard].title}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {dashboards[dashboard].description}
          </p>
        </div>
        {citizen && (
          <button
            onClick={() => {
              setIntake(true);
              setSelected(null);
            }}
            className={button}
          >
            New grievance
          </button>
        )}
      </div>
      <ErrorText message={error} />
      {summary && (
        <section
          aria-label="Case summary"
          className={cn(
            "grid grid-cols-2 gap-3",
            dashboard === "operations" ? "xl:grid-cols-5" : "md:grid-cols-4",
          )}
        >
          {summaryCards(dashboard, summary).map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg border border-slate-200 bg-white p-4"
            >
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {value}
              </p>
            </div>
          ))}
        </section>
      )}
      {!summary && !error && (
        <section
          aria-label="Loading dashboard summary"
          role="status"
          className="grid grid-cols-2 gap-3 md:grid-cols-4"
        >
          <span className="sr-only">Loading dashboard summary…</span>
          {[0, 1, 2, 3].map((key) => (
            <div
              key={key}
              aria-hidden="true"
              className="h-24 rounded-lg border border-slate-200 bg-slate-100"
            />
          ))}
        </section>
      )}
      {activeQueue === "overview" && !selected && !intake && (
        <section className="rounded-xl border border-blue-100 bg-blue-50 p-5">
          <h2 className="font-semibold text-blue-900">
            {dashboard === "auditor"
              ? "Audit without changing the record"
              : "Your next step"}
          </h2>
          <p className="mt-2 text-sm text-blue-900">
            {dashboards[dashboard].help}
          </p>
          {officer && (
            <p className="mt-2 text-xs text-blue-800">
              Summary counts follow the My assignments only filter.
            </p>
          )}
        </section>
      )}
      {citizen && policy && (
        <VoiceAccess token={token} policy={policy} saved={refreshed} />
      )}
      <Inbox
        token={token}
        revision={revision}
        openCase={async (id) => {
          try {
            const result = await api<{ case: Case }>(token, `/cases/${id}`);
            setSelected(result.case);
            setIntake(false);
            setActiveQueue("cases");
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      />
      {activeQueue === "policy" && policy ? (
        <PolicyReference policy={policy} />
      ) : activeQueue === "system" ? (
        <SystemReadiness token={token} expired={expired} />
      ) : intake && policy ? (
        <Intake
          token={token}
          policy={policy}
          saved={refreshed}
          cancel={() => setIntake(false)}
        />
      ) : selected ? (
        <Detail
          key={selected.id}
          token={token}
          item={selected}
          user={user}
          saved={refreshed}
          back={() => setSelected(null)}
          expired={expired}
          readOnly={dashboard === "auditor"}
        />
      ) : (
        <section
          aria-label="Dashboard task queue"
          className="rounded-xl border border-slate-200 bg-white"
        >
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-lg font-semibold">{queueTitle}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {dashboard === "auditor"
                ? "Read-only case inspection within your audit scope."
                : "Open a case to see its details and permitted next actions."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 p-4">
            <Field label="Workflow state">
              <select
                value={state}
                onChange={(e) => {
                  setState(e.target.value);
                  customFilter();
                }}
              >
                <option value="">All states</option>
                {[
                  "SUBMITTED",
                  "VALIDATED",
                  "ASSIGNED",
                  "IN_PROGRESS",
                  "CITIZEN_VERIFICATION",
                  "SUPERVISOR_REVIEW",
                  "CLOSED",
                  "REJECTED",
                ].map((s) => (
                  <option key={s} value={s}>
                    {human(s)}
                  </option>
                ))}
              </select>
            </Field>
            {officer && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={owned}
                  onChange={(e) => {
                    setOwned(e.target.checked);
                    customFilter();
                  }}
                />
                My assignments only
              </label>
            )}
            {supervisor && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={waitingOnly}
                  onChange={(e) => {
                    setWaitingOnly(e.target.checked);
                    customFilter();
                  }}
                />
                Verification needs review
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={overdueOnly}
                onChange={(event) => {
                  setOverdueOnly(event.target.checked);
                  customFilter();
                }}
              />
              Overdue only
            </label>
            <button
              className={cn(secondary, "ml-auto")}
              onClick={() => setRevision((r) => r + 1)}
            >
              Refresh
            </button>
          </div>
          {loading ? (
            <div role="status" className="space-y-4 p-6">
              <p>Loading cases…</p>
              <div className="h-16 rounded bg-slate-100" />
              <div className="h-16 rounded bg-slate-100" />
            </div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center">
              <h2 className="font-semibold">No cases in this view</h2>
              <p className="mt-2 text-sm text-slate-500">
                {waitingOnly
                  ? "No unanswered verification requests need review."
                  : citizen
                    ? "Submit a grievance to get started."
                    : "Refresh after a case is routed to your scope."}
              </p>
              <button
                className={cn(secondary, "mt-4")}
                onClick={() =>
                  waitingOnly
                    ? setWaitingOnly(false)
                    : citizen
                      ? setIntake(true)
                      : setRevision((r) => r + 1)
                }
              >
                {waitingOnly
                  ? "Show all cases"
                  : citizen
                    ? "New grievance"
                    : "Refresh"}
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelected(item)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 p-5 text-left hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-500">
                      {item.ward} · {human(item.department)}
                    </p>
                    <h2 className="mt-1 line-clamp-1 font-medium">
                      {item.description}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.location}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge state={item.workflow_state} />
                    <p
                      className={cn(
                        "mt-2 text-xs tabular-nums",
                        item.sla_status === "OVERDUE"
                          ? "text-red-700"
                          : "text-slate-500",
                      )}
                    >
                      Due {date(item.current_deadline, item.timezone)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between border-t border-slate-200 p-4 text-sm">
            <button
              className={secondary}
              disabled={offset === 0 || loading}
              onClick={() => setOffset((o) => Math.max(0, o - 20))}
            >
              Previous
            </button>
            <span className="tabular-nums">Page {offset / 20 + 1}</span>
            <button
              className={secondary}
              disabled={items.length < 20 || loading}
              onClick={() => setOffset((o) => o + 20)}
            >
              Next
            </button>
          </div>
        </section>
      )}
    </DashboardShell>
  );
}
function Badge({ state }: { state: string }) {
  return (
    <span className="inline-block rounded bg-slate-100 px-2 py-1 text-xs font-medium capitalize">
      {human(state)}
    </span>
  );
}
// Retry the exact command key and payload when a response is lost.
function useCommand(token: string, saved: (item: Case) => void) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const attempt = useRef<{ digest: string; key: string } | null>(null);
  async function run(item: Case | null, operation: string, body: unknown) {
    setBusy(true);
    setError("");
    const digest = JSON.stringify([item?.id, item?.version, operation, body]);
    if (attempt.current?.digest !== digest)
      attempt.current = { digest, key: crypto.randomUUID() };
    try {
      const result = await command(
        token,
        item,
        operation,
        body,
        attempt.current.key,
      );
      attempt.current = null;
      saved(result.case);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { run, busy, error };
}
function Intake({
  token,
  policy,
  saved,
  cancel,
}: {
  token: string;
  policy: Policy;
  saved: (item: Case) => void;
  cancel: () => void;
}) {
  const { run, busy, error } = useCommand(token, saved);
  return (
    <section className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-xl font-semibold">Submit a grievance</h2>
      <p className="mt-2 text-sm text-slate-500">
        Tell us what happened and where. Review your details before confirming.
      </p>
      <form
        className="mt-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          run(null, "submit", {
            description: data.get("description"),
            location: data.get("location"),
            category: data.get("category"),
            ward: data.get("ward"),
            confirmation: data.get("confirmation") === "on",
          });
        }}
      >
        <Field label="Description">
          <textarea
            name="description"
            rows={4}
            required
            minLength={10}
            maxLength={4000}
          />
        </Field>
        <Field label="Location">
          <input name="location" required minLength={3} maxLength={1000} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <select name="category">
              {policy.categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {human(c.code)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ward">
            <select name="ward">
              {policy.wards.map((w) => (
                <option key={w}>{w}</option>
              ))}
            </select>
          </Field>
        </div>
        <label className="flex items-start gap-2">
          <input
            name="confirmation"
            type="checkbox"
            required
            className="mt-1"
          />
          I confirm that these details accurately describe my grievance.
        </label>
        <ErrorText message={error} />
        <div className="flex gap-3">
          <button disabled={busy} className={button}>
            {busy ? "Submitting…" : "Confirm submission"}
          </button>
          <button
            type="button"
            className={secondary}
            onClick={cancel}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
function Detail({
  token,
  item,
  user,
  saved,
  back,
  expired,
  readOnly = false,
}: {
  token: string;
  item: Case;
  user: User;
  saved: (item: Case) => void;
  back: () => void;
  expired: () => void;
  readOnly?: boolean;
}) {
  const [current, setCurrent] = useState(item),
    [ops, setOps] = useState<Operations | null>(null),
    [events, setEvents] = useState<Event[]>([]),
    [evidence, setEvidence] = useState<Evidence[]>([]),
    [resolution, setResolution] = useState<Resolution | null>(null),
    [disputeStatement, setDisputeStatement] = useState<string | null>(null),
    [actions, setActions] = useState<string[]>([]);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const [action, setAction] = useState("");
  const cmd = useCommand(token, (next) => {
    setCurrent(next);
    setAction("");
    saved(next);
    setRevision((r) => r + 1);
  });
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    Promise.all([
      api<{ case: Case }>(token, `/cases/${item.id}`),
      api<Operations>(token, `/cases/${item.id}/operations`),
      api<{ events: Event[] }>(token, `/cases/${item.id}/timeline`),
      api<{ evidence: Evidence[] }>(token, `/cases/${item.id}/evidence`),
      api<{ resolution: Resolution | null; dispute_statement: string | null }>(
        token,
        `/cases/${item.id}/resolution`,
      ),
      api<{ actions: { operation: string }[] }>(
        token,
        `/cases/${item.id}/allowed-actions`,
      ),
    ])
      .then(([result, operations, timeline, files, submitted, allowed]) => {
        if (live) {
          setCurrent(result.case);
          setOps(operations);
          setEvents(timeline.events);
          setEvidence(files.evidence);
          setResolution(submitted.resolution);
          setDisputeStatement(submitted.dispute_statement);
          setActions([...new Set(allowed.actions.map((a) => a.operation))]);
        }
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
  }, [token, item.id, item.version, revision]);
  const available = actions.filter(
    (a) =>
      !readOnly &&
      [
        "validate",
        "reject",
        "assign",
        "accept-assignment",
        "resolution",
        "verification",
        "review",
        "deadline-extension",
      ].includes(a),
  );
  return (
    <div className="space-y-5">
      <div className="flex justify-between">
        <button className={secondary} onClick={back}>
          ← Back to cases
        </button>
        <button
          className={secondary}
          onClick={() => {
            setAction("");
            setRevision((r) => r + 1);
          }}
        >
          Refresh case
        </button>
      </div>
      <ErrorText message={error} />
      {loading ? (
        <div
          className="h-48 rounded-xl border border-slate-200 bg-white p-6"
          role="status"
        >
          Loading case details…
        </div>
      ) : (
        ops && (
          <div className="grid items-start gap-5 lg:grid-cols-3">
            <section className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 lg:col-span-2">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge state={current.workflow_state} />
                  <span className="text-xs text-slate-500 tabular-nums">
                    Version {current.version}
                  </span>
                </div>
                <h2 className="mt-4 text-xl font-semibold">
                  {current.description}
                </h2>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                  {current.location}
                </p>
                <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                  {[
                    ["Ward", current.ward],
                    ["Department", human(current.department)],
                    ["Current owner", ops.owner_name || "Awaiting assignment"],
                    [
                      "Deadline",
                      date(current.current_deadline, current.timezone),
                    ],
                  ].map(([title, value]) => (
                    <div key={title}>
                      <dt className="text-xs text-slate-500">{title}</dt>
                      <dd className="mt-1 font-medium tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 break-all text-xs text-slate-500">
                  Case {current.id} · Policy {current.policy_version}
                </p>
              </div>
              {resolution && (
                <section className="border-t border-slate-200 pt-5">
                  <h3 className="font-semibold text-balance">
                    Submitted resolution
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 tabular-nums">
                    Submitted {date(resolution.submitted_at, current.timezone)}
                  </p>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700 text-pretty">
                    {resolution.note}
                  </p>
                  <div className="mt-4 space-y-2">
                    {resolution.evidence_refs.map((id) => {
                      const file = evidence.find((item) => item.id === id);
                      return file ? (
                        <div
                          key={id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 p-3"
                        >
                          <span className="text-sm capitalize">
                            {human(file.kind)}
                          </span>
                          <Download
                            token={token}
                            caseId={current.id}
                            file={file}
                          />
                        </div>
                      ) : null;
                    })}
                  </div>
                </section>
              )}
              {disputeStatement && (
                <section className="rounded-md border border-amber-200 bg-amber-50 p-4">
                  <h3 className="font-semibold">Citizen dispute</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-pretty">
                    {disputeStatement}
                  </p>
                </section>
              )}
              {current.workflow_state === "CITIZEN_VERIFICATION" && (
                <p className="rounded-md bg-blue-50 p-4 text-sm text-blue-900 text-pretty">
                  The case remains open while the citizen reviews this
                  resolution.
                  {current.verification_due_at &&
                    ` Supervisor review is scheduled after ${date(current.verification_due_at, current.timezone)} if there is no response.`}
                  {current.verification_alerted_at &&
                    " A supervisor has been alerted to the wait."}
                </p>
              )}
              {available.length > 0 && (
                <div className="border-t border-slate-200 pt-5">
                  <h3 className="mb-3 font-semibold">Next action</h3>
                  <div className="flex flex-wrap gap-2">
                    {available.map((a) => (
                      <button
                        key={a}
                        className={action === a ? button : secondary}
                        onClick={() => setAction(a)}
                      >
                        {human(a)}
                      </button>
                    ))}
                  </div>
                  {action && (
                    <ActionForm
                      key={`${action}-${current.version}`}
                      action={action}
                      current={current}
                      ops={ops}
                      evidence={evidence}
                      busy={cmd.busy}
                      error={cmd.error}
                      run={(body) => cmd.run(current, action, body)}
                    />
                  )}
                </div>
              )}
              <SlaPanel
                token={token}
                item={current}
                revision={revision}
                canRetry={!readOnly && actions.includes("notification-retry")}
                retry={(body) => cmd.run(current, "notification-retry", body)}
                busy={cmd.busy}
                commandError={cmd.error}
              />
              {(!resolution || current.workflow_state === "IN_PROGRESS") && (
                <section className="border-t border-slate-200 pt-5">
                  <h3 className="font-semibold">Evidence uploads</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Private files · Access checked on every download
                  </p>
                  {evidence.length === 0 && (
                    <p className="mt-4 text-sm text-slate-500">
                      No completed uploads yet.
                    </p>
                  )}
                  <ul className="mt-4 space-y-3">
                    {evidence.map((file) => (
                      <li
                        key={file.id}
                        className="rounded-md border border-slate-200 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm capitalize">
                            {human(file.kind)} ·{" "}
                            {(file.size_bytes / 1024).toFixed(1)} KB
                          </span>
                          <Download
                            token={token}
                            caseId={current.id}
                            file={file}
                          />
                        </div>
                        <p className="mt-2 break-all font-mono text-xs text-slate-500">
                          SHA-256 {file.sha256}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {!readOnly &&
                    current.owner_id === user.id &&
                    current.workflow_state === "IN_PROGRESS" && (
                      <Upload
                        token={token}
                        item={current}
                        ops={ops}
                        done={() => setRevision((r) => r + 1)}
                      />
                    )}
                </section>
              )}
              {ops.assignments.length > 0 && (
                <section className="border-t border-slate-200 pt-5">
                  <h3 className="font-semibold">Ownership history</h3>
                  <ol className="mt-3 space-y-3">
                    {ops.assignments.map((assignment, i) => (
                      <li
                        key={i}
                        className="rounded-md bg-slate-50 p-3 text-sm"
                      >
                        <p className="font-medium">
                          {assignment.ended_at
                            ? "Previous assignment"
                            : "Current assignment"}
                        </p>
                        <p className="mt-1">{assignment.reason}</p>
                        <p className="mt-1 break-all text-xs text-slate-500">
                          Officer {assignment.officer_id} · Assigned by{" "}
                          {assignment.assigned_by}
                        </p>
                        <p className="mt-1 text-xs tabular-nums">
                          {date(assignment.started_at, current.timezone)} →{" "}
                          {assignment.ended_at
                            ? date(assignment.ended_at, current.timezone)
                            : "Active"}
                        </p>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </section>
            <aside className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="font-semibold">Case timeline</h3>
              <ol className="mt-5 space-y-5">
                {events.map((event) => (
                  <li
                    key={event.id}
                    className="border-l-2 border-slate-200 pl-4"
                  >
                    <p className="text-sm font-medium capitalize">
                      {human(event.operation)}{" "}
                      <span
                        className={cn(
                          "ml-1 text-xs",
                          event.result === "REFUSED"
                            ? "text-red-700"
                            : "text-slate-500",
                        )}
                      >
                        {human(event.result)}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500 tabular-nums">
                      {date(event.occurred_at, current.timezone)}
                    </p>
                    {event.actor_role && (
                      <p className="mt-1 text-xs text-slate-500 capitalize">
                        {human(event.actor_role)}
                      </p>
                    )}
                    {event.reason_code && (
                      <p className="mt-1 text-xs text-red-700">
                        {human(event.reason_code)}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </aside>
          </div>
        )
      )}
    </div>
  );
}
function ActionForm({
  action,
  current,
  ops,
  evidence,
  busy,
  error,
  run,
}: {
  action: string;
  current: Case;
  ops: Operations;
  evidence: Evidence[];
  busy: boolean;
  error: string;
  run: (body: unknown) => void;
}) {
  const [confirmationBody, setConfirmationBody] = useState<unknown>(null);
  const [outcome, setOutcome] = useState<"ACCEPT" | "DISPUTE">("ACCEPT");
  const [decision, setDecision] = useState<"RETAIN" | "REASSIGN">("RETAIN");
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    let body: unknown;
    if (action === "validate")
      body = {
        category: current.category,
        ward: current.ward,
        department: current.department,
        jurisdiction: ops.policy.municipality,
      };
    else if (action === "assign")
      body = {
        officer_id: data.get("officer"),
        department: current.department,
        reason: data.get("reason"),
      };
    else if (action === "reject")
      body = {
        reason_code: data.get("reason_code"),
        explanation: data.get("explanation"),
      };
    else if (action === "deadline-extension")
      body = {
        new_deadline: new Date(String(data.get("new_deadline"))).toISOString(),
        reason: data.get("reason"),
      };
    else if (action === "accept-assignment") body = { confirmation: true };
    else if (action === "verification")
      body = {
        outcome,
        confirmation: true,
        statement: outcome === "DISPUTE" ? data.get("statement") : null,
      };
    else if (action === "review")
      body = {
        decision,
        officer_id:
          decision === "RETAIN" ? current.owner_id : data.get("officer"),
        reason: data.get("reason"),
      };
    else
      body = { note: data.get("note"), evidence_refs: data.getAll("evidence") };
    if (
      ["reject", "deadline-extension"].includes(action) ||
      (action === "verification" && outcome === "ACCEPT")
    )
      setConfirmationBody(body);
    else run(body);
  }
  return (
    <form
      className="mt-5 space-y-4 rounded-lg bg-slate-50 p-4"
      onSubmit={submit}
    >
      {action === "deadline-extension" && (
        <>
          <p className="text-sm">
            Current deadline: {date(current.current_deadline, current.timezone)}{" "}
            ({current.timezone}).
          </p>
          <Field
            label={`New deadline (device timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone})`}
          >
            <input name="new_deadline" type="datetime-local" required />
          </Field>
          <Field label="Extension reason">
            <textarea name="reason" required maxLength={2000} />
          </Field>
        </>
      )}
      {action === "validate" && (
        <>
          <p className="text-sm">
            Validate this case for {ops.policy.municipality}, {current.ward},{" "}
            {human(current.category)} and {human(current.department)}.
          </p>
          <label className="flex items-start gap-2">
            <input type="checkbox" required className="mt-1" />I reviewed the
            jurisdiction, location, category and routing.
          </label>
        </>
      )}
      {action === "assign" && (
        <>
          <Field label="Responsible officer">
            <select name="officer" required defaultValue="">
              <option value="" disabled>
                Select an eligible officer
              </option>
              {ops.officers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          {ops.officers.length === 0 && (
            <p className="text-sm text-slate-500">
              An administrator must provision an officer for this ward and
              department.
            </p>
          )}
          <Field label="Assignment reason">
            <textarea name="reason" required maxLength={2000} />
          </Field>
        </>
      )}
      {action === "reject" && (
        <>
          <Field label="Rejection reason">
            <select name="reason_code">
              {ops.policy.rejection_reason_codes.map((r) => (
                <option key={r} value={r}>
                  {human(r)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Explanation">
            <textarea name="explanation" required maxLength={2000} />
          </Field>
        </>
      )}
      {action === "accept-assignment" && (
        <label className="flex items-start gap-2">
          <input type="checkbox" required className="mt-1" />I accept ownership
          of this assignment.
        </label>
      )}
      {action === "resolution" && (
        <>
          <Field label="Work completed">
            <textarea name="note" required maxLength={5000} rows={3} />
          </Field>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">
              Completed evidence
            </legend>
            {evidence.map((file) => (
              <label key={file.id} className="flex gap-2">
                <input type="checkbox" name="evidence" value={file.id} />{" "}
                {human(file.kind)} · {file.sha256.slice(0, 12)}
              </label>
            ))}
            {evidence.length === 0 && (
              <p className="text-sm text-slate-500">
                Upload the required photo before submitting a resolution.
              </p>
            )}
          </fieldset>
        </>
      )}
      {action === "verification" && (
        <>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              Your response to the submitted resolution
            </legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="outcome"
                checked={outcome === "ACCEPT"}
                onChange={() => setOutcome("ACCEPT")}
              />
              Accept the resolution and close the case
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="outcome"
                checked={outcome === "DISPUTE"}
                onChange={() => setOutcome("DISPUTE")}
              />
              Dispute the resolution and request supervised rework
            </label>
          </fieldset>
          {outcome === "DISPUTE" && (
            <Field label="What still needs to be fixed?">
              <textarea name="statement" required maxLength={2000} rows={3} />
            </Field>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" required className="mt-1" />I reviewed the
            resolution and confirm this response.
          </label>
        </>
      )}
      {action === "review" && (
        <>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Rework assignment</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="decision"
                checked={decision === "RETAIN"}
                onChange={() => setDecision("RETAIN")}
              />
              Retain current officer
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="decision"
                checked={decision === "REASSIGN"}
                onChange={() => setDecision("REASSIGN")}
              />
              Assign another officer
            </label>
          </fieldset>
          {decision === "REASSIGN" && (
            <Field label="Rework officer">
              <select name="officer" required defaultValue="">
                <option value="" disabled>
                  Select an eligible officer
                </option>
                {ops.officers
                  .filter((o) => o.id !== current.owner_id)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <Field label="Supervisor review reason">
            <textarea name="reason" required maxLength={2000} rows={3} />
          </Field>
        </>
      )}
      <ErrorText message={error} />
      <button
        disabled={
          busy ||
          (action === "resolution" && evidence.length === 0) ||
          (action === "assign" && ops.officers.length === 0) ||
          (action === "review" &&
            decision === "REASSIGN" &&
            ops.officers.filter((o) => o.id !== current.owner_id).length === 0)
        }
        className={button}
      >
        {busy
          ? "Saving…"
          : action === "resolution"
            ? "Submit resolution"
            : action === "verification"
              ? outcome === "ACCEPT"
                ? "Accept resolution"
                : "Submit dispute"
              : action === "review"
                ? "Send for rework"
                : `Confirm ${human(action)}`}
      </button>
      <AlertDialog.Root
        open={confirmationBody !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmationBody(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <AlertDialog.Content className="fixed inset-x-5 top-1/3 z-50 mx-auto max-w-md rounded-xl bg-white p-6 shadow-xl">
            <AlertDialog.Title className="text-lg font-semibold">
              {action === "reject"
                ? "Reject this grievance?"
                : action === "verification"
                  ? "Accept this resolution and close the case?"
                  : "Extend this deadline?"}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-slate-600">
              {action === "reject"
                ? "Rejection ends this case. The selected reason and explanation will be recorded in its audit history."
                : action === "verification"
                  ? "Your explicit acceptance closes the case. This action is recorded in the case history."
                  : "The new deadline and reason will be recorded and the citizen notified. Prior breaches and the original deadline remain in the case history."}
            </AlertDialog.Description>
            <div className="mt-5 flex justify-end gap-3">
              <AlertDialog.Cancel className={secondary}>
                {action === "reject"
                  ? "Keep case open"
                  : action === "verification"
                    ? "Keep reviewing"
                    : "Keep current deadline"}
              </AlertDialog.Cancel>
              <AlertDialog.Action
                className={button}
                onClick={() => {
                  run(confirmationBody);
                  setConfirmationBody(null);
                }}
              >
                {action === "reject"
                  ? "Confirm rejection"
                  : action === "verification"
                    ? "Accept and close case"
                    : "Confirm extension"}
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </form>
  );
}
function Upload({
  token,
  item,
  ops,
  done,
}: {
  token: string;
  item: Case;
  ops: Operations;
  done: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const attempt = useRef<{ digest: string; key: string } | null>(null);
  const kinds =
    ops.policy.categories.find((c) => c.code === item.category)
      ?.resolution_evidence || [];
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file") as File;
    setBusy(true);
    setError("");
    try {
      if (!file.size || file.size > ops.evidence_max_bytes)
        throw new Error(
          `Choose a photo under ${ops.evidence_max_bytes / 1024 / 1024} MB.`,
        );
      const bytes = await file.arrayBuffer();
      const checksum = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const kind = String(data.get("kind"));
      const digest = JSON.stringify([
        item.id,
        item.version,
        checksum,
        kind,
        file.type,
      ]);
      if (attempt.current?.digest !== digest)
        attempt.current = { digest, key: crypto.randomUUID() };
      await api(
        token,
        `/cases/${item.id}/evidence?kind=${encodeURIComponent(kind)}`,
        {
          method: "POST",
          body: file,
          headers: {
            "Content-Type": file.type,
            "X-Content-SHA256": checksum,
            "Idempotency-Key": attempt.current.key,
            "If-Match": `"${item.version}"`,
          },
        },
      );
      attempt.current = null;
      form.reset();
      done();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={upload}
      className="mt-4 space-y-3 rounded-lg bg-slate-50 p-4"
    >
      <Field label="Evidence kind">
        <select name="kind">
          {kinds.map((kind) => (
            <option key={kind} value={kind}>
              {human(kind)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Resolution photo">
        <input
          name="file"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          required
        />
      </Field>
      <p className="text-xs text-slate-500">
        PNG, JPEG or WebP · Up to {ops.evidence_max_bytes / 1024 / 1024} MB ·
        Remove sensitive location metadata before uploading.
      </p>
      <ErrorText message={error} />
      <button className={secondary} disabled={busy}>
        {busy ? "Verifying upload…" : "Upload photo"}
      </button>
    </form>
  );
}
function Download({
  token,
  caseId,
  file,
}: {
  token: string;
  caseId: string;
  file: Evidence;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/v1/cases/${caseId}/evidence/${file.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error?.message || "Download failed.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${file.kind.toLowerCase()}.${file.content_type === "image/jpeg" ? "jpg" : file.content_type.split("/")[1]}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button className={secondary} onClick={download} disabled={busy}>
        Download photo
      </button>
      <ErrorText message={error} />
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
