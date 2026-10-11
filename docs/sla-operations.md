# SLA monitoring and in-app notifications

Phase 3 implements elapsed-hour SLA monitoring against each case’s immutable pinned policy, audited supervisor extensions, and durable in-app delivery. These remain fictional demo rules; business-day calendars and official municipal approvals are not implemented.

## Run the worker

Build the client, apply migrations, and start the API using [backend setup](./backend.md). In another terminal, from the same repository root and with the same database configuration:

```sh
uv run govfix worker --once
uv run govfix worker --poll-seconds 30 --batch-size 100
```

`--once` processes one bounded batch. The continuous command polls until interrupted with Ctrl+C. Each cycle prints JSON counts for cases checked, thresholds recorded, and deliveries/retries/failures. A transient database failure prints `DEPENDENCY_UNAVAILABLE`; the continuous worker keeps polling. Run it under a process supervisor for sustained availability. The API does not start a worker automatically.

Migration `0004` schedules existing open cases for their first evaluation without rewriting deadlines, case versions, or policy references. New cases schedule their first threshold immediately. Indexed next-check times avoid scanning every open case on every poll. A delayed worker catches all crossed thresholds in one transaction.

## Timing and history

The demo clock starts at submission and runs until `CLOSED` or `REJECTED`, including citizen verification. Warning occurs at 80% of the current elapsed duration, supervisor escalation at 100%, and ward-head escalation at 150%. The worker loads the case’s pinned thresholds; importing a new active policy does not alter an existing case.

Each threshold has a database-unique `(case_id, policy_version, threshold_key)` record. Warning preserves escalation level; supervisor and ward-head thresholds raise it to at least 1 and 2. Each recorded threshold increments the case version, writes an audit event, and queues a notification atomically. The workflow state and assigned owner stay unchanged. A case command submitted with an older version must refresh and retry.

Threshold records and their audit history reject ordinary database update/delete operations. They retain the deadline in force when the threshold was crossed and the time the worker observed it. A later extension never deletes a prior warning or breach and never reduces escalation level. Each threshold is recorded once per case/policy, including after extensions.

## Supervisor extensions

Select **deadline extension** in a nonterminal case. Enter a future deadline, a reason, and confirm the change. The input labels the device timezone; display dates use the case’s municipal timezone. The API requires an explicit timezone offset, scoped supervisor access, an idempotency key, and the current case version.

The new deadline must be later than both the current deadline and now, and within ten years of submission (a demo implementation bound, not an approved extension allowance). The original deadline stays unchanged. Before extending, the same transaction records any thresholds already crossed, even if the worker was offline. The audit retains old/new deadlines and the reason; a notification carrying the new deadline and reason is queued for the citizen. Remaining thresholds are rescheduled using the extended duration from submission.

## Notification delivery and retry

The implemented channel is an authenticated **in-app inbox**. No SMS, email, or voice provider is configured. A successful delivery means a durable inbox record was created, not that the person read it. Inbox reads recheck current case scope, so a revoked grant cannot reveal an old case through its notification.

Warning recipients are the currently assigned active officer at delivery time. Escalations go to active users holding the pinned recipient role in the case’s ward and department. Overlapping grants produce one delivery per person. Citizen verification and deadline-extension messages go to the case’s citizen; dispute review messages go to scoped supervisors. Missing eligible recipients remain a visible delivery failure.

Delivery locks the case before the outbox row. PostgreSQL uses `SKIP LOCKED`; actor commands use `FOR NO KEY UPDATE` to retain actor serialization while permitting notification foreign-key checks. SQLite reserves its writer lock before reading. See [SQLAlchemy’s locking documentation](https://docs.sqlalchemy.org/en/20/core/selectable.html#sqlalchemy.sql.expression.Select.with_for_update).

Inbox records, delivery status, and delivery audit commit together. A unique message/recipient constraint and row locks prevent duplicate local delivery. Database or audit failure rolls back the attempt and leaves the job eligible for retry. This guarantee covers the database inbox; a future external provider needs its own delivery idempotency contract.

Recipient or unsupported-adapter failures retry after 30, 60, 120, and 240 seconds, then become `FAILED` after five attempts. Supervisors, ward heads, and auditors can inspect status, attempt count, safe error code, and next retry time in **SLA and escalation**. A scoped supervisor can reset a failed delivery with a reason and current case version. The retry command is audited and does not replay an escalation or extension. Historical failure attempts remain in the audit trail even though the new retry cycle resets its counter.

## API and validation

- `GET /v1/notifications?limit=20&offset=0`: caller’s inbox, filtered by current case access.
- `GET /v1/cases/{id}/sla`: original/current deadlines, recorded thresholds, escalation level; delivery diagnostics only for scoped supervisors, ward heads, and auditors.
- `POST /v1/cases/{id}/deadline-extension`: `new_deadline` with offset, `reason`.
- `POST /v1/cases/{id}/notification-retry`: `message_id`, `reason`.

Both commands use `Idempotency-Key` and `If-Match`. Exact retries return the original result. Only `FAILED` messages belonging to the supplied case can be reset. This remains available for terminal cases without reopening them or rewriting their closure time.

```sh
uv run pytest tests/test_sla.py -q
uv run --with pgserver python scripts/test_postgres.py
uv run python scripts/test_browser.py
```

Tests cover exact boundaries, catch-up, concurrent workers, audit-failure rollback, stale scope, policy pinning, extension preservation, retry recovery, migration backfill, and PostgreSQL command/delivery lock overlap. The browser workflow covers visible escalation, failed-delivery retry, extension confirmation, and the citizen inbox.

The verification-wait review timer, citizen accept/dispute/rework screens, and silence handling remain Phase 4. Notifications never close a case.
