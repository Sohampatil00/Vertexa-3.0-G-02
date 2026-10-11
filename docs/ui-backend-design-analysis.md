# GovFix UI and backend analysis for design handoff

Reviewed against repository source and the saved desktop browser-test screenshot on 11 October 2026. This is a structure/design analysis, not a fresh security audit or verification of deployed infrastructure.

## Current frontend structure

| Source | Responsibility |
|---|---|
| `web/src/main.tsx` | App/login, shared Workspace, case lists and summary, Intake, Detail, command forms, evidence upload/download |
| `web/src/sla.tsx` | In-app inbox, SLA thresholds, delivery diagnostics and supervisor retry |
| `web/src/api.ts` | Typed view models, HTTP/command helpers, case version/idempotency headers, date formatting |
| `web/src/ui.tsx` | Shared button styles, class merging, errors and labeled fields |
| `web/src/style.css` | Tailwind base styles, light slate/blue palette, focus and form styling |

React/TypeScript/Vite and Tailwind provide the frontend; Radix AlertDialog handles irreversible-action confirmations. The application mounts a shared role-aware workspace. Screen selection is component state; a separate route architecture and separate role dashboards are not currently implemented.

The working UI includes login, grievance submission, state-filtered/paginated case lists, summary counts, notifications, case details, allowed actions, private uploads/downloads, resolution review, acceptance/dispute, supervisor rework, SLA history, delivery retry, deadline extension and verification-wait filtering. The current details page vertically stacks most modules beside a long timeline.

## Current backend structure

| Module | Responsibility | Design consequence |
|---|---|---|
| `api.py` | FastAPI routes, authentication dependency, scoped reads, allowed actions, error handling | UI actions must follow server permissions; role labels alone are insufficient |
| `auth.py` | Local accounts/sessions, role scopes, optional Supabase token authentication | No implemented public signup, account recovery, or user-admin UI should be inferred |
| `workflow.py`, `schemas.py` | Governed commands, transition rules, ownership checks, confirmation, atomic audit/idempotency | Every form needs the real required fields, success state and refusal path |
| `policy.py`, demo policy JSON | Validated versioned rules and pinned policies | Policy read views are appropriate; visual editing/publication is future work |
| `operations.py` | Scoped summaries, eligible officers, ownership history and evidence endpoints | Assignment choices must come from eligible accounts; no invented workload score |
| `evidence.py` | Image validation, private local storage and optional Supabase Storage adapter | File selection and server-confirmed completion are separate; private access is authenticated |
| `sla.py`, `worker.py` | Thresholds, scheduling, verification-wait alerts, outbox retries | Workflow, current SLA and historical escalation must remain visually separate |
| `notifications.py` | Scoped inbox and delivery diagnostics | Delivered does not mean read; no existing read/unread endpoint |
| `models.py`, migrations | SQLAlchemy entities and Alembic schema evolution | Persisted data supports the core workflow; charts/admin surfaces need explicit data contracts |
| `cli.py` | Database setup, policy import, user provisioning and worker command | These administration functions are currently CLI operations, not dashboard APIs |

The database default is `sqlite:///./govfix.db`. PostgreSQL is supported and was exercised in the preceding implementation tests. `GOVFIX_DATABASE_URL` selects the database. Supabase Auth/Storage adapters now exist in source, but that does not establish a configured or deployed Supabase database. Evidence files are distinct from relational case metadata.

Main entities are users, role grants, sessions, policy versions, grievances, assignment intervals, evidence metadata, audit events, idempotency records, outbox messages, SLA thresholds, and notifications. Voice sessions/transcripts, admin drafts, chat/comments and analytics aggregates are not established current entities.

## Role coverage and important boundaries

| Role | Existing capability | Proposed dedicated workspace |
|---|---|---|
| Citizen | Own cases, confirmed submission, verified accept/dispute, safe timeline and notifications | Personal overview, reporting journey, resolution verification |
| Intake officer | Validate/reject submitted cases in scope | Validation queue and focused review |
| Dispatcher | Assign validated cases to eligible officers | Assignment queue and assignment panel |
| Field officer | Current-owner acceptance, private evidence, resolution | Mobile field queue and work detail |
| Supervisor | Scoped oversight, initial assignment, dispute rework, extension, failed-delivery retry | Operational overview, dispute and waiting queues |
| Ward head | Scoped oversight, escalation/ownership/delivery visibility | Read-only escalation overview unless also granted supervisor role |
| Auditor | Scoped detailed audit/ownership/delivery and policy reads | Read-only case audit and policy reference |
| Administrator | Provisioning/policy import through CLI; no separate implemented ADMIN role | Future user, access, policy and integration concepts |

## Main design opportunities

1. Give each role a task-focused landing view. The current common summary and shared details view place too much emphasis on identical information for different jobs.
2. Replace the long case page with a stable case header, focused tabs/sections and a clear next-action area. Delivery logs and technical audit details should not dominate the citizen journey.
3. Give citizen resolution verification visual priority, with selected evidence and distinct accept/dispute actions. Preserve the dispute statement for officer rework.
4. Improve evidence inspection with an authenticated image preview design; the current UI downloads evidence. Preview requires client blob handling and cleanup.
5. Make staff queues denser and citizen/mobile screens simpler. Keep current state/pagination/ownership/wait filters; annotate new server filters rather than inventing them.
6. Keep current versus historical SLA information distinct. An extended deadline does not erase a recorded escalation.
7. Show audit details in expandable read-only panels. The backend exposes more oversight detail than the current rendered timeline displays.
8. Add a safe citizen rejection-explanation projection when implementing the redesigned terminal view. The current citizen timeline hides command details, so a rich rejection receipt requires a read-model change.
9. Avoid synthetic analytics presented as measured results. The current summary supports counts, not trends, turnaround distributions or officer rankings.
10. Keep planned voice, identity, administration and integration-management screens in a separate concept collection so design coverage does not misrepresent implementation status.

The complete design prompt and 40-screen inventory are in [google-stitch-prompt.md](./google-stitch-prompt.md). The screen count includes forms, modal/state groups, and future concepts; it is not a claim that 40 dashboards currently exist.
