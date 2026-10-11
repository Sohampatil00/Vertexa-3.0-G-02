# Implementation tracker

**As of 11 October 2026:** Phases 1–4 and the Phase 5 application integration are implemented locally with a fictional `DEMO_ONLY` policy and provisioned accounts. Municipal policy approval, production identity verification, external notification providers, production storage, live ElevenLabs provisioning/language validation, and deployment remain open.

## Present in the repository

| Item | Status | Evidence |
|---|---|---|
| Research, requirements, and specifications | Documented | [Documentation index](./README.md) |
| Demo policy and validator | Verified locally | [Policy](../config/policies/demo-pilot-v1.json), [loader](../govfix/policy.py) |
| Authentication and scoped role grants | Verified locally | [Authentication](../govfix/auth.py), [API](../govfix/api.py), [access tests](../tests/test_auth_and_access.py) |
| Case state machine and operation-specific gates | Verified locally | [Workflow](../govfix/workflow.py), [command schemas](../govfix/schemas.py), [tests](../tests/test_workflow.py) |
| Database and migrations | Verified on SQLite and PostgreSQL | [Models](../govfix/models.py), [migrations](../migrations/versions/0001_workflow_foundation.py), [history protections](../migrations/versions/0002_protect_policy_and_audit.py) |
| Policy pinning, concurrency, idempotency, and transactional audit | Verified locally | [Workflow tests](../tests/test_workflow.py), [persistence tests](../tests/test_persistence.py) |
| Resolution presentation, explicit acceptance/dispute, and supervisor rework | Verified locally | [Citizen verification](./citizen-verification.md), [browser workflow](../scripts/test_browser.py), [tests](../tests/test_verification.py) |
| Outbox requests for citizen verification and supervisor review | In-app delivery verified | Requests commit with workflow events; [worker](../govfix/worker.py) delivers to authenticated inboxes |
| Citizen intake, staff operations, officer queue, supervisor view | Verified in Chromium desktop/mobile | [React client](../web/src/main.tsx), [browser workflow](../scripts/test_browser.py) |
| Private evidence upload and completion | Verified locally | [Upload API](../govfix/operations.py), [private store](../govfix/evidence.py), [tests](../tests/test_operations.py); production object storage remains open |
| SLA monitoring, escalation, notification retry and deadline extension | Verified locally | [SLA scheduler](../govfix/sla.py), [worker](../govfix/worker.py), [tests](../tests/test_sla.py), [operations guide](./sla-operations.md) |
| Unanswered verification alert | Verified locally | Pinned policy window, one audited alert per cycle, supervisor inbox and scoped dashboard count; [guide](./citizen-verification.md) |
| ElevenLabs integration | Application and mocked provider contracts verified; live calls pending | [Voice guide](./voice-access.md), [boundary tests](../tests/test_voice.py), signed transcript webhook, and browser outage fallback |
| CI | Configured; remote execution not verified | [SQLite/PostgreSQL workflow](../.github/workflows/backend.yml) |
| Deployment and production safeguards | Not started | See [security/privacy requirements](./security-privacy.md) |

## Verification recorded

On macOS with Python 3.12.14, 11 October 2026:

| Command | Result |
|---|---|
| `uv run pytest -q` | 122 tests passed against SQLite; 2 PostgreSQL lock tests skipped |
| `uv run --with pgserver python scripts/test_postgres.py` | 124 tests passed against a disposable PostgreSQL instance; process and data cleaned up |
| `uv run ruff check .` | Passed |
| `uv run ruff format --check .` | Passed |
| `uv run govfix init-db` and `uv run alembic check` | Migrations applied, demo policy imported, and no schema drift detected |
| `npm run build --prefix web` | TypeScript check and production build passed |
| `uv run python scripts/test_browser.py` | Mocked SDK microphone/transcript/tool callbacks and screen confirmation, voice outage fallback, full text workflow, SLA escalation, verification wait, dispute, rework, acceptance, failed-delivery retry, extension, citizen inbox, private download, and mobile layout passed |
| Live HTTP smoke | `/health`, `/docs`, and `/openapi.json` passed after migration 0006 |

Tests cover a submitted → validated → assigned → in-progress case, direct assigned → closed refusal, wrong role/owner, missing or incomplete evidence, cross-citizen and cross-ward access, session expiration/revocation, duplicate requests, concurrent requests by different actors, policy pinning, append-only database protections, audit-failure rollback, and the full backend resolution/dispute graph using trusted evidence fixtures. These tests do not establish that all [P0 release gates](./validation.md) have passed.

## Update rules

Move an item to **Implemented** only when its code exists. Move it to **Verified** after recording a reproducible command, environment, date, and source/artifact link. Keep partial backend functionality distinct from a usable feature with its interface, integrations, and operational safeguards. The [roadmap](./roadmap.md) defines intended sequence.


## Supabase permissions and login-to-case audit — 11 October 2026

- Applied migration `0007` to the configured Supabase project: 14/14 tables have RLS,
  no Data API policies, and no API-role table grants. History function execute grants: zero.
- Fixed provider selection: Supabase database/storage credentials no longer switch token
  validation. Local and native-provider login both issue revocable GovFix sessions.
- Live Supabase API verification passed login, identity, intake, submission, list, detail,
  timeline, actions, cross-citizen denial and logout. All verification rows were rolled back.
- SQLite: 131 passed, 3 PostgreSQL tests skipped. Disposable PostgreSQL: 134 passed.
- Full operations browser workflow and frontend production build passed.
- Supabase plugin discovery confirmed installed/enabled; this chat exposed no callable
  Supabase tool or plugin panel, so the audit/migration used the configured SQL connection.
- Native Supabase Auth live login remains unverified: the project has no Auth users or
  provisioned application accounts. Mocked provider contract tests passed.

- Direct Supabase Data API user reads denied: anon HTTP 401; service_role HTTP 403.
  The configured evidence bucket exists and is private. API and worker restarted successfully.


## Phase 6 authentication hardening — 11 October 2026

- Migration `0008`: shared login budgets, trusted backend group, exact SQL privileges and
  role-specific RLS policies. Supabase applied; 15/15 tables pass the Data API audit.
- API/worker switched to `govfix_runtime`: no superuser/CREATEDB/CREATEROLE/BYPASSRLS,
  no public table ownership and no schema CREATE. Administration uses a separate owner URI.
- Live login-to-case verification passed under backend privileges with all smoke records
  rolled back. Private evidence storage remains separate from the public SQL schema.
- Atomic account/IP budgets, shared-process behavior, expiry, bounded pruning, concurrent
  attempts, forwarded-header handling, dependency outage and privilege denials tested.
- SQLite: 137 passed, 4 PostgreSQL checks skipped. Disposable PostgreSQL: 141 passed.
- Full operations browser workflow passed. This completes the authentication slice of
  Phase 6; observability, backup/restore, load/accessibility sessions and live voice gates remain.


## Phase 6 readiness and observability — 11 October 2026

- Public `/ready` checks database, migration, policy and restricted role; `/health` is liveness.
- Auditor-only `/v1/operations/status` and `govfix check-operations` report durable worker
  success/staleness/failure, notification retry/failure/backlog, and operational alert codes.
- Safe JSON request/worker logs, generated request correlation, and per-process API counters.
- Migration `0009` applied to Supabase; 16/16 public tables pass the permission audit.
- SQLite: 147 passed, 4 PostgreSQL-only checks skipped. Disposable PostgreSQL: 151 passed.
- Full operations browser workflow passed. API/worker restarted with restricted credentials.
- See [monitoring setup](./observability.md). External alert routing/log export remains a
  deployment task; no messages or scheduled monitoring jobs were configured.

- Live Supabase `/ready` returned 200; `check-operations` reported healthy with no alerts.
  Auditor operational access and citizen denial passed in a rolled-back live API smoke.
