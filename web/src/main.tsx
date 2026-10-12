import React, { useEffect, useState, useRef } from "react";
import "./androidBridge";
import { createRoot } from "react-dom/client";
import { Header } from "./components/Header";
import {
  DASHBOARD_ROLES,
  type DashboardView,
} from "./components/Sidebar";
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
  type DashboardRole,
  type Policy,
  type User,
} from "./api";
import { ErrorText, Field } from "./ui";
import { AccessibilityControls } from "./accessibility";
import { HomePage } from "./views/HomePage";
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
    <div className="min-h-dvh bg-[#f8f9ff] text-[#0b1c30]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:p-3"
      >
        Skip to main content
      </a>
      {!user ? (
        <HomePage login={login} busy={busy} error={error} />
      ) : (
        <Workspace
          token={token}
          user={user}
          logout={logout}
          expired={expired}
        />
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
  const defaultView: Exclude<DashboardView, "notifications"> = (() => {
    if (user.roles.some((r) => r.role === "AUDITOR")) return "auditor-portal";
    if (user.roles.some((r) => r.role === "WARD_HEAD"))
      return "ward-head-oversight";
    if (user.roles.some((r) => r.role === "SUPERVISOR"))
      return "supervisor-queue";
    if (user.roles.some((r) => r.role === "OFFICER")) return "field-officer";
    if (user.roles.some((r) => r.role === "DISPATCHER")) return "dispatcher";
    if (user.roles.some((r) => r.role === "INTAKE_OFFICER"))
      return "intake-queue";
    return "citizen-overview";
  })();

  const [currentView, setCurrentView] = useState<DashboardView>(defaultView);
  const [activeDashboard, setActiveDashboard] = useState(defaultView);
  const activeRole = DASHBOARD_ROLES[activeDashboard];
  const viewGeneration = useRef(0);
  const [caseResults, setCaseResults] = useState<{
    role: DashboardRole | null;
    cases: Case[];
  }>({ role: null, cases: [] });
  const cases = caseResults.role === activeRole ? caseResults.cases : [];
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [summary, setSummary] = useState<{
    total: number;
    overdue: number;
    states: Record<string, number>;
    verification_waiting: number;
  } | null>(null);
  const [notificationCount, setNotificationCount] = useState(0);

  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [showNewGrievance, setShowNewGrievance] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  function selectView(view: DashboardView) {
    if (busy) return;
    viewGeneration.current++;
    setSelectedCase(null);
    setShowNewGrievance(false);
    setError("");
    if (view !== "notifications" && view !== activeDashboard) {
      setCaseResults({ role: null, cases: [] });
      setSummary(null);
      setLoading(true);
      setActiveDashboard(view);
    }
    setCurrentView(view);
  }

  useEffect(() => {
    if (currentView === "notifications") return;
    const timer = window.setInterval(
      () => setRevision((value) => value + 1),
      15000,
    );
    return () => window.clearInterval(timer);
  }, [currentView]);

  // Command execution ref
  const attempt = useRef<{ digest: string; key: string } | null>(null);

  // Load cases
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    const scope =
      activeRole === "CITIZEN"
        ? "&mine=true"
        : activeRole === "OFFICER"
          ? "&owned=true"
          : "";
    api<{ cases: Case[] }>(token, `/cases?limit=100${scope}`, {
      role: activeRole,
    })
      .then((res) => {
        if (live) setCaseResults({ role: activeRole, cases: res.cases });
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
  }, [token, revision, activeRole]);

  // Load policy & summary
  useEffect(() => {
    let live = true;
    Promise.all([
      api<{ policy: Policy }>(token, "/intake-options", { role: activeRole }),
      api<typeof summary>(
        token,
        `/operations/summary?mine=${activeRole === "CITIZEN"}&owned=${activeRole === "OFFICER"}`,
        { role: activeRole },
      ),
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
  }, [token, revision, activeRole]);

  useEffect(() => {
    let live = true;
    api<{ notifications: { id: string }[] }>(token, "/notifications?limit=1", {
      role: activeRole,
    })
      .then((result) => {
        if (live) setNotificationCount(result.notifications.length);
      })
      .catch(() => {
        if (live) setNotificationCount(0);
      });
    return () => {
      live = false;
    };
  }, [token, revision, activeRole]);

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
        activeRole,
      );
      setRevision((r) => r + 1);
      if (selectedCase?.id === item.id) setSelectedCase(result.case);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReject(
    item: Case,
    reasonCode: string,
    explanation: string,
  ) {
    setBusy(true);
    try {
      const result = await command(
        token,
        item,
        "reject",
        { reason_code: reasonCode, explanation },
        crypto.randomUUID(),
        activeRole,
      );
      setRevision((r) => r + 1);
      if (selectedCase?.id === item.id) setSelectedCase(result.case);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAssign(
    item: Case,
    officerId: string,
    reasonText: string,
  ) {
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
        activeRole,
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
        activeRole,
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
    latitude?: number;
    longitude?: number;
    accuracy_m?: number;
    photo?: {
      name: string;
      size: number;
      dataUrl: string;
      type: string;
    };
  }) {
    setBusy(true);
    try {
      const { photo, ...submitPayload } = data;
      const result = await command(
        token,
        null,
        "submit",
        submitPayload,
        crypto.randomUUID(),
        activeRole,
      );
      if (photo && result.case) {
        try {
          const photoRecord = JSON.stringify({
            name: photo.name,
            size: photo.size,
            dataUrl: photo.dataUrl,
            type: photo.type,
            attachedAt: new Date().toISOString(),
          });
          localStorage.setItem(`govfix_photo_${result.case.id}`, photoRecord);
        } catch {
          // Ignore storage quota limits
        }
      }
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
    const generation = viewGeneration.current;
    try {
      const res = await api<{ case: Case }>(token, `/cases/${caseId}`, {
        role: activeRole,
      });
      if (generation === viewGeneration.current) setSelectedCase(res.case);
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <div className="min-h-screen bg-[#f8f9ff]">
      {/* Top Header */}
      <Header
        user={user}
        logout={logout}
        busy={busy}
        notificationCount={notificationCount}
        currentView={currentView}
        activeDashboard={activeDashboard}
        onSelectView={selectView}
        onOpenNotifications={() => selectView("notifications")}
        activeRole={activeRole}
      />

      {/* Main Dashboard Workspace */}
      <main
        id="main-content"
        tabIndex={-1}
        className="pt-20 sm:pt-24 min-h-dvh bg-[#f8f9ff] px-4 sm:px-6 lg:px-8 py-6 pb-16 min-w-0"
      >
        <div className="max-w-7xl mx-auto">
          {error && (
            <div className="mb-4">
              <ErrorText message={error} />
            </div>
          )}

          {loading &&
          caseResults.role !== activeRole &&
          currentView !== "notifications" ? (
            <p role="status" className="py-10 text-sm text-[#434655]">
              Loading your dashboard…
            </p>
          ) : (
            <>
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
                  token={token}
                  expired={expired}
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
                  token={token}
                  expired={expired}
                  auditor
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
                  key={activeRole}
                  token={token}
                  role={activeRole}
                  onOpenCase={openCaseById}
                  onBackToDashboard={() => selectView(activeDashboard)}
                />
              )}
            </>
          )}
        </div>
      </main>

      {/* Case Detail Inspection Modal */}
      {selectedCase && (
        <CaseDetailModal
          key={`${activeRole}-${selectedCase.id}`}
          role={activeRole}
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
