# GovFix

**Voice-first grievances. Rule-based governance. Verifiable resolution.**

GovFix is a proposed municipal grievance workflow system. Citizens can report an issue by text or voice, staff can validate and resolve it, and citizens can verify the result. A deterministic backend is responsible for status changes, assignments, deadlines, escalations, and the audit trail. AI and ElevenLabs help people communicate with the system; they do not independently change a case.

> **Project status:** Planning and documentation. This repository does not yet contain an application or runnable demo. See the [implementation tracker](./docs/implemented.md).

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
| [Security and privacy](./docs/security-privacy.md) | Identity, access, voice data, and audit safeguards |

The original [research and concept memo](./info.md) contains background, examples, and optional ideas. The PRD and linked specifications define the current build scope when they differ from the memo.

## Development status

No setup or run command is available yet. A proposed stack is documented in [architecture.md](./docs/architecture.md), and the first implementation milestones are in [roadmap.md](./docs/roadmap.md). Add verified installation, environment, test, and deployment instructions here when the corresponding code exists.

## Design principle

**AI assists communication. Workflow rules enforce accountability.** Every action that changes a case must pass authentication, role and ownership checks, transition validation, and audit recording in the backend.
