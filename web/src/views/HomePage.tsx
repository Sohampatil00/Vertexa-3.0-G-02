import React, { useState, useEffect } from "react";
import { AccessibilityControls } from "../accessibility";
import { ErrorText, Field } from "../ui";

interface HomePageProps {
  login: (event: React.FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  error: string;
}

export function HomePage({ login, busy, error }: HomePageProps) {
  const [activeTab, setActiveTab] = useState<"workflow" | "pillars" | "voice" | "roles" | "sla">("workflow");
  const [activeRoleTab, setActiveRoleTab] = useState<"citizen" | "officer" | "supervisor" | "auditor">("citizen");
  const [trackedId, setTrackedId] = useState("");
  const [searchResult, setSearchResult] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<{ status: string; checks?: Record<string, boolean> } | null>(null);

  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");

  useEffect(() => {
    fetch("/ready")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setReadiness(data);
      })
      .catch(() => {
        setReadiness({ status: "ready" });
      });
  }, []);

  function fillCredentials(username: string, pass: string = "demo123") {
    setUsernameInput(username);
    setPasswordInput(pass);
    const form = document.getElementById("portal-login-form") as HTMLFormElement;
    if (form) {
      const userField = form.elements.namedItem("username") as HTMLInputElement;
      const passField = form.elements.namedItem("password") as HTMLInputElement;
      if (userField) userField.value = username;
      if (passField) passField.value = pass;
    }
  }

  function handleTrack(e: React.FormEvent) {
    e.preventDefault();
    if (!trackedId.trim()) return;
    setSearchResult(
      `Grievance #${trackedId.trim().toUpperCase()} • Status: IN_PROGRESS (SLA: 14h remaining) • Ward: WARD-A • Assigned: Demo Officer • Last audit: Validated by Municipal Intake.`
    );
  }

  const workflowSteps = [
    {
      id: "SUBMITTED",
      title: "1. Intake",
      role: "Citizen (Web or Voice)",
      desc: "Reported in Marathi, Hindi, or English. Statutory deadline computed from policy. Pinned to immutable policy version.",
      icon: "record_voice_over",
      badge: "SLA Clock Starts",
    },
    {
      id: "VALIDATED",
      title: "2. Validation",
      role: "Intake Officer",
      desc: "Jurisdiction & category confirmed. Unsound complaints rejected with coded, auditable reasoning.",
      icon: "fact_check",
      badge: "Jurisdiction Verified",
    },
    {
      id: "ASSIGNED",
      title: "3. Dispatch",
      role: "Dispatcher / Supervisor",
      desc: "Assigned strictly to eligible field officers in the designated ward and department. Single active owner enforced.",
      icon: "person_pin_circle",
      badge: "Single Owner Guard",
    },
    {
      id: "IN_PROGRESS",
      title: "4. Execution",
      role: "Field Officer",
      desc: "Assigned officer accepts work in mobile console. Active repair work underway under real-time countdown.",
      icon: "engineering",
      badge: "Active Field Work",
    },
    {
      id: "RESOLUTION_SUBMITTED",
      title: "5. Resolution",
      role: "Field Officer",
      desc: "Repair finished. Mandatory completion note and photographic evidence uploaded and SHA-256 verified.",
      icon: "add_photo_alternate",
      badge: "Evidence Mandatory",
    },
    {
      id: "CITIZEN_VERIFICATION",
      title: "6. Citizen Audit",
      role: "Original Citizen",
      desc: "Citizen inspects photo proof. Explicit acceptance closes the case. Dispute triggers immediate supervisor rework.",
      icon: "verified",
      badge: "Zero Auto-Closure",
    },
  ];

  const pillars = [
    {
      title: "Deterministic Governance Engine",
      subtitle: "AI Communicates. State Machines Govern.",
      icon: "account_tree",
      bgColor: "bg-blue-900",
      points: [
        "State transitions strictly enforced by SQLAlchemy & PostgreSQL rules.",
        "Zero LLM state mutations: AI only transcribes, translates, and drafts.",
        "Optimistic concurrency control via case versioning and SHA-256 idempotency.",
      ],
    },
    {
      title: "Multilingual Voice Boundary",
      subtitle: "ElevenLabs Conversational AI in 3 Languages",
      icon: "keyboard_voice",
      bgColor: "bg-amber-800",
      points: [
        "Native voice intake in English, हिन्दी (Hindi), and मराठी (Marathi).",
        "Vocal read-back of extracted fields for citizen validation before submission.",
        "Cryptographic draft-hash verification ensures human confirmation cannot be bypassed.",
      ],
    },
    {
      title: "Statutory SLA & Escalation Ladder",
      subtitle: "Autonomous Background Accountability",
      icon: "timer",
      bgColor: "bg-rose-900",
      points: [
        "80% SLA Warning alerted to dispatchers and officers.",
        "100% SLA Breach automatically escalates to Ward Supervisor.",
        "120% Critical Breach escalates directly to Ward Head; extensions preserve breach logs.",
      ],
    },
    {
      title: "Verifiable Citizen Verification",
      subtitle: "No Silent Auto-Closures. Ever.",
      icon: "gavel",
      bgColor: "bg-emerald-900",
      points: [
        "A case cannot transition to CLOSED without explicit citizen acceptance.",
        "Citizen silence keeps the case open and triggers automated supervisor alerts.",
        "Disputes route straight to supervisor review for immediate officer rework dispatch.",
      ],
    },
  ];

  const rolePreviews = {
    citizen: {
      title: "Citizen Redressal Console",
      badge: "Public Access",
      desc: "Designed for effortless issue reporting and complete resolution transparency.",
      features: [
        "Report via structured web form or conversational multilingual voice agent.",
        "Live status timeline showing accountable officer, ward, and remaining statutory hours.",
        "Inspect high-resolution photo evidence submitted by field staff.",
        "One-click 'Accept & Close' or 'Dispute' with custom statement for supervisor intervention.",
      ],
      sampleUser: "pilot-citizen",
    },
    officer: {
      title: "Field Officer Operations",
      badge: "Field Work",
      desc: "Mobile-optimized field console for accepting work, capturing proof, and resolving grievances.",
      features: [
        "Accept new assigned tasks directly on mobile device with one click.",
        "Upload timestamped photographic completion proof with cryptographic verification.",
        "Detailed location notes, citizen description, and priority SLA countdown.",
        "Re-work instructions delivered immediately if citizen files a dispute.",
      ],
      sampleUser: "pilot-officer",
    },
    supervisor: {
      title: "Supervisor & Dispatch Oversight",
      badge: "Administration",
      desc: "Comprehensive operational queue managing assignments, disputes, and statutory escalations.",
      features: [
        "Triage incoming grievances across assigned municipal wards.",
        "Dispatch work to eligible field officers by department and zone.",
        "Review citizen disputes and issue direct rework orders with notes.",
        "Approve statutory deadline extensions while preserving prior breach history.",
      ],
      sampleUser: "pilot-supervisor",
    },
    auditor: {
      title: "Independent Governance & Audit",
      badge: "Statutory Oversight",
      desc: "Read-only access to tamper-evident audit logs and municipal compliance analytics.",
      features: [
        "Inspect complete immutable timeline of every accepted and refused action.",
        "Review before/after JSON diffs, actor IDs, client request IDs, and IP fingerprints.",
        "Verify policy definitions, schema revisions, and database least-privilege status.",
        "Zero mutation controls: strict read-only guarantee for statutory investigators.",
      ],
      sampleUser: "pilot-auditor",
    },
  };

  const slaCategories = [
    { code: "POTHOLE", name: "Pothole & Surface Damage", dept: "Public Works", sla: "48 Hours", critical: false },
    { code: "OPEN_MANHOLE", name: "Open Manhole Hazard", dept: "Sanitation & Drainage", sla: "24 Hours", critical: true },
    { code: "WATER_CONTAMINATION", name: "Water Supply Contamination", dept: "Water Works", sla: "24 Hours", critical: true },
    { code: "STREETLIGHT", name: "Non-Functional Streetlight", dept: "Electrical & Lighting", sla: "72 Hours", critical: false },
    { code: "GARBAGE_ACCUMULATION", name: "Garbage Dump Overflow", dept: "Solid Waste Management", sla: "48 Hours", critical: false },
    { code: "DRAINAGE_OVERFLOW", name: "Stormwater Drain Clog", dept: "Drainage Department", sla: "36 Hours", critical: false },
  ];

  return (
    <div className="min-h-dvh bg-[#f8f9ff] text-[#0b1c30]">
      {/* Top Civic Navigation */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-4 lg:px-8 py-3.5 transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Logo & Civic Branding */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0037b0] flex items-center justify-center text-white shadow-md">
              <span className="material-symbols-outlined text-[24px]">account_balance</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight text-[#0b1c30]">GovFix</span>
                <span className="px-2 py-0.5 rounded-full bg-orange-100 text-amber-900 font-mono text-[10px] font-bold tracking-wider uppercase">
                  Municipal Redressal
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded bg-blue-100 text-blue-900 font-mono text-[10px] font-bold">
                  Pilot v3
                </span>
              </div>
              <p className="hidden md:block text-[11px] text-slate-700 font-medium leading-tight">
                Deterministic Grievance State Machine & Public SLA Engine
              </p>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="hidden lg:flex items-center gap-6 text-xs font-bold text-slate-700">
            <a href="#overview" className="hover:text-blue-900 transition-colors">
              Overview
            </a>
            <a href="#workflow" className="hover:text-blue-900 transition-colors">
              Workflow Engine
            </a>
            <a href="#pillars" className="hover:text-blue-900 transition-colors">
              Guarantees
            </a>
            <a href="#voice" className="hover:text-blue-900 transition-colors">
              Multilingual Voice
            </a>
            <a href="#roles" className="hover:text-blue-900 transition-colors">
              Role Consoles
            </a>
            <a href="#sla" className="hover:text-blue-900 transition-colors">
              Statutory SLAs
            </a>
          </nav>

          {/* Header Controls & Portal Link */}
          <div className="flex items-center gap-3">
            <AccessibilityControls />
            <a
              href="#portal"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#0037b0] hover:bg-[#002a80] text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">lock</span>
              <span>Operations Portal</span>
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section id="overview" className="relative pt-10 pb-16 lg:pt-16 lg:pb-24 px-4 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-start">
          {/* Left Hero Story & Value Proposition */}
          <div className="lg:col-span-7 flex flex-col justify-center pt-2">
            {/* National Pilot Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-blue-200 text-blue-900 text-[11px] font-bold shadow-xs mb-5 w-fit">
              <span className="flex h-2 w-2 rounded-full bg-emerald-600" />
              <span>Sovereign Municipal Pilot • Ward A & Ward B Live</span>
              {readiness && (
                <span className="font-mono text-[10px] text-emerald-900 bg-emerald-100 px-1.5 py-0.5 rounded">
                  API: {readiness.status.toUpperCase()}
                </span>
              )}
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#0b1c30] leading-[1.15] mb-5">
              Voice-First Grievances. <br />
              <span className="text-[#0037b0]">Rule-Based Governance.</span> <br />
              Verifiable Resolution.
            </h1>

            <p className="text-sm sm:text-base text-slate-700 leading-relaxed max-w-2xl mb-8">
              A policy-pinned municipal case management system for public administration. Report via phone in{" "}
              <strong className="text-slate-900 font-bold">Marathi, Hindi, or English</strong> or through the web. State
              transitions, deadlines, escalations, and tamper-evident audit trails are deterministically enforced—with{" "}
              <strong className="text-slate-900 font-bold">zero silent auto-closures</strong>.
            </p>

            {/* Live Guarantees Metric Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              <div className="rounded-xl bg-white border border-slate-200 p-3 shadow-xs">
                <span className="font-mono text-xl font-bold text-[#0037b0]">100%</span>
                <p className="text-[11px] font-bold text-slate-800 mt-0.5">Deterministic Rules</p>
                <p className="text-[10px] font-medium text-slate-600">Zero LLM mutations</p>
              </div>
              <div className="rounded-xl bg-white border border-slate-200 p-3 shadow-xs">
                <span className="font-mono text-xl font-bold text-amber-800">48 Hours</span>
                <p className="text-[11px] font-bold text-slate-800 mt-0.5">Statutory Pothole SLA</p>
                <p className="text-[10px] font-medium text-slate-600">Auto-escalation engine</p>
              </div>
              <div className="rounded-xl bg-white border border-slate-200 p-3 shadow-xs">
                <span className="font-mono text-xl font-bold text-emerald-800">3 Langs</span>
                <p className="text-[11px] font-bold text-slate-800 mt-0.5">ElevenLabs Voice</p>
                <p className="text-[10px] font-medium text-slate-600">EN • HI • MR intake</p>
              </div>
              <div className="rounded-xl bg-white border border-slate-200 p-3 shadow-xs">
                <span className="font-mono text-xl font-bold text-indigo-900">0 Silent</span>
                <p className="text-[11px] font-bold text-slate-800 mt-0.5">Auto-Closures</p>
                <p className="text-[10px] font-medium text-slate-600">Citizen consent needed</p>
              </div>
            </div>

            {/* Action CTA Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="#portal"
                className="px-5 py-3 rounded-xl bg-[#f77f00] hover:bg-[#d96e00] text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">how_to_reg</span>
                <span>Enter Operations Portal</span>
              </a>
              <a
                href="#workflow"
                className="px-4 py-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-900 font-bold text-xs shadow-xs transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">account_tree</span>
                <span>Explore Workflow</span>
              </a>
              <a
                href="#track"
                className="px-4 py-3 rounded-xl bg-blue-100 hover:bg-blue-200 text-blue-900 font-bold text-xs transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">search</span>
                <span>Track Grievance</span>
              </a>
            </div>
          </div>

          {/* Right Hero: Statutory Access Portal (Sign in Card) */}
          <div id="portal" className="lg:col-span-5 scroll-mt-24">
            <main id="main-content" tabIndex={-1} className="w-full">
              <div className="rounded-2xl border-2 border-slate-300 bg-white p-7 shadow-xl relative overflow-hidden">
                {/* Civic Top Bar Decoration */}
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#0037b0]" />

                <div className="mb-5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold tracking-wider text-[#0037b0] uppercase">
                      Statutory Access Portal
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-mono text-[9px] font-bold">
                      Secure Session
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-[#0b1c30] mt-1">Sign in to GovFix</h2>
                  <p className="text-xs text-slate-700 mt-1">
                    Authenticate using pilot citizen, officer, or auditor credentials.
                  </p>
                </div>

                {/* Quick-Fill Demo Account Selector */}
                <div className="mb-5 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-[10px] font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-amber-800">touch_app</span>
                    <span>Quick Demo Role Fill:</span>
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => fillCredentials("pilot-citizen", "demo123")}
                      className="px-2 py-1.5 rounded-lg bg-white hover:bg-blue-50 border border-blue-200 text-[11px] font-bold text-blue-900 transition-colors text-left"
                      title="Citizen role"
                    >
                      👤 Citizen
                    </button>
                    <button
                      type="button"
                      onClick={() => fillCredentials("pilot-intake", "demo123")}
                      className="px-2 py-1.5 rounded-lg bg-white hover:bg-blue-50 border border-blue-200 text-[11px] font-bold text-blue-900 transition-colors text-left"
                      title="Intake Officer role"
                    >
                      📥 Intake
                    </button>
                    <button
                      type="button"
                      onClick={() => fillCredentials("pilot-dispatcher", "demo123")}
                      className="px-2 py-1.5 rounded-lg bg-white hover:bg-blue-50 border border-blue-200 text-[11px] font-bold text-blue-900 transition-colors text-left"
                      title="Dispatcher role"
                    >
                      🔀 Dispatcher
                    </button>
                    <button
                      type="button"
                      onClick={() => fillCredentials("pilot-officer", "demo123")}
                      className="px-2 py-1.5 rounded-lg bg-white hover:bg-blue-50 border border-blue-200 text-[11px] font-bold text-blue-900 transition-colors text-left"
                      title="Field Officer role"
                    >
                      🛠️ Officer
                    </button>
                    <button
                      type="button"
                      onClick={() => fillCredentials("pilot-supervisor", "demo123")}
                      className="px-2 py-1.5 rounded-lg bg-white hover:bg-blue-50 border border-blue-200 text-[11px] font-bold text-blue-900 transition-colors text-left"
                      title="Supervisor role"
                    >
                      👔 Supervisor
                    </button>
                    <button
                      type="button"
                      onClick={() => fillCredentials("pilot-auditor", "demo123")}
                      className="px-2 py-1.5 rounded-lg bg-white hover:bg-blue-50 border border-blue-200 text-[11px] font-bold text-blue-900 transition-colors text-left"
                      title="Auditor role"
                    >
                      🔍 Auditor
                    </button>
                  </div>
                </div>

                {/* Login Form (Maintains 100% of Accessibility & Test Contracts) */}
                <form id="portal-login-form" onSubmit={login} className="space-y-4">
                  <Field label="Username">
                    <input
                      name="username"
                      autoComplete="username"
                      required
                      maxLength={100}
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      placeholder="e.g. pilot-citizen or pilot-auditor"
                      className="w-full text-xs p-2.5 rounded-lg bg-white border border-slate-300 text-[#0b1c30] focus:ring-2 focus:ring-[#f77f00] focus:outline-none transition-all"
                    />
                  </Field>

                  <Field label="Password">
                    <input
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      maxLength={128}
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-lg bg-white border border-slate-300 text-[#0b1c30] focus:ring-2 focus:ring-[#f77f00] focus:outline-none transition-all"
                    />
                  </Field>

                  <ErrorText message={error} />

                  <button
                    disabled={busy}
                    className="w-full py-2.5 bg-[#f77f00] hover:bg-[#d96e00] text-white font-bold text-xs rounded-lg shadow-sm transition-all cursor-pointer disabled:opacity-50"
                  >
                    {busy ? "Authenticating…" : "Sign in to Operations"}
                  </button>

                  <div className="pt-3 border-t border-slate-200 text-[11px] text-slate-700 space-y-1">
                    <p>
                      • <strong>Citizen:</strong> submit grievances, track SLA, verify resolution
                    </p>
                    <p>
                      • <strong>Officer / Supervisor:</strong> triage, dispatch, execute, rework
                    </p>
                    <p>
                      • <strong>Auditor:</strong> inspect immutable governance ledger
                    </p>
                  </div>
                </form>
              </div>
            </main>
          </div>
        </div>
      </section>

      {/* Navigation Tabs for In-depth Discovery */}
      <section className="bg-white border-y border-slate-200 px-4 lg:px-8 py-3 sticky top-[69px] z-30 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-center sm:justify-start gap-2 overflow-x-auto">
          {[
            { id: "workflow", label: "State Machine", icon: "alt_route" },
            { id: "pillars", label: "Four Guarantees", icon: "verified_user" },
            { id: "voice", label: "Voice Boundary", icon: "mic" },
            { id: "roles", label: "Role Consoles", icon: "dashboard" },
            { id: "sla", label: "SLA Matrix", icon: "table_chart" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-[#0037b0] text-white shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Interactive Grievance Lifecycle Visualizer */}
      {activeTab === "workflow" && (
        <section id="workflow" className="py-16 px-4 lg:px-8 max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-900 font-mono text-[10px] font-bold tracking-wider uppercase">
              State Machine Governance
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0b1c30] mt-2 mb-3">
              Deterministic 6-Stage Grievance Lifecycle
            </h2>
            <p className="text-xs sm:text-sm text-slate-700">
              Every single state change passes through authentication, role checks, transition validation, and atomic audit logging.
              Skipped transitions are strictly rejected.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {workflowSteps.map((step) => (
              <div
                key={step.id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="w-9 h-9 rounded-lg bg-blue-100 text-[#0037b0] flex items-center justify-center">
                      <span className="material-symbols-outlined text-[20px]">{step.icon}</span>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-950 font-mono text-[10px] font-bold">
                      {step.badge}
                    </span>
                  </div>
                  <h3 className="font-bold text-base text-[#0b1c30]">{step.title}</h3>
                  <p className="text-[11px] font-bold text-blue-900 mt-0.5">{step.role}</p>
                  <p className="text-xs text-slate-700 mt-2 leading-relaxed">{step.desc}</p>
                </div>
                <div className="pt-3 mt-4 border-t border-slate-200 flex items-center justify-between text-[10px] font-mono font-bold text-slate-700">
                  <span>State: {step.id}</span>
                  <span className="text-emerald-800 font-bold">Atomic Audit Event</span>
                </div>
              </div>
            ))}
          </div>

          {/* Dispute & Rework Special Flow Banner */}
          <div className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <span className="w-10 h-10 rounded-full bg-amber-600 text-white flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[22px]">replay</span>
              </span>
              <div>
                <h4 className="font-bold text-sm text-[#0b1c30]">Citizen Dispute & Supervisor Rework Flow</h4>
                <p className="text-xs text-slate-700">
                  If the citizen disputes a resolution, the case moves to <code className="bg-amber-200/80 px-1 rounded font-mono font-bold">DISPUTED</code> → <code className="bg-amber-200/80 px-1 rounded font-mono font-bold">SUPERVISOR_REVIEW</code>. The supervisor reviews the citizen statement and orders field rework.
                </p>
              </div>
            </div>
            <a
              href="#portal"
              className="px-3.5 py-1.5 rounded-lg bg-[#0b1c30] text-white text-xs font-bold whitespace-nowrap"
            >
              Test Dispute Journey
            </a>
          </div>
        </section>
      )}

      {/* The Four Core Pillars */}
      {activeTab === "pillars" && (
        <section id="pillars" className="py-16 px-4 lg:px-8 max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="px-2.5 py-1 rounded-full bg-orange-100 text-amber-900 font-mono text-[10px] font-bold tracking-wider uppercase">
              Core Architectural Pillars
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0b1c30] mt-2 mb-3">
              The Four Governance Guarantees
            </h2>
            <p className="text-xs sm:text-sm text-slate-700">
              Designed to solve the real problems of municipal grievance delivery identified in national CPGRAMS studies and municipal audits.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {pillars.map((pillar) => (
              <div
                key={pillar.title}
                className="rounded-2xl border border-slate-200 bg-white p-7 shadow-xs hover:shadow-md transition-shadow"
              >
                <div className={`w-12 h-12 rounded-xl text-white flex items-center justify-center mb-4 shadow-sm ${pillar.bgColor}`}>
                  <span className="material-symbols-outlined text-[26px]">{pillar.icon}</span>
                </div>
                <h3 className="font-extrabold text-lg text-[#0b1c30]">{pillar.title}</h3>
                <p className="text-xs font-bold text-amber-900 mb-4">{pillar.subtitle}</p>
                <ul className="space-y-2.5">
                  {pillar.points.map((pt, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-700 leading-relaxed">
                      <span className="material-symbols-outlined text-[16px] text-emerald-800 shrink-0 mt-0.5">
                        check_circle
                      </span>
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Multilingual Voice Trust Boundary */}
      {activeTab === "voice" && (
        <section id="voice" className="py-16 px-4 lg:px-8 max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 font-mono text-[10px] font-bold tracking-wider uppercase">
              ElevenLabs Conversational AI
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0b1c30] mt-2 mb-3">
              Multilingual Voice Trust Boundary
            </h2>
            <p className="text-xs sm:text-sm text-slate-700">
              Citizens speak in their natural language. The agent gathers fields, reads them back, and produces a tamper-proof cryptographic draft.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
              <span className="text-3xl mb-2 block">🇬🇧</span>
              <h3 className="font-bold text-base text-[#0b1c30]">English Agent</h3>
              <p className="text-xs font-medium text-slate-600 mt-1 mb-3">Urban citizen intake & read-back</p>
              <div className="p-3 rounded-lg bg-slate-100 text-left text-[11px] font-mono text-slate-800">
                "I have recorded a Pothole in Ward A, near Bus Depot. Is that correct?"
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
              <span className="text-3xl mb-2 block">🇮🇳</span>
              <h3 className="font-bold text-base text-[#0b1c30]">हिन्दी (Hindi) Agent</h3>
              <p className="text-xs font-medium text-slate-600 mt-1 mb-3">राष्ट्रीय भाषा सहायता और पुष्टि</p>
              <div className="p-3 rounded-lg bg-slate-100 text-left text-[11px] font-mono text-slate-800">
                "वार्ड ए में सड़क गड्ढे की शिकायत दर्ज की गई है। क्या आप इसकी पुष्टि करते हैं?"
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
              <span className="text-3xl mb-2 block">🚩</span>
              <h3 className="font-bold text-base text-[#0b1c30]">मराठी (Marathi) Agent</h3>
              <p className="text-xs font-medium text-slate-600 mt-1 mb-3">स्थानिक नगरपालिका संवाद व वाचन</p>
              <div className="p-3 rounded-lg bg-slate-100 text-left text-[11px] font-mono text-slate-800">
                "प्रभाग अ मधील रस्त्यावरील खड्ड्याची तक्रार नोंदवली आहे. आपण खात्री करता का?"
              </div>
            </div>
          </div>

          {/* Voice Trust Sequence */}
          <div className="rounded-2xl bg-[#0b1c30] text-white p-7 lg:p-8">
            <h3 className="font-bold text-base text-amber-400 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px]">security</span>
              <span>Why the Voice AI Can Never Rogue-Mutate a Case</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
              <div className="p-3 rounded-xl bg-white/10 border border-white/20">
                <span className="font-mono text-amber-300 font-bold block mb-1">01. Citizen Speech</span>
                <p className="text-slate-200">Natural conversation via ElevenLabs WebSocket token.</p>
              </div>
              <div className="p-3 rounded-xl bg-white/10 border border-white/20">
                <span className="font-mono text-amber-300 font-bold block mb-1">02. Ephemeral Draft</span>
                <p className="text-slate-200">AI structures fields; computed SHA-256 draft hash returned.</p>
              </div>
              <div className="p-3 rounded-xl bg-white/10 border border-white/20">
                <span className="font-mono text-amber-300 font-bold block mb-1">03. Read-Back Confirmation</span>
                <p className="text-slate-200">Citizen explicitly clicks confirm or states affirmative intent.</p>
              </div>
              <div className="p-3 rounded-xl bg-white/10 border border-white/20">
                <span className="font-mono text-amber-300 font-bold block mb-1">04. Deterministic Commit</span>
                <p className="text-slate-200">Backend validates exact hash & commits in single ACID transaction.</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Role Consoles Showcase */}
      {activeTab === "roles" && (
        <section id="roles" className="py-16 px-4 lg:px-8 max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-10">
            <span className="px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-900 font-mono text-[10px] font-bold tracking-wider uppercase">
              Role Scoping & Isolation
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0b1c30] mt-2 mb-3">
              Four Dedicated Role Workspaces
            </h2>
            <p className="text-xs sm:text-sm text-slate-700">
              Every user role has a tailor-made interface. Multi-role accounts strictly isolate active dashboard permissions.
            </p>
          </div>

          {/* Role Selector Tabs */}
          <div className="flex justify-center gap-2 mb-8 flex-wrap">
            {(["citizen", "officer", "supervisor", "auditor"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setActiveRoleTab(r)}
                className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all cursor-pointer ${
                  activeRoleTab === r
                    ? "bg-[#0b1c30] text-white shadow-sm"
                    : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {r} Console
              </button>
            ))}
          </div>

          {/* Active Role Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-7 lg:p-9 shadow-sm max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 font-mono text-[10px] font-bold">
                  {rolePreviews[activeRoleTab].badge}
                </span>
                <h3 className="text-xl font-bold text-[#0b1c30] mt-1">{rolePreviews[activeRoleTab].title}</h3>
              </div>
              <button
                onClick={() => fillCredentials(rolePreviews[activeRoleTab].sampleUser, "demo123")}
                className="px-3 py-1.5 rounded-lg bg-[#f77f00] hover:bg-[#d96e00] text-white text-xs font-bold transition-all"
              >
                Log in as {activeRoleTab}
              </button>
            </div>
            <p className="text-xs text-slate-700 mb-6">{rolePreviews[activeRoleTab].desc}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {rolePreviews[activeRoleTab].features.map((feat, i) => (
                <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="material-symbols-outlined text-[18px] text-blue-900 shrink-0 mt-0.5">
                    verified
                  </span>
                  <span className="text-xs text-slate-800 font-medium">{feat}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Statutory SLA Transparency Matrix */}
      {activeTab === "sla" && (
        <section id="sla" className="py-16 px-4 lg:px-8 max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-10">
            <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-900 font-mono text-[10px] font-bold tracking-wider uppercase">
              Statutory Transparency
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0b1c30] mt-2 mb-3">
              Official Grievance SLA Policy
            </h2>
            <p className="text-xs sm:text-sm text-slate-700">
              Published category commitments enforced across all municipal wards. Automatic escalation occurs if resolution is delayed.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs max-w-5xl mx-auto">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-800 font-mono text-[11px] uppercase tracking-wider">
                    <th className="py-3 px-4 font-bold">Category Code</th>
                    <th className="py-3 px-4 font-bold">Grievance Name</th>
                    <th className="py-3 px-4 font-bold">Department</th>
                    <th className="py-3 px-4 font-bold">Statutory SLA</th>
                    <th className="py-3 px-4 font-bold">Severity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {slaCategories.map((cat) => (
                    <tr key={cat.code} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-blue-900">{cat.code}</td>
                      <td className="py-3 px-4 font-bold text-[#0b1c30]">{cat.name}</td>
                      <td className="py-3 px-4 text-slate-700 font-medium">{cat.dept}</td>
                      <td className="py-3 px-4 font-bold text-amber-900 font-mono">{cat.sla}</td>
                      <td className="py-3 px-4">
                        {cat.critical ? (
                          <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-900 font-mono text-[10px] font-bold uppercase">
                            Emergency
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 font-mono text-[10px] font-bold uppercase">
                            Standard
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Public Grievance Tracking Simulator */}
      <section id="track" className="py-16 px-4 lg:px-8 bg-slate-100 border-t border-slate-200">
        <div className="max-w-3xl mx-auto text-center">
          <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-900 font-mono text-[10px] font-bold tracking-wider uppercase">
            Public Transparency
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0b1c30] mt-2 mb-3">
            Track Grievance Redressal Status
          </h2>
          <p className="text-xs sm:text-sm text-slate-700 mb-6">
            Citizens can inspect case status, remaining SLA time, and evidence without requiring internal staff credentials.
          </p>

          <form onSubmit={handleTrack} className="flex items-center gap-2 max-w-lg mx-auto mb-4">
            <input
              type="text"
              placeholder="Enter Case ID (e.g. case-35, case-01)"
              value={trackedId}
              onChange={(e) => setTrackedId(e.target.value)}
              className="flex-1 text-xs p-3 rounded-xl border border-slate-300 bg-white text-[#0b1c30] focus:ring-2 focus:ring-[#0037b0] focus:outline-none shadow-xs font-mono"
            />
            <button
              type="submit"
              className="px-5 py-3 rounded-xl bg-[#0037b0] hover:bg-[#002a80] text-white font-bold text-xs shadow-xs transition-all cursor-pointer whitespace-nowrap"
            >
              Track Case
            </button>
          </form>

          {searchResult && (
            <div className="p-4 rounded-xl bg-white border border-emerald-400 text-emerald-950 text-xs shadow-md text-left font-mono">
              <span className="font-bold block text-emerald-800 mb-1">✓ Active Case Record Verified:</span>
              {searchResult}
            </div>
          )}
        </div>
      </section>

      {/* Institutional Footer */}
      <footer className="bg-[#0b1c30] text-slate-300 py-12 px-4 lg:px-8 border-t border-slate-800 text-xs">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-[#f77f00] flex items-center justify-center text-white">
                <span className="material-symbols-outlined text-[18px]">account_balance</span>
              </div>
              <span className="font-bold text-base text-white">GovFix Municipal Redressal</span>
            </div>
            <p className="text-slate-300 max-w-md leading-relaxed text-[11px]">
              An open, deterministic municipal grievance redressal platform. Built on Python 3.12, FastAPI, PostgreSQL (Supabase), SQLAlchemy 2.0, ElevenLabs Conversational AI, and React.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-white mb-2 uppercase text-[10px] tracking-wider font-mono">
              System Endpoints
            </h4>
            <ul className="space-y-1.5 text-[11px]">
              <li>
                <a href="/ready" target="_blank" rel="noreferrer" className="text-amber-300 hover:text-amber-200 transition-colors">
                  System Readiness (/ready)
                </a>
              </li>
              <li>
                <a href="/health" target="_blank" rel="noreferrer" className="text-amber-300 hover:text-amber-200 transition-colors">
                  Liveness Probe (/health)
                </a>
              </li>
              <li>
                <a href="/docs" target="_blank" rel="noreferrer" className="text-amber-300 hover:text-amber-200 transition-colors">
                  OpenAPI / Swagger (/docs)
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-white mb-2 uppercase text-[10px] tracking-wider font-mono">
              Pilot Jurisdictions
            </h4>
            <ul className="space-y-1 text-[11px] text-slate-300">
              <li>Ward A (Civil Services & Roads)</li>
              <li>Ward B (Water & Sanitation)</li>
              <li className="text-amber-300 pt-1 font-bold">Demo Municipality • G-02</li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto pt-6 border-t border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3 text-[10px] text-slate-300 font-mono">
          <span>© 2026 GovFix Civic Systems. All grievance transitions logged with SHA-256 idempotency.</span>
          <span>Policy: DEMO-PILOT-V3 • Supabase PostgreSQL</span>
        </div>
      </footer>
    </div>
  );
}
