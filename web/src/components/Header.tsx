import type React from "react";
import type { User } from "../api";
import { human } from "../api";

export function Header({
  user,
  logout,
  busy,
  notificationCount = 0,
  onOpenNotifications,
}: {
  user: User | null;
  logout: () => void;
  busy: boolean;
  notificationCount?: number;
  onOpenNotifications?: () => void;
}) {
  const roleDisplay = user
    ? [...new Set(user.roles.map((r) => human(r.role)))].join(" · ")
    : "Citizen";

  return (
    <header className="fixed top-0 left-0 right-0 h-16 z-50 bg-[#f8f9ff]/90 backdrop-blur-xl border-b border-[#d9cdba] shadow-[0_1px_8px_rgba(0,0,0,0.04)] flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#f77f00] flex items-center justify-center text-white shadow-sm shrink-0">
          <span className="material-symbols-outlined text-[22px]">
            account_balance
          </span>
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline font-semibold text-sm md:text-base text-[#0b1c30] tracking-tight">
              Fictional Demo Municipality
            </span>
            <span className="px-2 py-0.5 rounded bg-[#e5eeff] text-[#434655] font-mono text-[10px] tracking-wide uppercase font-semibold">
              Demo policy
            </span>
          </div>
          <span className="hidden sm:inline text-[11px] text-[#434655]">
            GovFix Central Grievance Dispatch & Public SLA Engine
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#dce9ff] text-[#0b1c30] text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-[#f77f00] animate-pulse"></span>
          <span>Ward A & B • Operations</span>
        </div>

        {user && (
          <>
            <button
              onClick={onOpenNotifications}
              className="relative p-2 text-[#434655] hover:text-[#0b1c30] hover:bg-[#e5eeff] rounded-lg transition-colors cursor-pointer"
              title="Notifications & SLA Alerts"
            >
              <span className="material-symbols-outlined text-[20px]">
                notifications
              </span>
              {notificationCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#ba1a1a] rounded-full ring-2 ring-white"></span>
              )}
            </button>

            <div className="flex items-center gap-3 pl-2 border-l border-[#d9cdba]/50">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-semibold text-[#0b1c30] leading-tight">
                  {user.display_name}
                </div>
                <div className="text-[11px] text-[#434655] leading-tight">
                  {roleDisplay}
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-[#f77f00] flex items-center justify-center text-white font-medium text-xs shadow-sm">
                <span className="material-symbols-outlined text-[18px]">
                  person
                </span>
              </div>
              <button
                onClick={logout}
                disabled={busy}
                className="px-2.5 py-1 text-xs font-medium rounded border border-[#d9cdba] text-[#434655] hover:bg-[#ffdad6] hover:text-[#ba1a1a] transition-colors"
                title="Sign out of GovFix"
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
