import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Header } from "./components/Header";
import { Sidebar, type DashboardView } from "./components/Sidebar";
import { CitizenDashboard } from "./views/CitizenDashboard";
import { IntakeDashboard } from "./views/IntakeDashboard";
import { DispatcherDashboard } from "./views/DispatcherDashboard";
import { FieldOfficerDashboard } from "./views/FieldOfficerDashboard";
import { SupervisorDashboard } from "./views/SupervisorDashboard";
import { GovernanceDashboard } from "./views/GovernanceDashboard";
import { NotificationsView } from "./views/NotificationsView";
import { CaseDetailModal } from "./views/CaseDetailModal";
import { NewGrievanceModal } from "./views/NewGrievanceModal";
import {
  api,
  ApiError,
  command,
  type Case,
  type Policy,
  type User,
} from "./api";
import { ErrorText, Field } from "./ui";
import "./style.css";

function App() {
  const [token, setToken] = useState("");
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
    <div className="min-h-screen bg-[#f8f9ff] text-[#0b1c30]">
      {!user ? (
        <div className="min-h-screen flex flex-col justify-center items-center px-4 py-12">
          {/* Institutional Header Banner */}
          <div className="mb-8 text-center max-w-md">
            <div className="w-14 h-14 rounded-2xl bg-[#f77f00] flex items-center justify-center text-white shadow-md mx-auto mb-3">
              <span className="material-symbols-outlined text-[32px]">account_balance</span>
            </div>
            <div className="flex items-center justify-center gap-2 mb-1">
              <h1 className="text-xl font-bold tracking-tight text-[#0b1c30]">
                GovFix Municipal Operations
              </h1>
              <span className="px-2 py-0.5 rounded bg-[#e5eeff] text-[#434655] font-mono text-[10px] font-semibold uppercase">
                Demo
              </span>
            </div>
            <p className="text-xs text-[#434655]">
              Deterministic Grievance State Machine & Public SLA Engine
            </p>
          </div>

          <main className="w-full max-w-md">
            <div className="rounded-xl border border-[#d9cdba] bg-white p-7 shadow-sm">
              <div className="mb-5">
                <span className="text-[10px] font-bold tracking-wider text-[#0037b0] uppercase">
                  Statutory Access Portal
                </span>
                <h2 className="text-xl font-bold text-[#0b1c30] mt-0.5">
                  Sign in to GovFix
                </h2>
                <p className="text-xs text-[#434655] mt-1">
                  Authenticate using pilot citizen, officer, or auditor credentials.
                </p>
              </div>

              <form onSubmit={login} className="space-y-4">
                <Field label="Username">
                  <input
                    name="username"
                    autoComplete="username"
                    required
                    maxLength={100}
                    placeholder="e.g. pilot-citizen or pilot-auditor"
                    className="w-full text-xs p-2.5 rounded-lg bg-white border border-[#d9cdba] text-[#0b1c30] focus:ring-1 focus:ring-[#f77f00] focus:outline-none"
                  />
                </Field>
                <Field label="Password">
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    maxLength={128}
                    className="w-full text-xs p-2.5 rounded-lg bg-white border border-[#d9cdba] text-[#0b1c30] focus:ring-1 focus:ring-[#f77f00] focus:outline-none"
                  />
                </Field>

                <ErrorText message={error} />

                <button
                  disabled={busy}
                  className="w-full py-2.5 bg-[#f77f00] hover:bg-[#d96e00] text-white font-semibold text-xs rounded shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {busy ? "Authenticating…" : "Sign in to Operations"}
                </button>

                <div className="pt-3 border-t border-[#eff4ff] text-[11px] text-[#565e74] space-y-1">
                  <p>• <strong>Citizen:</strong> submit grievances, track SLA, verify resolution</p>
                  <p>• <strong>Officer / Supervisor:</strong> triage, dispatch, execute, rework</p>
                  <p>• <strong>Auditor:</strong> inspect immutable governance ledger</p>
                </div>
              </form>
            </div>
          </main>
        </div>
      ) : (
        <Workspace token={token} user={user} logout={logout} expired={expired} />
      )}
    </div>
  );
}

function Workspace({
  token,
  user,
  logout,
  expired,
}: {
  token: string;
  user: User;
  logout: () => void;
  expired: () => void;
}) {
  // Determine default view based on user roles
  const defaultView: DashboardView = (() => {
    if (user.roles.some((r) => r.role === "AUDITOR")) return "auditor-portal";
    if (user.roles.some((r) => r.role === "WARD_HEAD")) return "ward-head-oversight";
    if (user.roles.some((r) => r.role === "SUPERVISOR")) return "supervisor-queue";
    if (user.roles.some((r) => r.role === "OFFICER")) return "field-officer";
    return "citizen-overview";
  })();

  const [currentView, setCurrentView] = useState<DashboardView>(defaultView);
  const [cases, setCases] = useState<Case[]>([]);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [summary, setSummary] = useState<{
    total: number;
    overdue: number;
    states: Record<string, number>;
    verification_waiting: number;
  } | null>(null);

  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [showNewGrievance, setShowNewGrievance] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  // Command execution ref
  const attempt = useRef<{ digest: string; key: string } | null>(null);

  // Load cases
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    api<{ cases: Case[] }>(token, "/cases?limit=100")
      .then((res) => {
        if (live) setCases(res.cases);
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

  // Load policy & summary
  useEffect(() => {
    let live = true;
    Promise.all([
      api<{ policy: Policy }>(token, "/intake-options"),
      api<typeof summary>(token, "/operations/summary"),
    ])
      .then(([opts, totals]) => {
        if (live) {
          setPolicy(opts.policy);
          setSummary(totals);
        }
      })
      .catch((err) => {
        if (live) setError(err.message);
      });
    return () => {
      live = false;
    };
  }, [token, revision]);

  // Action helpers
  async function handleValidate(item: Case) {
    if (!policy) return;
    setBusy(true);
    try {
      const result = await command(
        token,
        item,
        "validate",
        {
          category: item.category,
          ward: item.ward,
          department: item.department,
          jurisdiction: policy.municipality,
        },
        crypto.randomUUID(),
      );
      setRevision((r) => r + 1);
      if (selectedCase?.id === item.id) setSelectedCase(result.case);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReject(item: Case, reasonCode: string, explanation: string) {
    setBusy(true);
    try {
      const result = await command(
        token,
        item,
        "reject",
        { reason_code: reasonCode, explanation },
        crypto.randomUUID(),
      );
      setRevision((r) => r + 1);
      if (selectedCase?.id === item.id) setSelectedCase(result.case);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAssign(item: Case, officerId: string, reasonText: string) {
    setBusy(true);
    try {
      const result = await command(
        token,
        item,
        "assign",
        {
          officer_id: officerId,
          department: item.department,
          reason: reasonText,
        },
        crypto.randomUUID(),
      );
      setRevision((r) => r + 1);
      if (selectedCase?.id === item.id) setSelectedCase(result.case);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAcceptAssignment(item: Case) {
    setBusy(true);
    try {
      const result = await command(
        token,
        item,
        "accept-assignment",
        { confirmation: true },
        crypto.randomUUID(),
      );
      setRevision((r) => r + 1);
      if (selectedCase?.id === item.id) setSelectedCase(result.case);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleNewGrievanceSubmit(data: {
    description: string;
    location: string;
    category: string;
    ward: string;
    confirmation: boolean;
  }) {
    setBusy(true);
    try {
      const result = await command(
        token,
        null,
        "submit",
        data,
        crypto.randomUUID(),
      );
      setShowNewGrievance(false);
      setRevision((r) => r + 1);
      setSelectedCase(result.case);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openCaseById(caseId: string) {
    try {
      const res = await api<{ case: Case }>(token, `/cases/${caseId}`);
      setSelectedCase(res.case);
    } catch (err) {
      alert((err as Error).message);
    }
  }

  const notificationCount = summary?.verification_waiting || 0;

  return (
    <div className="min-h-screen bg-[#f8f9ff]">
      {/* Top Header */}
      <Header
        user={user}
        logout={logout}
        busy={busy}
        notificationCount={notificationCount}
        onOpenNotifications={() => setCurrentView("notifications")}
      />

      {/* Left Navigation Sidebar with Role Switch Sandbox */}
      <Sidebar
        currentView={currentView}
        onSelectView={setCurrentView}
        user={user}
      />

      {/* Main Dashboard Workspace */}
      <main className="pl-64 pt-16 min-h-screen bg-[#f8f9ff] px-6 py-6 pb-16">
        <div className="max-w-7xl mx-auto">
          {error && (
            <div className="mb-4">
              <ErrorText message={error} />
            </div>
          )}

          {/* Active View Dispatcher */}
          {currentView === "citizen-overview" && (
            <CitizenDashboard
              cases={cases}
              policy={policy}
              user={user}
              token={token}
              onOpenCase={(item) => setSelectedCase(item)}
              onNewGrievance={() => setShowNewGrievance(true)}
              onRefresh={() => setRevision((r) => r + 1)}
            />
          )}

          {currentView === "intake-queue" && (
            <IntakeDashboard
              cases={cases}
              policy={policy}
              user={user}
              onOpenCase={(item) => setSelectedCase(item)}
              onValidate={handleValidate}
              onReject={handleReject}
              onRefresh={() => setRevision((r) => r + 1)}
              busy={busy}
            />
          )}

          {currentView === "dispatcher" && (
            <DispatcherDashboard
              cases={cases}
              policy={policy}
              user={user}
              token={token}
              onOpenCase={(item) => setSelectedCase(item)}
              onAssign={handleAssign}
              onRefresh={() => setRevision((r) => r + 1)}
              busy={busy}
            />
          )}

          {currentView === "field-officer" && (
            <FieldOfficerDashboard
              cases={cases}
              policy={policy}
              user={user}
              onOpenCase={(item) => setSelectedCase(item)}
              onAcceptAssignment={handleAcceptAssignment}
              onRefresh={() => setRevision((r) => r + 1)}
              busy={busy}
            />
          )}

          {currentView === "supervisor-queue" && (
            <SupervisorDashboard
              cases={cases}
              policy={policy}
              user={user}
              onOpenCase={(item) => setSelectedCase(item)}
              onRefresh={() => setRevision((r) => r + 1)}
              busy={busy}
            />
          )}

          {currentView === "ward-head-oversight" && (
            <GovernanceDashboard
              cases={cases}
              policy={policy}
              user={user}
              summary={summary}
              onOpenCase={(item) => setSelectedCase(item)}
              onRefresh={() => setRevision((r) => r + 1)}
            />
          )}

          {currentView === "auditor-portal" && (
            <GovernanceDashboard
              cases={cases}
              policy={policy}
              user={user}
              summary={summary}
              onOpenCase={(item) => setSelectedCase(item)}
              onRefresh={() => setRevision((r) => r + 1)}
            />
          )}

          {currentView === "notifications" && (
            <NotificationsView
              token={token}
              onOpenCase={openCaseById}
            />
          )}
        </div>
      </main>

      {/* Case Detail Inspection Modal */}
      {selectedCase && (
        <CaseDetailModal
          token={token}
          item={selectedCase}
          user={user}
          onClose={() => setSelectedCase(null)}
          onSaved={(updated) => {
            setSelectedCase(updated);
            setRevision((r) => r + 1);
          }}
          expired={expired}
        />
      )}

      {/* Report New Grievance Modal */}
      {showNewGrievance && policy && (
        <NewGrievanceModal
          policy={policy}
          onClose={() => setShowNewGrievance(false)}
          onSubmit={handleNewGrievanceSubmit}
          busy={busy}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
