# GovFix

**Voice-first grievances. Rule-based governance. Verifiable resolution.**

GovFix is a proposed municipal grievance workflow system. Citizens can report an issue by text or voice, staff can validate and resolve it, and citizens can verify the result. A deterministic backend is responsible for status changes, assignments, deadlines, escalations, and the audit trail. AI and ElevenLabs help people communicate with the system; they do not independently change a case.

> **Project status:** Phases 1–4 run locally. Citizens can inspect submitted resolutions, explicitly accept or dispute them, and supervisors can send disputed cases for rework. Unanswered verification stays open and is flagged for supervisor review after the configured window. The policy is fictional and voice integration remains planned. See the [implementation tracker](./docs/implemented.md).

## Why this project

Municipal requests often cross teams and deadlines. GovFix aims to make the current owner, next action, SLA status, and evidence of resolution visible while rejecting invalid or unauthorized actions. The initial scope is one complete **municipal grievance resolution** workflow, designed so policies can later be configured for other public institutions.

## Planned first release

- Citizen text and multilingual voice intake with read-back and explicit confirmation.
- Backend state machine and role-based access control that refuse skipped or unauthorized transitions.
- Category-specific deadlines, automatic overdue escalation, and visible audit events.
- Officer assignment, field evidence, resolution submission, and citizen acceptance or dispute.
- Case status and timeline for citizens, officers, supervisors, and auditors.
- AI suggestions for extraction, routing, translation, and drafting, reviewed by an authorized person.

## How the workflow works

```text
SUBMITTED → VALIDATED → ASSIGNED → IN_PROGRESS
                                     ↓
                         RESOLUTION_SUBMITTED
                                     ↓
                         CITIZEN_VERIFICATION
                           ├─ accept → CLOSED
                           └─ dispute → DISPUTED → SUPERVISOR_REVIEW → rework
```

An intake officer can reject a submitted case with a coded reason. `OVERDUE` is an SLA condition, not a workflow state. The [workflow specification](./docs/workflow.md) defines the full transition rules.

## Documentation

| Document | Purpose |
|---|---|
| [Product requirements](./prd.md) | Goals, scope, user journeys, and acceptance criteria |
| [Documentation index](./docs/README.md) | Reading order and document ownership |
| [Roadmap](./docs/roadmap.md) | Delivery phases and exit criteria |
| [Implementation tracker](./docs/implemented.md) | What exists today and what remains |
| [Architecture](./docs/architecture.md) | Proposed system components and request flow |
| [Workflow](./docs/workflow.md) | States, permissions, deadlines, and escalation |
| [Database](./docs/database.md) | Proposed data model and integrity rules |
| [API](./docs/api.md) | Proposed endpoint and error contracts |
| [Decisions](./docs/decisions.md) | Accepted product decisions and unresolved choices |
| [Validation](./docs/validation.md) | Test scenarios and release gates |
| [Demo pilot policy](./docs/pilot-policy.md) | Executable Phase 0 configuration and open approvals |
| [Backend setup](./docs/backend.md) | Run the API, provision accounts, and test case commands |
| [Security and privacy](./docs/security-privacy.md) | Identity, access, voice data, and audit safeguards |

The original [research and concept memo](./info.md) contains background, examples, and optional ideas. The PRD and linked specifications define the current build scope when they differ from the memo.

## Development status

The backend uses Python 3.12, FastAPI, SQLAlchemy, and Alembic. With [uv](https://docs.astral.sh/uv/getting-started/installation/) installed, run from the repository root:

```sh
npm ci --prefix web
npm run build --prefix web
uv sync --locked
uv run govfix init-db
uv run uvicorn govfix.api:app --host 127.0.0.1 --port 8000
```

Open the [operations interface](http://127.0.0.1:8000/app/) or [API documentation](http://127.0.0.1:8000/docs). Provision accounts and follow the first case path in [backend.md](./docs/backend.md). Run `uv run pytest -q` for the test suite. The default database is local SQLite; PostgreSQL is also supported and tested. All current policy values are fictional demonstration rules.

Run `uv run govfix worker --poll-seconds 30` in a separate terminal to monitor deadlines and verification waits and deliver in-app notifications. See [SLA operations](./docs/sla-operations.md) and [citizen verification](./docs/citizen-verification.md).

## Design principle

**AI assists communication. Workflow rules enforce accountability.** Every action that changes a case must pass authentication, role and ownership checks, transition validation, and audit recording in the backend.
