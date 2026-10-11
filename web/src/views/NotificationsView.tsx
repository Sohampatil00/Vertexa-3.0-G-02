import React, { useState, useEffect } from "react";
import type { Case } from "../api";
import { api, date, human } from "../api";

type Notice = {
  threshold: string | null;
  new_deadline: string | null;
  reason: string | null;
  id: string;
  case_id: string;
  kind: string;
  created_at: string;
  timezone: string;
};

export function NotificationsView({
  token,
  onOpenCase,
}: {
  token: string;
  onOpenCase: (id: string) => void;
}) {
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    api<{ notifications: Notice[] }>(token, `/notifications?offset=${offset}`)
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
  }, [token, offset]);

  return (
    <div className="flex flex-col w-full gap-6">
      <div className="flex items-center justify-between pb-2 border-b border-[#d9cdba]/50">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[#0b1c30]">
            SLA Notifications & Operational Broadcasts
          </h1>
          <p className="text-xs text-[#434655]">
            Immutable log of statutory threshold notices, deadline alerts, and
            citizen escalations.
          </p>
        </div>
        <span className="font-mono text-xs bg-[#eff4ff] px-2.5 py-1 rounded border border-[#d9cdba]">
          POLLER: 30s
        </span>
      </div>

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
              Statutory notices will appear here as cases cross SLA thresholds.
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
