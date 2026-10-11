# Readiness and operational observability

## Endpoints and monitoring commands

| Signal | Access | Meaning |
|---|---|---|
| `GET /health` | Public | API process is responding; no dependency checks |
| `GET /ready` | Public | Database reachable, migration current, configured policy present and runtime role valid; 200 ready / 503 not ready |
| `GET /v1/operations/status` | Authenticated `AUDITOR` | Worker heartbeat, notification counts, alerts and per-process API counters |
| `uv run govfix check-operations` | Trusted operator environment | Same operational checks using the runtime DB login; JSON output and exit 0 healthy / 1 degraded or unavailable |

Run deployment traffic readiness probes against `/ready`. A stale worker does not make
text intake unavailable: worker health is a separate operational alert. `/health` stays
usable through a database outage. Responses include a generated request ID and are not cached.
Readiness returns boolean checks without connection strings, usernames or exception details.

```sh
set -a; source .env; set +a
uv run govfix check-operations
curl --fail http://127.0.0.1:8000/ready
```

Configure your deployment monitor to run `check-operations` every 30–60 seconds and alert
on nonzero exit; log collectors can also match `operational_alert` and failed `worker_cycle`
events. Monitoring notifications/log drains must be configured with the chosen deployment
provider. This implementation does not send email/Slack alerts or create a recurring job.

## Alerts

| Code | Operator action |
|---|---|
| `API_NOT_READY` | Check database connectivity, migration, policy and restricted runtime credentials |
| `WORKER_MISSING` | Start the worker; no heartbeat has been recorded |
| `WORKER_STALE` | Check the worker process, cycle duration and database connectivity |
| `WORKER_CYCLE_FAILED` | Inspect the safe worker error code and failed cycle logs; restart/fix its dependency |
| `NOTIFICATIONS_RETRYING` | Inspect retry causes in scoped delivery operations; transient retries may recover |
| `NOTIFICATIONS_FAILED` | Fix the cause and retry through the existing authorized workflow |
| `NOTIFICATION_BACKLOG` | Check worker capacity and overdue pending/retry delivery |
| `MONITORING_UNAVAILABLE` | The monitoring query failed; do not interpret missing counts as a healthy queue |

Defaults: worker success becomes stale after 120 seconds; pending/retry notification
backlog is overdue 300 seconds after its scheduled attempt (or creation when unscheduled).
Adjust `GOVFIX_WORKER_STALE_SECONDS` above the polling interval plus expected cycle time.
`GOVFIX_NOTIFICATION_BACKLOG_SECONDS` sets the backlog threshold.

Workers record cycle start, finish, last success and a safe failure code in `worker_status`.
Rows are scoped to process instances and persist across restarts; old entries are removed
after seven days. A recent successful worker can keep monitoring healthy across a normal
rollout. Database failures prevent new heartbeats and eventually trigger staleness. A
partial dispatch database failure marks the cycle failed even if other jobs succeeded.
Notification retries and terminal failures remain counted independently.
`govfix worker --once` exits nonzero on cycle or partial dispatch database failure.

## Logs and counters

Application events are JSON lines on stderr with UTC timestamp and event name:

- `http_request`: generated request ID, HTTP method, route template, status and duration.
- `api_unhandled_error`: request ID and exception class, without the exception message.
- `worker_cycle`: process instance ID, safe error code and aggregate job counts.
- `readiness_failed` / `operational_alert`: failed checks or alert codes and aggregate counts.

HTTP errors are warning/error events. Request bodies, query strings, authorization headers,
passwords, account names, IP addresses, raw case paths and provider exception messages are
excluded from these application events. Structured logs supplement the immutable workflow
audit; they do not replace it. Retain/export logs under the approved deployment retention policy.

Use the application request logger without Uvicorn's raw URL access logger:

```sh
uv run uvicorn govfix.api:app --host 127.0.0.1 --port 8000 --no-proxy-headers --no-access-log
uv run govfix worker --poll-seconds 30
```

API counters are explicitly per process and reset on restart. Collect JSON events from all
instances for fleet-wide request rates and latency analysis; the app does not claim global
in-memory metrics. Worker and notification signals are shared through PostgreSQL.

Readiness SQL has a default 2000 ms statement timeout, configurable through
`GOVFIX_READINESS_TIMEOUT_MS`. Connection acquisition and new PostgreSQL connections have
separate five-second limits; the SQL timeout is not a total HTTP probe deadline. Configure
probe timeouts to allow connection acquisition as well as queries.

## Verification and permissions

Migration `0009` grants the restricted backend group only the worker-status CRUD permissions
needed for heartbeats and retention. RLS restricts access to that group; public/Supabase Data
API roles receive no grants. `scripts/audit_supabase.py` includes this table automatically.

`tests/test_observability.py` covers readiness mismatches, missing policy, database outages,
worker absence/staleness, failure recovery, partial dispatch failure, failed/backlogged
notifications, authorization, safe logs and sanitized unexpected API/worker failures.
Tests run on disposable SQLite and PostgreSQL; never run destructive fixtures on Supabase.

For complementary platform signals, see [Supabase observability](https://supabase.com/docs/guides/observability).
Live platform log drains and paid monitoring integrations are deployment configuration tasks.
