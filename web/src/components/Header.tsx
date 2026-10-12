import type React from "react";
import type { DashboardRole, User } from "../api";
import { human } from "../api";
import { AccessibilityControls } from "../accessibility";
import { type DashboardView, DASHBOARD_ROLES } from "./Sidebar";

export function Header({
  user,
  logout,
  busy,
  notificationCount = 0,
  currentView,
  activeDashboard,
  onSelectView,
  onOpenNotifications,
  activeRole,
}: {
  user: User | null;
  logout: () => void;
  busy: boolean;
  notificationCount?: number;
  currentView?: DashboardView;
  activeDashboard?: DashboardView;
  onSelectView?: (view: DashboardView) => void;
  onOpenNotifications?: () => void;
  activeRole?: DashboardRole;
}) {
  const roleDisplay = activeRole
    ? human(activeRole)
    : user
      ? [...new Set(user.roles.map((r) => human(r.role)))].join(" · ")
      : "Citizen";

  const isNotificationsActive = currentView === "notifications";

  return (
    <header className="fixed top-0 left-0 right-0 min-h-16 z-50 bg-[#f8f9ff]/90 backdrop-blur-xl border-b border-[#d9cdba] shadow-[0_1px_8px_rgba(0,0,0,0.04)] flex items-center justify-between gap-2 px-3 py-2 sm:px-6">
      <button
        type="button"
        onClick={() => {
          if (activeDashboard && onSelectView) {
            onSelectView(activeDashboard);
          }
        }}
        className="flex items-center gap-3 text-left focus:outline-none cursor-pointer group"
        title="Return to main dashboard"
      >
        <div className="flex items-center justify-center py-1 px-2.5 bg-white rounded-xl border border-[#d9cdba] shadow-xs shrink-0 group-hover:border-[#f77f00] transition-colors">
          <img
            src="/app/civicvoice-logo.png"
            alt="CivicVoice Logo"
            className="h-8 sm:h-9 w-auto object-contain shrink-0"
          />
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline font-semibold text-sm md:text-base text-[#0b1c30] tracking-tight group-hover:text-[#0037b0] transition-colors">
              Fictional Demo Municipality
            </span>
            <span className="hidden sm:inline px-2 py-0.5 rounded bg-[#e5eeff] text-[#434655] font-mono text-[10px] tracking-wide uppercase font-semibold">
              Demo policy
            </span>
          </div>
          <span className="hidden sm:inline text-[11px] text-[#434655]">
            CivicVoice Municipal Grievance Portal
          </span>
        </div>
      </button>

      <nav aria-label="Dashboard navigation" className="flex items-center gap-2 sm:gap-3">
        <AccessibilityControls />

        {user && (
          <>
            {isNotificationsActive && activeDashboard && onSelectView && (
              <button
                type="button"
                onClick={() => onSelectView(activeDashboard)}
                className="hidden sm:flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#eff4ff] border border-[#d9cdba] text-[#0037b0] hover:bg-[#dce9ff] transition-colors cursor-pointer"
                title="Return to your dashboard"
              >
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                  arrow_back
                </span>
                <span>Dashboard</span>
              </button>
            )}

            <button
              disabled={busy}
              onClick={() => {
                if (isNotificationsActive && activeDashboard && onSelectView) {
                  onSelectView(activeDashboard);
                } else if (onOpenNotifications) {
                  onOpenNotifications();
                } else if (onSelectView) {
                  onSelectView("notifications");
                }
              }}
              className={`relative p-2 rounded-lg transition-colors cursor-pointer ${
                isNotificationsActive
                  ? "bg-[#0037b0] text-white shadow-xs"
                  : "text-[#434655] hover:text-[#0b1c30] hover:bg-[#e5eeff]"
              }`}
              title={isNotificationsActive ? "Return to Dashboard" : "Notifications"}
              aria-label={isNotificationsActive ? "Return to Dashboard" : "Open notifications"}
            >
              <span className="material-symbols-outlined text-[20px]">
                {isNotificationsActive ? "dashboard" : "notifications"}
              </span>
              {notificationCount > 0 && !isNotificationsActive && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#ba1a1a] rounded-full ring-2 ring-white"></span>
              )}
            </button>

            <div className="flex items-center gap-3 pl-2 border-l border-[#d9cdba]/50">
              <div className="text-right hidden sm:block">
                <div
                  data-no-translate
                  className="text-xs font-semibold text-[#0b1c30] leading-tight"
                >
                  {user.display_name}
                </div>
                {user.roles.length > 1 && onSelectView ? (
                  <select
                    disabled={busy}
                    aria-label="Switch dashboard"
                    value={activeDashboard}
                    onChange={(e) => onSelectView(e.target.value as DashboardView)}
                    className="mt-0.5 bg-[#e5eeff] text-[11px] font-semibold text-[#0b1c30] rounded border border-[#d9cdba] px-1.5 py-0.5 cursor-pointer focus:outline-none"
                  >
                    {user.roles.map((grant) => {
                      const view = Object.entries(DASHBOARD_ROLES).find(
                        ([_, r]) => r === grant.role,
                      )?.[0] as DashboardView;
                      return (
                        <option key={grant.role} value={view}>
                          {human(grant.role)}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <div className="text-[11px] text-[#434655] leading-tight">
                    {roleDisplay}
                  </div>
                )}
              </div>
              <div className="hidden sm:flex w-8 h-8 rounded-full bg-[#f77f00] items-center justify-center text-white font-medium text-xs shadow-sm">
                <span className="material-symbols-outlined text-[18px]">
                  person
                </span>
              </div>
              <button
                onClick={logout}
                disabled={busy}
                aria-label="Sign out"
                className="px-1.5 py-1 sm:px-2.5 text-xs font-medium rounded border border-[#d9cdba] text-[#434655] hover:bg-[#ffdad6] hover:text-[#ba1a1a] transition-colors"
                title="Sign out of CivicVoice"
              >
                <span
                  className="sm:hidden material-symbols-outlined"
                  aria-hidden="true"
                >
                  logout
                </span>
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </>
        )}
      </nav>
    </header>
  );
}
