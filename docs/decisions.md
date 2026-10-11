# Decision log

This log distinguishes **accepted product scope** from **proposed engineering choices** and **open policy decisions**. The [PRD](../prd.md) is the product baseline. Record a date, owner, and rationale when a proposal is formally accepted.

## Accepted for the P0 specification

| ID | Decision | Rationale |
|---|---|---|
| D-01 | Build one complete municipal grievance workflow first. | Demonstrates the challenge requirements without a shallow multi-domain dashboard. |
| D-02 | All governed changes pass through the backend workflow service. | The same rules apply to web, voice, and worker channels. |
| D-03 | AI may suggest and draft but may not independently change status, owner, priority, deadline, SLA, escalation, or closure. | Keeps human and policy authority explicit and auditable. |
| D-04 | Record accepted and refused attempts in the audit trail. | A refusal is evidence that policy enforcement occurred. |
| D-05 | Keep workflow state, SLA status, and escalation level separate. | A case can be in progress while overdue and escalated. |
| D-06 | Require resolution evidence and explicit citizen acceptance for closure. | Prevents unverified technical closure. |
| D-07 | No silent auto-closure after an unanswered verification request in P0. | Citizen silence is not proof of resolution. |
| D-08 | Pin each case to an effective versioned policy. | A later rule change must not silently rewrite open cases. |

## Proposed engineering choices — not yet implemented

| ID | Proposal | Why / validation needed |
|---|---|---|
| P-01 | A modular API, PostgreSQL, private object storage, and durable background jobs. | Supports atomic mutation plus audit and reliable threshold processing; validate hosting and team skills. |
| P-02 | Next.js and TypeScript for web interfaces. | Shared UI platform for citizen and staff views; assess accessibility and deployment. |
| P-03 | FastAPI for the backend. | Typed API and worker ecosystem; compare with a TypeScript backend before committing. |
| P-04 | Transactional outbox for notifications and voice callbacks. | Avoid losing delivery requests after a case commit; prove retry behavior in tests. |
| P-05 | Scope voice tools by operation rather than exposing generic case mutation. | Reduces model and integration authority; validate ElevenLabs tool behavior in a prototype. |

## Open decisions requiring named owners

| ID | Question | Proposed pilot default | Owner to confirm |
|---|---|---|---|
| O-01 | Which categories, wards, departments, and routing rules are official? | Small approved catalog | Municipal operations |
| O-02 | What are the SLA durations, business calendar, time zone, and escalation recipients? | Clearly labeled demo rules until approval | Municipal policy owner |
| O-03 | How long may citizen verification wait, and how is that waiting time reported? | Keep open; create supervisor task after configured window | Municipal policy/legal owner |
| O-04 | Are appeals or reopening allowed, and within what window? | Exclude from P0 | Municipal policy/legal owner |
| O-05 | What proves identity over the phone, including shared phones and assisted users? | OTP plus case association for pilot | Security and product |
| O-06 | How long are transcripts, recordings, evidence, and audit events retained? | No production retention claim until policy approval | Privacy/legal owner |
| O-07 | What is the process for cross-jurisdiction requests? | Coded rejection with explanation; no automatic external transfer | Municipal operations |
| O-08 | Which framework, host, queue, notification channel, and observability tools are selected? | Choose after a small technical spike | Engineering lead |

## Decision template

When resolving an open item, append: **ID, date, owner, decision, alternatives considered, rationale, scope/API/data impact, and verification needed**. Update the [PRD](../prd.md), [workflow](./workflow.md), and [validation plan](./validation.md) together when behavior changes.
