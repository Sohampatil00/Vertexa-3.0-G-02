# Implementation tracker

**As of 11 October 2026:** Phase 2 local operations are implemented and verified. It uses a fictional `DEMO_ONLY` policy and provisioned local accounts. Municipal policy approval, production identity verification, citizen verification/rework screens, SLA workers, production storage, live integrations, and deployment remain open.

## Present in the repository

| Item | Status | Evidence |
|---|---|---|
| Research, requirements, and specifications | Documented | [Documentation index](./README.md) |
| Demo policy and validator | Verified locally | [Policy](../config/policies/demo-pilot-v1.json), [loader](../govfix/policy.py) |
| Authentication and scoped role grants | Verified locally | [Authentication](../govfix/auth.py), [API](../govfix/api.py), [access tests](../tests/test_auth_and_access.py) |
| Case state machine and operation-specific gates | Verified locally | [Workflow](../govfix/workflow.py), [command schemas](../govfix/schemas.py), [tests](../tests/test_workflow.py) |
| Database and migrations | Verified on SQLite and PostgreSQL | [Models](../govfix/models.py), [migrations](../migrations/versions/0001_workflow_foundation.py), [history protections](../migrations/versions/0002_protect_policy_and_audit.py) |
| Policy pinning, concurrency, idempotency, and transactional audit | Verified locally | [Workflow tests](../tests/test_workflow.py), [persistence tests](../tests/test_persistence.py) |
| Resolution, acceptance/dispute, and rework backend gates | Verified with actual private uploads and legacy trusted fixtures | Citizen verification/rework screens remain Phase 4 work |
| Outbox requests for citizen verification and supervisor review | Implemented; delivery pending | Requests commit with workflow events; no delivery worker exists |
| Citizen intake, staff operations, officer queue, supervisor view | Verified in Chromium desktop/mobile | [React client](../web/src/main.tsx), [browser workflow](../scripts/test_browser.py) |
| Private evidence upload and completion | Verified locally | [Upload API](../govfix/operations.py), [private store](../govfix/evidence.py), [tests](../tests/test_operations.py); production object storage remains open |
| SLA escalation/notification workers and deadline extension | Not started | Initial elapsed-hour deadlines and read-time SLA status exist |
| ElevenLabs integration | Not started | Voice commands are refused until verified voice sessions are implemented |
| CI | Configured; remote execution not verified | [SQLite/PostgreSQL workflow](../.github/workflows/backend.yml) |
| Deployment and production safeguards | Not started | See [security/privacy requirements](./security-privacy.md) |

## Verification recorded

On macOS with Python 3.12.14, 11 October 2026:

| Command | Result |
|---|---|
| `uv run pytest -q` | 83 tests passed against SQLite |
| `uv run --with pgserver python scripts/test_postgres.py` | 83 tests passed against a disposable PostgreSQL instance; process and data cleaned up |
| `uv run ruff check .` | Passed |
| `uv run ruff format --check .` | Passed |
| `uv run govfix init-db` and `uv run alembic check` | Migrations applied, demo policy imported, and no schema drift detected |
| `npm run build --prefix web` | TypeScript check and production build passed |
| `uv run python scripts/test_browser.py` | Full text workflow, private download, and mobile layout passed with no browser script errors |
| Live HTTP smoke | `/health`, `/docs`, and `/openapi.json` passed; 21 documented paths |

Tests cover a submitted → validated → assigned → in-progress case, direct assigned → closed refusal, wrong role/owner, missing or incomplete evidence, cross-citizen and cross-ward access, session expiration/revocation, duplicate requests, concurrent requests by different actors, policy pinning, append-only database protections, audit-failure rollback, and the full backend resolution/dispute graph using trusted evidence fixtures. These tests do not establish that all [P0 release gates](./validation.md) have passed.

## Update rules

Move an item to **Implemented** only when its code exists. Move it to **Verified** after recording a reproducible command, environment, date, and source/artifact link. Keep partial backend functionality distinct from a usable feature with its interface, integrations, and operational safeguards. The [roadmap](./roadmap.md) defines intended sequence.
