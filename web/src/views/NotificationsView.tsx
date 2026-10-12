import React, { useState, useEffect } from "react";
import type { DashboardRole } from "../api";
import { api, date, human } from "../api";
import { ErrorText } from "../ui";

type Notice = {
  threshold: string | null;
  new_deadline: string | null;
  reason: string | null;
  id: string;
  case_id: string;
  kind: string;
  created_at: string;
  timezone: string;
  intake_officer: string | null;
};

export function NotificationsView({
  token,
  role,
  onOpenCase,
  onBackToDashboard,
}: {
  token: string;
  role: DashboardRole;
  onOpenCase: (id: string) => void;
  onBackToDashboard?: () => void;
}) {
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(
      () => setRevision((value) => value + 1),
      15000,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let live = true;
    if (revision === 0) setLoading(true);
    setError("");
    api<{ notifications: Notice[] }>(token, `/notifications?offset=${offset}`, {
      role,
    })
      .then((res) => {
        if (live) setItems(res.notifications);
      })
      .catch((err) => {
        if (live) setError(err.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [token, role, offset, revision]);

  return (
    <div className="flex flex-col w-full gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#d9cdba]/50">
        <div className="flex items-center gap-3">
          {onBackToDashboard && (
            <button
              type="button"
              onClick={onBackToDashboard}
              aria-label="Back to Dashboard"
              className="px-3 py-1.5 rounded-lg border border-[#d9cdba] bg-white hover:bg-[#eff4ff] text-[#0b1c30] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs shrink-0"
              title="Return to your main dashboard"
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                arrow_back
              </span>
              <span>Back to Dashboard</span>
            </button>
          )}
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-[#0b1c30]">
              {role === "CITIZEN"
                ? "My report notifications"
                : "Workflow Notifications & SLA Alerts"}
            </h1>
            <p className="text-xs text-[#434655]">
              {role === "CITIZEN"
                ? "Updates and resolution requests for your reports."
                : "Intake handoffs, deadline alerts, and other case notifications."}
            </p>
          </div>
        </div>
        <span className="self-start sm:self-center font-mono text-xs bg-[#eff4ff] px-2.5 py-1 rounded border border-[#d9cdba]">
          Updates every 15s
        </span>
      </div>

      {error && <ErrorText message={error} />}

      <div className="bg-white rounded-xl border border-[#d9cdba] shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-[#434655]">
            <span className="material-symbols-outlined text-3xl animate-spin text-[#f77f00] mb-2">
              sync
            </span>
            <p>Loading notification events…</p>
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-[#434655]">
            <span className="material-symbols-outlined text-4xl mb-2 text-emerald-600">
              notifications_none
            </span>
            <p className="text-sm font-semibold text-[#0b1c30]">
              No notifications recorded
            </p>
            <p className="text-xs text-[#434655] mt-0.5">
              {role === "CITIZEN"
                ? "Updates to your reports will appear here."
                : "Workflow handoffs and SLA notices will appear here."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#eff4ff]">
            {items.map((notice) => (
              <div
                key={notice.id}
                className="p-5 hover:bg-[#f8f9ff] transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3 flex-1">
                  <div className="w-10 h-10 rounded-lg bg-[#e5eeff] text-[#0037b0] flex items-center justify-center shrink-0 mt-0.5">
                    <span className="material-symbols-outlined text-[20px]">
                      {notice.threshold ? "timer" : "campaign"}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-bold text-[#0037b0] bg-[#e5eeff] px-2 py-0.5 rounded">
                        Case {notice.case_id.slice(0, 8)}…
                      </span>
                      <span className="text-xs font-semibold text-[#0b1c30]">
                        {human(notice.kind)}
                      </span>
                    </div>
                    {notice.threshold && (
                      <p className="text-xs text-[#434655]">
                        SLA Threshold Alert:{" "}
                        <strong className="text-[#0b1c30]">
                          {human(notice.threshold)}
                        </strong>
                      </p>
                    )}
                    {notice.reason && (
                      <p className="text-xs text-[#434655] mt-0.5">
                        {notice.reason}
                      </p>
                    )}
                    {notice.kind === "INTAKE_VALIDATED" && (
                      <p className="text-xs text-[#434655] mt-0.5">
                        {notice.intake_officer || "Intake officer"} validated
                        this grievance and sent it to dispatch for officer
                        assignment.
                      </p>
                    )}
                    <span className="font-mono text-[10px] text-[#565e74] mt-1 block">
                      Dispatched: {date(notice.created_at, notice.timezone)}
                    </span>
                  </div>
                </div>

                <button
                  aria-label={`Open ${human(notice.kind)} notification`}
                  onClick={() => onOpenCase(notice.case_id)}
                  className="px-3.5 py-1.5 bg-[#eff4ff] hover:bg-[#dce9ff] text-[#0b1c30] text-xs font-semibold rounded border border-[#d9cdba] shrink-0 self-start md:self-auto cursor-pointer"
                >
                  Inspect Case
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
