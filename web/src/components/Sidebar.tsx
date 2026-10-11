import type React from "react";
import type { User } from "../api";

export type DashboardView =
  | "citizen-overview"
  | "intake-queue"
  | "dispatcher"
  | "field-officer"
  | "supervisor-queue"
  | "ward-head-oversight"
  | "auditor-portal"
  | "notifications";

interface NavItem {
  id: DashboardView;
  label: string;
  icon: string;
  roleHint?: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "citizen-overview",
    label: "Citizen Overview",
    icon: "analytics",
    roleHint: "Citizen",
  },
  {
    id: "intake-queue",
    label: "Intake Queue",
    icon: "inbox",
    roleHint: "Intake Officer",
  },
  {
    id: "dispatcher",
    label: "Dispatcher",
    icon: "alt_route",
    roleHint: "Dispatcher",
  },
  {
    id: "field-officer",
    label: "Field Officer",
    icon: "engineering",
    roleHint: "Field Crew",
  },
  {
    id: "supervisor-queue",
    label: "Supervisor Queue",
    icon: "verified",
    roleHint: "Supervisor",
  },
  {
    id: "ward-head-oversight",
    label: "Ward Head Oversight",
    icon: "account_balance",
    roleHint: "Ward Executive",
  },
  {
    id: "auditor-portal",
    label: "Auditor Portal",
    icon: "policy",
    roleHint: "Governance & Audit",
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: "notifications_active",
    roleHint: "SLA Alerts",
  },
];

export function Sidebar({
  currentView,
  onSelectView,
  user,
}: {
  currentView: DashboardView;
  onSelectView: (view: DashboardView) => void;
  user: User;
}) {
  const currentItem = NAV_ITEMS.find((item) => item.id === currentView);
  const roles: Partial<Record<DashboardView, string>> = {
    "citizen-overview": "CITIZEN",
    "intake-queue": "INTAKE_OFFICER",
    dispatcher: "DISPATCHER",
    "field-officer": "OFFICER",
    "supervisor-queue": "SUPERVISOR",
    "ward-head-oversight": "WARD_HEAD",
    "auditor-portal": "AUDITOR",
  };
  const visibleItems = NAV_ITEMS.filter(
    (item) =>
      !roles[item.id] ||
      user.roles.some((grant) => grant.role === roles[item.id]),
  );

  return (
    <aside className="relative mt-16 md:mt-0 md:fixed left-0 md:top-16 md:bottom-0 w-full md:w-64 bg-[#eff4ff] border-r border-[#d9cdba] flex flex-col z-40 overflow-y-auto">
      {/* Role Switch Sandbox */}
      <div className="p-4 border-b border-[#d9cdba]/50">
        <div className="px-3 py-2.5 rounded-lg bg-[#e5eeff] border border-[#d9cdba]/60 mb-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#434655] uppercase tracking-wider font-semibold block">
              Role Switch Sandbox
            </span>
            <span className="material-symbols-outlined text-[16px] text-[#f77f00]">
              swap_horiz
            </span>
          </div>
          <select
            aria-label="Switch dashboard"
            value={currentView}
            onChange={(e) => onSelectView(e.target.value as DashboardView)}
            className="w-full mt-1.5 bg-white text-xs font-semibold text-[#0b1c30] rounded border border-[#d9cdba] px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#f77f00] cursor-pointer"
          >
            {visibleItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} ({item.roleHint})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Navigation Links */}
      <nav
        aria-label="Dashboard navigation"
        className="hidden md:flex flex-1 px-3 py-4 flex-col gap-1"
      >
        {visibleItems.map((item) => {
          const isActive = currentView === item.id;
          return (
            <button
              aria-label={item.label}
              key={item.id}
              onClick={() => onSelectView(item.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all duration-150 text-left ${
                isActive
                  ? "bg-[#f77f00] text-white shadow-sm"
                  : "text-[#434655] hover:bg-[#dce9ff] hover:text-[#0b1c30]"
              }`}
            >
              <span
                className={`material-symbols-outlined text-[20px] ${
                  isActive ? "text-white" : "text-[#565e74]"
                }`}
              >
                {item.icon}
              </span>
              <span className="flex-1 truncate">{item.label}</span>
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0"></span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Node Status Badge */}
      <div className="hidden md:block p-4 border-t border-[#d9cdba]/50">
        <div className="p-3 rounded-lg bg-[#e5eeff] flex flex-col gap-1 border border-[#d9cdba]/40">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#f77f00] animate-pulse"></span>
            <span className="text-[11px] text-[#0b1c30] font-semibold uppercase tracking-wider">
              Node Active
            </span>
          </div>
          <span className="font-mono text-[11px] text-[#434655]">
            SLA-SYS-NODE-04 • Asia/Kolkata
          </span>
        </div>
      </div>
    </aside>
  );
}
