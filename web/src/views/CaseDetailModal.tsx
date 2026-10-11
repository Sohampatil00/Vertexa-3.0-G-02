import React, { useState, useEffect, useRef } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import type {
  Case,
  Operations,
  Event,
  Evidence,
  Resolution,
  User,
} from "../api";
import { api, ApiError, command, date, human } from "../api";
import { SlaPanel } from "../sla";
import { StatusBadge, ErrorText, Field } from "../ui";

export function CaseDetailModal({
  token,
  item,
  user,
  onClose,
  onSaved,
  expired,
  readOnly = false,
}: {
  token: string;
  item: Case;
  user: User;
  onClose: () => void;
  onSaved: (item: Case) => void;
  expired: () => void;
  readOnly?: boolean;
}) {
  const [current, setCurrent] = useState(item);
  const [ops, setOps] = useState<Operations | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [disputeStatement, setDisputeStatement] = useState<string | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  // Command execution
  const [busy, setBusy] = useState(false);
  const [cmdError, setCmdError] = useState("");
  const attempt = useRef<{ digest: string; key: string } | null>(null);

  async function runCommand(operation: string, body: unknown) {
    setBusy(true);
    setCmdError("");
    const digest = JSON.stringify([
      current.id,
      current.version,
      operation,
      body,
    ]);
    if (attempt.current?.digest !== digest) {
      attempt.current = { digest, key: crypto.randomUUID() };
    }
    try {
      const result = await command(
        token,
        current,
        operation,
        body,
        attempt.current.key,
      );
      attempt.current = null;
      setCurrent(result.case);
      setAction("");
      onSaved(result.case);
      setRevision((r) => r + 1);
    } catch (err) {
      setCmdError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

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

  const available = (readOnly ? [] : actions).filter((a) =>
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
    <div className="fixed inset-0 z-50 bg-[#0b1c30]/50 backdrop-blur-sm flex items-center justify-center p-4 md:p-6 overflow-y-auto">
      <div className="bg-white rounded-xl border border-[#d9cdba] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="p-4 md:px-6 bg-[#eff4ff] border-b border-[#d9cdba] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-xs font-bold bg-[#e5eeff] text-[#0037b0] px-2.5 py-1 rounded">
              Case {current.id}
            </span>
            <StatusBadge state={current.workflow_state} />
            <span className="text-xs text-[#434655]">v{current.version}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRevision((r) => r + 1)}
              className="p-1.5 rounded hover:bg-[#dce9ff] text-[#434655]"
              title="Refresh case"
              aria-label="Refresh case"
            >
              <span className="material-symbols-outlined text-[18px]">
                refresh
              </span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-[#ffdad6] text-[#434655] hover:text-[#ba1a1a]"
              title="Close modal"
              aria-label="Close modal"
            >
              <span className="material-symbols-outlined text-[20px]">
                close
              </span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <ErrorText message={error} />
          <ErrorText message={cmdError} />

          {loading ? (
            <div className="py-12 text-center text-xs text-[#434655]">
              <span className="material-symbols-outlined text-3xl animate-spin text-[#f77f00] mb-2">
                sync
              </span>
              <p>Loading case telemetry and operations…</p>
            </div>
          ) : (
            ops && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                {/* Left/Main Column: Case Details & Actions */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Summary Box */}
                  <div className="p-4 rounded-lg bg-[#eff4ff] border border-[#d9cdba]/50">
                    <h2 className="text-base font-bold text-[#0b1c30]">
                      {current.description}
                    </h2>
                    <p className="text-xs text-[#434655] mt-1">
                      Location: {current.location}
                    </p>

                    <dl className="grid grid-cols-2 gap-3 mt-4 text-xs pt-3 border-t border-[#d9cdba]/40">
                      <div>
                        <dt className="text-[10px] text-[#434655] uppercase font-bold">
                          Ward Jurisdiction
                        </dt>
                        <dd className="font-semibold text-[#0b1c30] mt-0.5">
                          Ward {current.ward}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] text-[#434655] uppercase font-bold">
                          Assigned Department
                        </dt>
                        <dd className="font-semibold text-[#0b1c30] mt-0.5">
                          {human(current.department)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] text-[#434655] uppercase font-bold">
                          Assigned Officer
                        </dt>
                        <dd className="font-semibold text-[#0b1c30] mt-0.5">
                          {ops.owner_name || "Awaiting assignment"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] text-[#434655] uppercase font-bold">
                          Current SLA Deadline
                        </dt>
                        <dd
                          className={`font-mono font-bold mt-0.5 ${current.sla_status === "OVERDUE" ? "text-[#ba1a1a]" : "text-[#0037b0]"}`}
                        >
                          {date(current.current_deadline, current.timezone)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {/* Submitted Resolution Note */}
                  {resolution && (
                    <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 mb-1">
                        <span className="material-symbols-outlined text-[16px]">
                          check_circle
                        </span>
                        <span>Field Resolution Submitted</span>
                      </div>
                      <p className="text-xs text-emerald-800 leading-relaxed whitespace-pre-wrap">
                        {resolution.note}
                      </p>
                      <span className="font-mono text-[10px] text-emerald-700 block mt-2">
                        Submitted:{" "}
                        {date(resolution.submitted_at, current.timezone)}
                      </span>
                    </div>
                  )}

                  {/* Citizen Dispute Statement */}
                  {disputeStatement && (
                    <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 mb-1">
                        <span className="material-symbols-outlined text-[16px]">
                          report_problem
                        </span>
                        <span>Citizen Dispute Statement</span>
                      </div>
                      <p className="text-xs text-amber-800 leading-relaxed whitespace-pre-wrap">
                        {disputeStatement}
                      </p>
                    </div>
                  )}

                  {/* Citizen Verification Waiting State Notice */}
                  {current.workflow_state === "CITIZEN_VERIFICATION" && (
                    <div className="p-3.5 rounded-lg bg-[#e5eeff] text-xs text-[#0037b0] border border-[#d9cdba]/60 flex items-start gap-2">
                      <span className="material-symbols-outlined text-[18px] text-[#f77f00] shrink-0 mt-0.5">
                        info
                      </span>
                      <div>
                        <p className="font-semibold">
                          Case awaiting citizen verification sign-off.
                        </p>
                        {current.verification_alerted_at && (
                          <p>A supervisor has been alerted to the wait.</p>
                        )}
                        {current.verification_due_at && (
                          <p className="text-[11px] mt-0.5">
                            Supervisor review scheduled after{" "}
                            {date(
                              current.verification_due_at,
                              current.timezone,
                            )}{" "}
                            if unconfirmed.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Action Bar (State Machine transitions) */}
                  {available.length > 0 && (
                    <div className="p-4 rounded-lg bg-white border border-[#d9cdba] shadow-sm">
                      <span className="text-xs font-bold text-[#0b1c30] uppercase tracking-wider block mb-2.5">
                        Authorized Next Actions
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {available.map((a) => (
                          <button
                            key={a}
                            onClick={() => setAction(action === a ? "" : a)}
                            className={`px-3 py-1.5 text-xs font-semibold rounded transition-all cursor-pointer ${
                              action === a
                                ? "bg-[#f77f00] text-white shadow-sm"
                                : "bg-[#eff4ff] text-[#0b1c30] hover:bg-[#dce9ff] border border-[#d9cdba]/50"
                            }`}
                          >
                            {human(a)}
                          </button>
                        ))}
                      </div>

                      {action && (
                        <div className="mt-4 pt-4 border-t border-[#eff4ff]">
                          <ActionExecutor
                            key={action}
                            action={action}
                            current={current}
                            ops={ops}
                            evidence={evidence}
                            busy={busy}
                            run={(body) => runCommand(action, body)}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* SLA Tracker & Delivery Alerts */}
                  <div className="p-4 rounded-lg bg-white border border-[#d9cdba] shadow-sm">
                    <SlaPanel
                      token={token}
                      item={current}
                      revision={revision}
                      canRetry={
                        !readOnly && actions.includes("notification-retry")
                      }
                      retry={(body) => runCommand("notification-retry", body)}
                      busy={busy}
                      commandError={cmdError}
                    />
                  </div>

                  {/* Evidence Uploads */}
                  <div className="p-4 rounded-lg bg-white border border-[#d9cdba] shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold text-[#0b1c30] uppercase tracking-wider">
                        Cryptographic Evidence Files
                      </span>
                      <span className="text-[10px] text-[#434655]">
                        Private Supabase Storage
                      </span>
                    </div>

                    {evidence.length === 0 ? (
                      <p className="text-xs text-[#434655] italic">
                        No evidence uploaded yet.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {evidence.map((file) => (
                          <li
                            key={file.id}
                            className="p-3 rounded-lg bg-[#eff4ff] border border-[#d9cdba]/50 flex items-center justify-between text-xs"
                          >
                            <div>
                              <span className="font-semibold text-[#0b1c30]">
                                {human(file.kind)}
                              </span>
                              <span className="text-[#434655] ml-2 font-mono text-[11px]">
                                {(file.size_bytes / 1024).toFixed(1)} KB
                              </span>
                              <div className="font-mono text-[10px] text-[#434655] truncate max-w-xs mt-0.5">
                                SHA-256: {file.sha256}
                              </div>
                            </div>
                            <DownloadEvidence
                              token={token}
                              caseId={current.id}
                              file={file}
                            />
                          </li>
                        ))}
                      </ul>
                    )}

                    {!readOnly &&
                      current.owner_id === user.id &&
                      current.workflow_state === "IN_PROGRESS" && (
                        <div className="mt-4 pt-3 border-t border-[#eff4ff]">
                          <UploadEvidence
                            token={token}
                            item={current}
                            ops={ops}
                            done={() => setRevision((r) => r + 1)}
                          />
                        </div>
                      )}
                  </div>
                </div>

                {/* Right Column: Case Timeline & Ownership */}
                <div className="space-y-6">
                  {/* Timeline */}
                  <div className="p-4 rounded-lg bg-[#eff4ff] border border-[#d9cdba]/50">
                    <span className="text-xs font-bold text-[#0b1c30] uppercase tracking-wider block mb-3">
                      Audit Timeline ({events.length})
                    </span>
                    <ol className="space-y-3 relative border-l border-[#d9cdba] ml-2">
                      {events.map((e) => (
                        <li key={e.id} className="ml-3 text-xs">
                          <div className="flex items-center gap-1.5 font-semibold text-[#0b1c30]">
                            <span>{human(e.operation)}</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                                e.result === "REFUSED"
                                  ? "bg-[#ffdad6] text-[#ba1a1a]"
                                  : "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {human(e.result)}
                            </span>
                          </div>
                          <span className="font-mono text-[10px] text-[#434655] block mt-0.5">
                            {date(e.occurred_at, current.timezone)}
                          </span>
                          {e.actor_role && (
                            <span className="text-[10px] text-[#565e74] capitalize block">
                              Actor: {human(e.actor_role)}
                            </span>
                          )}
                          {e.reason_code && (
                            <span className="text-[10px] text-[#ba1a1a] block font-semibold">
                              Reason: {human(e.reason_code)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* Assignment History */}
                  {ops.assignments.length > 0 && (
                    <div className="p-4 rounded-lg bg-white border border-[#d9cdba] shadow-sm">
                      <span className="text-xs font-bold text-[#0b1c30] uppercase tracking-wider block mb-2.5">
                        Officer Assignment Log
                      </span>
                      <ul className="space-y-2 text-xs">
                        {ops.assignments.map((a, idx) => (
                          <li
                            key={idx}
                            className="p-2.5 rounded bg-[#eff4ff] border border-[#d9cdba]/40"
                          >
                            <span className="font-semibold text-[#0b1c30] block">
                              {a.ended_at
                                ? "Previous Assignment"
                                : "Active Officer"}
                            </span>
                            <p className="text-[#434655] text-[11px] mt-0.5">
                              {a.reason}
                            </p>
                            <span className="font-mono text-[10px] text-[#565e74] block mt-1">
                              Officer: {a.officer_id.slice(0, 8)}…
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function ActionExecutor({
  action,
  current,
  ops,
  evidence,
  busy,
  run,
}: {
  action: string;
  current: Case;
  ops: Operations;
  evidence: Evidence[];
  busy: boolean;
  run: (body: unknown) => void;
}) {
  const [outcome, setOutcome] = useState<"ACCEPT" | "DISPUTE">("ACCEPT");
  const [decision, setDecision] = useState<"RETAIN" | "REASSIGN">("RETAIN");
  const [confirmationBody, setConfirmationBody] = useState<unknown>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    let body: unknown;
    if (action === "validate") {
      body = {
        category: current.category,
        ward: current.ward,
        department: current.department,
        jurisdiction: ops.policy.municipality,
      };
    } else if (action === "assign") {
      body = {
        officer_id: data.get("officer"),
        department: current.department,
        reason: data.get("reason"),
      };
    } else if (action === "reject") {
      body = {
        reason_code: data.get("reason_code"),
        explanation: data.get("explanation"),
      };
    } else if (action === "deadline-extension") {
      body = {
        new_deadline: new Date(String(data.get("new_deadline"))).toISOString(),
        reason: data.get("reason"),
      };
    } else if (action === "accept-assignment") {
      body = { confirmation: true };
    } else if (action === "verification") {
      body = {
        outcome,
        confirmation: true,
        statement: outcome === "DISPUTE" ? data.get("statement") : null,
      };
    } else if (action === "review") {
      body = {
        decision,
        officer_id:
          decision === "RETAIN" ? current.owner_id : data.get("officer"),
        reason: data.get("reason"),
      };
    } else {
      body = {
        note: data.get("note"),
        evidence_refs: data.getAll("evidence"),
      };
    }
    if (
      action === "reject" ||
      action === "deadline-extension" ||
      (action === "verification" && outcome === "ACCEPT")
    ) {
      setConfirmationBody(body);
    } else run(body);
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-3 text-xs">
        {action === "validate" && (
          <p className="text-[#434655]">
            Confirm validation of this case under {ops.policy.municipality},
            Ward {current.ward}, and department {human(current.department)}.
          </p>
        )}

        {action === "assign" && (
          <div className="space-y-2">
            <Field label="Assign to Officer">
              <select
                name="officer"
                required
                defaultValue=""
                className="w-full text-xs p-2 rounded bg-white border border-[#d9cdba]"
              >
                <option value="" disabled>
                  Select on-duty officer
                </option>
                {ops.officers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Dispatch Reason">
              <textarea
                name="reason"
                required
                maxLength={2000}
                rows={2}
                className="w-full text-xs p-2 rounded bg-white border border-[#d9cdba]"
              />
            </Field>
          </div>
        )}

        {action === "reject" && (
          <div className="space-y-2">
            <Field label="Rejection Reason Code">
              <select
                name="reason_code"
                className="w-full text-xs p-2 rounded bg-white border border-[#d9cdba]"
              >
                {ops.policy.rejection_reason_codes.map((r) => (
                  <option key={r} value={r}>
                    {human(r)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Audited Explanation">
              <textarea
                name="explanation"
                required
                maxLength={2000}
                rows={2}
                className="w-full text-xs p-2 rounded bg-white border border-[#d9cdba]"
              />
            </Field>
          </div>
        )}

        {action === "deadline-extension" && (
          <div className="space-y-2">
            <Field label="New SLA Deadline">
              <input
                name="new_deadline"
                type="datetime-local"
                required
                className="w-full text-xs p-2 rounded bg-white border border-[#d9cdba]"
              />
            </Field>
            <Field label="Reason for Extension">
              <textarea
                name="reason"
                required
                maxLength={2000}
                rows={2}
                className="w-full text-xs p-2 rounded bg-white border border-[#d9cdba]"
              />
            </Field>
          </div>
        )}

        {action === "accept-assignment" && (
          <label className="flex items-center gap-2 cursor-pointer font-semibold text-[#0b1c30]">
            <input type="checkbox" required className="rounded" />
            <span>
              I accept ownership and commit to executing this grievance work
              order.
            </span>
          </label>
        )}

        {action === "resolution" && (
          <div className="space-y-2">
            <Field label="Work Completed Description">
              <textarea
                name="note"
                required
                maxLength={5000}
                rows={3}
                placeholder="Describe the physical repair or sanitation work performed..."
                className="w-full text-xs p-2 rounded bg-white border border-[#d9cdba]"
              />
            </Field>
            <div>
              <span className="text-[10px] text-[#434655] uppercase font-bold block mb-1">
                Select Attached Resolution Proof Photo
              </span>
              {evidence.length === 0 ? (
                <p className="text-[#ba1a1a] text-xs">
                  Upload a photo in the Evidence section below before submitting
                  resolution.
                </p>
              ) : (
                evidence.map((file) => (
                  <label
                    key={file.id}
                    className="flex items-center gap-2 p-1.5 rounded bg-[#eff4ff] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      name="evidence"
                      value={file.id}
                      defaultChecked
                    />
                    <span>
                      {human(file.kind)} (SHA: {file.sha256.slice(0, 10)})
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>
        )}

        {action === "verification" && (
          <div className="space-y-3">
            <div className="flex gap-4">
              <label className="flex items-center gap-2 font-semibold cursor-pointer">
                <input
                  type="radio"
                  checked={outcome === "ACCEPT"}
                  onChange={() => setOutcome("ACCEPT")}
                />
                <span>Accept & Close Case</span>
              </label>
              <label className="flex items-center gap-2 font-semibold cursor-pointer text-[#ba1a1a]">
                <input
                  type="radio"
                  checked={outcome === "DISPUTE"}
                  onChange={() => setOutcome("DISPUTE")}
                />
                <span>Dispute Resolution</span>
              </label>
            </div>
            {outcome === "DISPUTE" && (
              <Field label="What Still Needs To Be Fixed?">
                <textarea
                  name="statement"
                  required
                  rows={2}
                  placeholder="Explain why repair is incomplete..."
                  className="w-full text-xs p-2 rounded bg-white border border-[#d9cdba]"
                />
              </Field>
            )}
          </div>
        )}

        {action === "review" && (
          <div className="space-y-2">
            <div className="flex gap-4">
              <label className="flex items-center gap-2 font-semibold cursor-pointer">
                <input
                  type="radio"
                  checked={decision === "RETAIN"}
                  onChange={() => setDecision("RETAIN")}
                />
                <span>Retain Current Officer</span>
              </label>
              <label className="flex items-center gap-2 font-semibold cursor-pointer">
                <input
                  type="radio"
                  checked={decision === "REASSIGN"}
                  onChange={() => setDecision("REASSIGN")}
                />
                <span>Reassign to Another Officer</span>
              </label>
            </div>
            {decision === "REASSIGN" && (
              <Field label="Rework Officer">
                <select
                  name="officer"
                  required
                  defaultValue=""
                  className="w-full text-xs p-2 rounded bg-white border border-[#d9cdba]"
                >
                  <option value="" disabled>
                    Select officer
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
            <Field label="Supervisor Review Reason">
              <textarea
                name="reason"
                required
                rows={2}
                className="w-full text-xs p-2 rounded bg-white border border-[#d9cdba]"
              />
            </Field>
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full py-2 bg-[#f77f00] hover:bg-[#d96e00] text-white font-semibold text-xs rounded shadow-sm transition-all"
        >
          {busy ? "Executing State Transition…" : `Confirm ${human(action)}`}
        </button>
      </form>
      <AlertDialog.Root
        open={confirmationBody !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmationBody(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-black/40" />
          <AlertDialog.Content className="fixed inset-x-5 top-1/3 z-[70] mx-auto max-w-md rounded-xl bg-white p-6 shadow-xl">
            <AlertDialog.Title className="text-lg font-semibold">
              Confirm {human(action)}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-slate-600">
              {action === "reject"
                ? "This will reject and close the case with your recorded reason."
                : action === "verification"
                  ? "Accepting the resolution will close this case."
                  : "The revised deadline and reason will be recorded in the audit timeline."}
            </AlertDialog.Description>
            <div className="mt-5 flex justify-end gap-3">
              <AlertDialog.Cancel className="rounded border px-3 py-2">
                {action === "reject" ? "Keep case open" : "Cancel"}
              </AlertDialog.Cancel>
              <AlertDialog.Action
                className="rounded bg-[#f77f00] px-3 py-2 text-white"
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
    </>
  );
}

function UploadEvidence({
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const kinds = ops.policy.categories.find((c) => c.code === item.category)
    ?.resolution_evidence || ["COMPLETION_PHOTO"];

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const file = data.get("file") as File;
    setBusy(true);
    setError("");
    try {
      if (!file.size || file.size > ops.evidence_max_bytes) {
        throw new Error(
          `Select a photo under ${ops.evidence_max_bytes / 1024 / 1024} MB.`,
        );
      }
      const bytes = await file.arrayBuffer();
      const checksum = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const kind = String(data.get("kind"));
      await api(
        token,
        `/cases/${item.id}/evidence?kind=${encodeURIComponent(kind)}`,
        {
          method: "POST",
          body: file,
          headers: {
            "Content-Type": file.type,
            "X-Content-SHA256": checksum,
            "Idempotency-Key": crypto.randomUUID(),
            "If-Match": `"${item.version}"`,
          },
        },
      );
      form.reset();
      done();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleUpload} className="space-y-2 text-xs">
      <span className="font-bold text-[#0b1c30] block">
        Upload Ground Evidence Photo
      </span>
      <div className="grid grid-cols-2 gap-2">
        <select
          name="kind"
          className="p-2 rounded bg-white border border-[#d9cdba]"
        >
          {kinds.map((k) => (
            <option key={k} value={k}>
              {human(k)}
            </option>
          ))}
        </select>
        <input
          name="file"
          aria-label="Resolution photo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          required
          className="p-1 rounded bg-white border border-[#d9cdba]"
        />
      </div>
      <ErrorText message={error} />
      <button
        disabled={busy}
        className="px-3 py-1.5 bg-[#f77f00] hover:bg-[#d96e00] text-white font-semibold rounded text-xs"
      >
        {busy ? "Verifying & Uploading…" : "Upload Evidence"}
      </button>
    </form>
  );
}

function DownloadEvidence({
  token,
  caseId,
  file,
}: {
  token: string;
  caseId: string;
  file: Evidence;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const response = await fetch(`/v1/cases/${caseId}/evidence/${file.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Download failed");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${file.kind.toLowerCase()}.${file.content_type.split("/")[1] || "jpg"}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      alert("Failed to download evidence.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={download}
      disabled={busy}
      className="px-2.5 py-1 rounded bg-white border border-[#d9cdba] hover:bg-[#dce9ff] text-[#0b1c30] font-semibold text-xs"
    >
      {busy ? "Downloading…" : "Download"}
    </button>
  );
}
