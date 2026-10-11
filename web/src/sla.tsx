import { useEffect, useState } from "react";
import { api, date, human, type Case } from "./api";
import { cn, secondary, button, Field, ErrorText } from "./ui";

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
type Delivery = {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  last_error: string | null;
  next_attempt_at: string | null;
};
type Sla = {
  original_deadline: string;
  escalation_level: number;
  thresholds: {
    key: string;
    threshold_at: string;
    observed_at: string;
    deadline: string;
  }[];
  deliveries: Delivery[];
};
export function Inbox({
  token,
  revision,
  openCase,
}: {
  token: string;
  revision: number;
  openCase: (id: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [items, setItems] = useState<Notice[]>([]),
    [offset, setOffset] = useState(0),
    [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let live = true;
    setBusy(true);
    setError("");
    api<{ notifications: Notice[] }>(token, `/notifications?offset=${offset}`)
      .then((result) => {
        if (live) setItems(result.notifications);
      })
      .catch((err) => {
        if (live) setError(err.message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [token, open, offset, refresh, revision]);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          className={secondary}
          aria-expanded={open}
          aria-controls="notification-inbox"
          onClick={() => setOpen((v) => !v)}
        >
          Notifications
        </button>
        {open && (
          <button
            className={secondary}
            onClick={() => setRefresh((v) => v + 1)}
          >
            Refresh notifications
          </button>
        )}
      </div>
      {open && (
        <div id="notification-inbox" className="mt-4 space-y-3">
          <ErrorText message={error} />
          {busy ? (
            <p role="status">Loading notifications…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-slate-500">
              No notifications yet. Refresh after the worker processes new
              events.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    className="w-full py-3 text-left hover:bg-slate-50"
                    onClick={() => openCase(item.case_id)}
                  >
                    <p className="text-sm font-medium capitalize">
                      {human(item.threshold || item.kind)}
                    </p>
                    {item.new_deadline && (
                      <p className="mt-1 text-xs tabular-nums">
                        New deadline: {date(item.new_deadline, item.timezone)}
                      </p>
                    )}
                    {item.reason && (
                      <p className="mt-1 text-sm text-slate-600">
                        {item.reason}
                      </p>
                    )}
                    <p className="mt-1 break-all text-xs text-slate-500 tabular-nums">
                      {date(item.created_at, item.timezone)} · {item.case_id}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-between">
            <button
              className={secondary}
              disabled={offset === 0 || busy}
              onClick={() => setOffset((v) => Math.max(0, v - 20))}
            >
              Previous notifications
            </button>
            <button
              className={secondary}
              disabled={items.length < 20 || busy}
              onClick={() => setOffset((v) => v + 20)}
            >
              Next notifications
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
export function SlaPanel({
  token,
  item,
  revision,
  canRetry,
  retry,
  busy,
  commandError,
}: {
  token: string;
  item: Case;
  revision: number;
  canRetry: boolean;
  retry: (body: unknown) => void;
  busy: boolean;
  commandError: string;
}) {
  const [data, setData] = useState<Sla | null>(null),
    [error, setError] = useState(""),
    [offset, setOffset] = useState(0),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    api<Sla>(token, `/cases/${item.id}/sla?offset=${offset}`)
      .then((result) => {
        if (live) setData(result);
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
  }, [token, item.id, item.version, revision, offset]);
  return (
    <section className="space-y-4 border-t border-slate-200 pt-5">
      <h3 className="font-semibold">SLA and escalation</h3>
      <ErrorText message={error} />
      {loading ? (
        <p role="status" className="text-sm">
          Loading SLA history…
        </p>
      ) : (
        data && (
          <>
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span
                className={cn(
                  "font-medium",
                  item.sla_status === "OVERDUE"
                    ? "text-red-700"
                    : "text-slate-700",
                )}
              >
                {human(item.sla_status)}
              </span>
              <span className="tabular-nums">
                Escalation level {data.escalation_level}
              </span>
            </div>
            <p className="text-xs text-slate-500 tabular-nums">
              Original deadline: {date(data.original_deadline, item.timezone)} (
              {item.timezone})
            </p>
            <ol className="space-y-2">
              {data.thresholds.map((threshold) => (
                <li key={threshold.key} className="rounded-md bg-slate-50 p-3">
                  <p className="text-sm font-medium capitalize">
                    {human(threshold.key)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 tabular-nums">
                    Crossed {date(threshold.threshold_at, item.timezone)} ·
                    Recorded {date(threshold.observed_at, item.timezone)}
                  </p>
                </li>
              ))}
            </ol>
            {(data.deliveries.length > 0 || offset > 0) && (
              <div>
                <h3 className="mb-3 text-sm font-semibold">
                  Notification delivery
                </h3>
                <ul className="space-y-3">
                  {data.deliveries.map((message) => (
                    <li
                      key={message.id}
                      className="rounded-md border border-slate-200 p-3"
                    >
                      <p className="text-sm capitalize">
                        {human(message.kind)} ·{" "}
                        <span
                          className={
                            message.status === "FAILED"
                              ? "font-semibold text-red-700"
                              : "text-slate-600"
                          }
                        >
                          {human(message.status)}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-slate-500 tabular-nums">
                        Attempts: {message.attempts}
                        {message.next_attempt_at &&
                          ` · Next retry: ${date(message.next_attempt_at, item.timezone)}`}
                      </p>
                      {message.last_error && (
                        <p className="mt-2 text-sm text-red-700">
                          {human(message.last_error)}
                        </p>
                      )}
                      {message.status === "FAILED" && canRetry && (
                        <form
                          className="mt-3 space-y-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const fields = new FormData(e.currentTarget);
                            retry({
                              message_id: message.id,
                              reason: fields.get("reason"),
                            });
                          }}
                        >
                          <Field label="Retry reason">
                            <input name="reason" required maxLength={2000} />
                          </Field>
                          <ErrorText message={commandError} />
                          <button className={button} disabled={busy}>
                            Retry delivery
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex justify-between">
                  <button
                    className={secondary}
                    disabled={offset === 0 || loading}
                    onClick={() => setOffset((v) => Math.max(0, v - 50))}
                  >
                    Previous deliveries
                  </button>
                  <button
                    className={secondary}
                    disabled={data.deliveries.length < 50 || loading}
                    onClick={() => setOffset((v) => v + 50)}
                  >
                    Next deliveries
                  </button>
                </div>
              </div>
            )}
          </>
        )
      )}
    </section>
  );
}
