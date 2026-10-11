# GovFix — Product Requirements Document

**Status:** Draft for product and engineering review  
**Problem code:** G-02  
**Initial workflow:** Municipal grievance resolution  
**Source:** [info.md](./info.md)  
**Prepared:** 11 October 2026

## 1. Product summary

GovFix is a configurable case workflow for municipal grievances. Citizens report a problem by text or voice, staff validate and resolve it, and citizens verify the outcome. A deterministic backend governs every status change, assignment, deadline, and escalation. ElevenLabs provides a multilingual voice interface across the lifecycle; AI can extract, translate, summarize, and suggest, but cannot independently perform governed actions.

**Product promise:** Voice-first grievances. Rule-based governance. Verifiable resolution.

**Initial deployment assumption:** One municipality, a small set of service categories and wards, and a pilot with named staff. The configuration model must allow later reuse by other public institutions, but the first release implements one complete municipal workflow.

## 2. Evidence and opportunity

- CPGRAMS received **2,278,256 grievances in 2025**. Central government ministries and departments reported a **15-day average disposal time**, with **82.1%** disposed within the prescribed 21 days.[1]
- State and UT governments reported a **64-day average disposal time in 2025**.[2] These national figures establish a need for accountable handling; they are **not** a municipal baseline or a forecast of GovFix results.
- India's CPGRAMS launched the multilingual AI voice chatbot **Samadhan Didi** on **30 May 2026**.[3] Voice intake alone is therefore an established capability. GovFix's proposed distinction is voice support through assignment, field work, status explanation, and citizen verification, backed by enforceable workflow rules.
- A Parliamentary Standing Committee summary identifies weak routing, inadequate closure reasons, and inconsistent grievance handling as recurring concerns.[4]
- ElevenLabs documents external webhook tools and post-call webhooks, which support the proposed voice interface and interaction records.[5][6] Product integration, language quality, and telephony behavior still require prototype validation.

The source memo's Swachhata integration FAQ link currently returns **404**.[7] Its category SLA examples are retained only as **sample pilot configuration**, pending confirmation with the municipality and a working primary source.

## 3. Users and jobs

| User | Job to be done |
|---|---|
| Citizen | Report a local issue without knowing the responsible department; receive a receipt, understandable updates, and a way to confirm or dispute the result. |
| Intake officer | Validate the complaint, jurisdiction, location, and category; reject with a reason when necessary. |
| Dispatcher or supervisor | Assign an accountable owner, manage overdue work, review disputes, and approve policy exceptions. |
| Field officer | Accept work, record activity and evidence, and submit a defensible resolution. |
| Auditor or administrator | Review a complete event history and manage versioned workflow policies. |

## 4. Goals, measures, and exclusions

### Goals

1. Make every case's state, owner, deadline, and next valid action visible.
2. Prevent unauthorized or invalid state changes in the backend and explain refusals.
3. Detect and escalate SLA breaches automatically, with an auditable record.
4. Require evidence and citizen verification before closure.
5. Make the full workflow usable in Marathi, Hindi, and English through voice, with text as a complete fallback.

### Pilot success measures

These are **proposed acceptance targets**, not claims about current performance:

| Measure | Pilot target | How measured |
|---|---:|---|
| Invalid or unauthorized transitions accepted | 0 | Automated tests and audit review |
| Accepted and refused action attempts with actor, time, and reason/result recorded | 100% | Audit reconciliation |
| Overdue cases escalated within 5 minutes of configured threshold | ≥99% | Scheduled-job and event logs |
| Resolution submissions with required note and evidence | 100% | Validation checks |
| Citizens able to complete complaint intake through text | 100% of supported categories | End-to-end pilot scenarios |
| Voice intake completion in each pilot language | Baseline during pilot; target set after usability test | Observed task completion |
| Citizen verification or dispute captured after resolution submission | Baseline during pilot | Case funnel |

### Out of scope for the first release

Public complaint maps, community voting, duplicate clustering, predictive priority, officer rankings, cross-institution workflow templates, automated case closure after citizen silence, and claims of fraud or corruption. Priority is set by published category rules, never by sentiment or an LLM.

## 5. Release scope

### P0 — complete municipal workflow

- Citizen text form and voice complaint flow with original transcript, field extraction, read-back, and explicit submission confirmation.
- Authenticated citizen and staff accounts; role checks in the API.
- Versioned state machine with validated transitions, required fields, and human-readable refusal reasons.
- Category-based SLA policy, countdown, threshold monitoring, automatic escalation, and notifications.
- Intake, officer, and supervisor views; assignment and ownership history.
- Officer resolution note plus required evidence; citizen accept or dispute flow.
- Append-only audit events for accepted and refused actions, assignment, SLA changes, escalations, evidence, and verification.
- Basic read-only status lookup through voice after identity verification.

### P1 — voice across the lifecycle

- Officer voice dictation and explicit confirmation before attaching notes or submitting a resolution.
- Outbound voice verification after a resolution is submitted, with verified citizen response sent to the workflow API.
- Spoken explanations of current state, deadline, next step, and case timeline using backend facts.
- Voice notification of assignment or escalation where a citizen has opted in.

### P2 — later expansion

Admin workflow builder UI, anomaly monitoring, routing-loop alerts, evidence similarity checks, public map, fairness analytics, duplicate linking, and institution-specific templates. The P0 backend should use policy data so these features can be added without replacing the engine.

## 6. Core journey

1. **Report:** Citizen enters or speaks an issue, location, and optional photo. AI proposes category, ward, and a normalized summary; the original words remain available.
2. **Confirm:** System reads back the proposed complaint. Only explicit citizen confirmation creates the case in `SUBMITTED` and returns a case ID and calculated deadline.
3. **Validate:** Intake officer confirms or corrects recommendations and jurisdiction. The officer validates or rejects with a coded reason and explanation.
4. **Assign:** Supervisor or dispatcher assigns a department and officer. The assigned officer accepts and begins work.
5. **Resolve:** Officer records field activity and submits a resolution note with category-required evidence. AI may draft the note; the officer reviews and approves it.
6. **Verify:** System presents the resolution to the citizen. Acceptance closes the case; dissatisfaction creates a dispute for supervisor review. An outbound call can collect this response only after identity and intent checks.
7. **Escalate:** Independently of the state, a background worker warns and escalates at configured SLA thresholds. Every action and refusal is visible in the timeline.

## 7. Workflow contract

The case has three separate dimensions: `workflow_state`, `sla_status`, and `escalation_level`. `OVERDUE` is **not** a workflow state. The server is the only authority for all three dimensions.

| From | To | Authorized actor | Required conditions |
|---|---|---|---|
| New case | `SUBMITTED` | Authenticated citizen, including a confirmed voice action | Required complaint fields and explicit submission confirmation |
| `SUBMITTED` | `VALIDATED` | Intake officer | Category, location, jurisdiction, and responsible department confirmed |
| `SUBMITTED` | `REJECTED` | Intake officer | Standard reason code and citizen-facing explanation |
| `VALIDATED` | `ASSIGNED` | Dispatcher or supervisor | Valid department and assigned officer; assignment recorded |
| `ASSIGNED` | `IN_PROGRESS` | Assigned field officer | Assignment accepted |
| `IN_PROGRESS` | `RESOLUTION_SUBMITTED` | Assigned field officer | Resolution note and policy-required evidence present |
| `RESOLUTION_SUBMITTED` | `CITIZEN_VERIFICATION` | Workflow engine | Resolution submission committed; verification request created |
| `CITIZEN_VERIFICATION` | `CLOSED` | Verified citizen action through workflow API | Citizen explicitly accepts the resolution |
| `CITIZEN_VERIFICATION` | `DISPUTED` | Verified citizen action through workflow API | Citizen explicitly disputes with a reason or statement |
| `DISPUTED` | `SUPERVISOR_REVIEW` | Workflow engine | Dispute committed and supervisor notified |
| `SUPERVISOR_REVIEW` | `ASSIGNED` | Supervisor | Rework owner assigned and reason recorded |
| `SUPERVISOR_REVIEW` | `IN_PROGRESS` | Supervisor | Same officer retained and rework reason recorded |

`REJECTED` and `CLOSED` are terminal in P0. Appeal or reopening requires a separately specified, time-bounded policy and is P2. A disputed case cannot be silently closed. If the citizen does not respond, the case stays in `CITIZEN_VERIFICATION` and is surfaced for supervisor review under a configurable verification window; no automatic closure is allowed in P0.

Every transition request must be atomic: authenticate actor, check role and ownership, load current state and policy version, validate transition and required data, commit change, and append its audit event. A failed attempt must leave case data unchanged and append a refusal event with a stable reason code plus plain-language explanation. Concurrent requests must not both succeed against the same case version. Replayed voice or webhook requests must be idempotent.

## 8. Permissions and AI boundary

| Action | Citizen | Intake officer | Field officer | Supervisor | Workflow engine | AI/voice agent |
|---|---:|---:|---:|---:|---:|---:|
| Submit and verify own case | Yes | — | — | — | Validates | Collects confirmed intent only |
| Validate or reject | — | Yes | — | Policy exception only | Validates | Suggests category/route |
| Assign or reassign | — | — | — | Yes | Validates | No |
| Accept work and submit resolution | — | — | Assigned officer | — | Validates | Drafts notes only |
| Change deadline | — | — | — | Approved supervisor only | Calculates and validates | No |
| Escalate on threshold | — | — | — | Can acknowledge | Yes, from policy | No |
| Read case details | Own case | Assigned scope | Assigned scope | Ward/department scope | Service access | Only through scoped read API |

Voice is an interface acting for a verified person, not an autonomous workflow actor. A voice request must carry a verified user identity, case ID, explicit intended action, conversation ID, and an idempotency key. The backend derives the user's roles from trusted credentials; it must never accept a role asserted by the voice model. AI recommendations are stored separately with model/version and confidence; an authorized person accepts or overrides them before official case fields change. LLM output cannot set official priority, status, owner, deadline, or escalation.

## 9. Functional requirements and acceptance criteria

| ID | Requirement | Acceptance criterion |
|---|---|---|
| FR-01 | Text and voice intake | A citizen can create the same valid case through either channel; missing required fields trigger prompts or form errors. |
| FR-02 | Voice read-back and consent | No voice case is created until the citizen hears or sees the final summary and explicitly confirms it; transcript and confirmation event are linked to the case. |
| FR-03 | AI suggestion review | Suggested category, ward, summary, and route are visually marked as suggestions; official values change only after an authorized confirmation. |
| FR-04 | State and role enforcement | Direct `ASSIGNED → CLOSED`, `IN_PROGRESS → CLOSED`, wrong-owner, and wrong-role attempts are refused by the API with specific reasons and no state mutation. |
| FR-05 | Assignment ownership | Each assignment and reassignment records prior owner, new owner, actor, reason, and start/end times. One accountable current owner is visible. |
| FR-06 | SLA and escalation | Deadline derives from the effective category policy at case submission; warning and breach thresholds create exactly one event per level even after worker retries. |
| FR-07 | Resolution evidence | `IN_PROGRESS → RESOLUTION_SUBMITTED` fails when note or policy-required evidence is absent; uploader, upload time, case ID, type, and SHA-256 are retained. |
| FR-08 | Citizen verification | Only a verified citizen associated with the case can accept or dispute; acceptance closes and dispute enters supervisor review. |
| FR-09 | Audit | Every accepted and refused governed action is queryable in chronological order with actor, role, channel, time, case/policy version, before/after values where relevant, and reason/result. |
| FR-10 | Explainable status | Citizen and staff views show current state, owner or department, deadline, SLA status, escalation level, and next action from backend data. |
| FR-11 | Accessibility | Pilot scripts for Marathi, Hindi, and English support intake, status lookup, and verification; user can switch to text and ask for repeated or slower read-back. |
| FR-12 | Configuration | Categories, transition rules, role permissions, evidence rules, SLA thresholds, and escalation recipients are stored as versioned policy data; historical cases retain their effective policy version. |

### Refusal examples to demonstrate

- Officer attempts `ASSIGNED → CLOSED`: `INVALID_TRANSITION`, with the required path explained.
- Unassigned officer attempts `ASSIGNED → IN_PROGRESS`: `NOT_ASSIGNED_OWNER`.
- Assigned officer submits without evidence: `EVIDENCE_REQUIRED`.
- Voice agent sends an action without a verified user or explicit confirmation: `IDENTITY_OR_CONFIRMATION_REQUIRED`.
- Citizen attempts to verify another citizen's case: `CASE_ACCESS_DENIED`.

All five attempts must appear in the restricted audit view. Public and citizen timelines should show only information appropriate to their role.

## 10. SLA and escalation policy

- The service clock starts when a case is submitted. The deadline is calculated server-side using the category's effective SLA policy, time zone, business-calendar rule, and policy version. The pilot must explicitly configure whether durations are clock hours or business hours.
- SLA continues through assignment, work, and verification until `CLOSED` or `REJECTED`. This simple P0 rule keeps the deadline visible and avoids hidden pauses; policy owners must review how citizen response time should be reported before production adoption.
- Sample **pilot-only** 12-hour policy: warn at 80%, escalate to supervisor at 100%, and to ward head at 150%. These thresholds are not asserted as statutory municipal requirements.
- The worker recomputes due thresholds from persisted deadline and event history. Retries cannot create duplicate escalations. `sla_status` and `escalation_level` are updated transactionally with their audit events.
- A supervisor may extend an SLA only when the configured policy permits it, with old/new deadlines, reason, actor, and citizen notification. The system preserves the original deadline and breach history. AI cannot extend it.
- Notifications may fail independently; the escalation record persists, and failed delivery remains visible for retry.

## 11. Data and audit model

**Core records:** users/roles; grievances; policy definitions and versions; assignments; SLA instances and escalation events; evidence; comments; citizen verifications; AI recommendations; voice interactions; audit events and transition attempts. Keep original transcript and normalized summary as separate fields.

**Minimum case fields:** public case ID, citizen ID, description, location, category and department, current state, assigned owner, submission time, deadline, SLA status, escalation level, effective policy version, and optimistic concurrency version. Track validation, assignment, acceptance, first action, last action, resolution submission, verification, and closure timestamps.

**Audit properties:** append-only application access; restricted read permissions; unique event IDs; before/after values for governed changes; actor type and ID; source channel; request/conversation ID; timestamp; policy version; result and reason code. A hash chain can make changes tamper-evident, but it does not replace database backups, access controls, or external log retention. Full immutability requires infrastructure and governance controls beyond an append-only table.

**Privacy:** Voice recordings and transcripts are private operational data. Collect informed consent, restrict access by role, define retention with the municipality, and avoid placing citizen names, phone numbers, exact residential details, or recordings on any public surface. Store only the minimum voice content needed for service, dispute handling, and audit.

## 12. Interfaces and system constraints

- **Citizen:** text/voice intake, consent review, receipt, status and timeline, evidence, and verification/dispute controls.
- **Officer:** assigned queue, deadline, field notes, evidence upload, proposed resolution, and refusal explanation.
- **Supervisor:** unassigned, due soon, overdue, escalated, and disputed queues; reassignment; extension requests; audit detail.
- **Administrator/auditor:** restricted policy version view and audit search. P0 policy entry may be an admin-controlled configuration file or form; a visual builder is P2.
- **Backend:** one workflow API serves all channels. Authorization, transition validation, SLA calculation, and audit writes cannot live solely in the client or ElevenLabs prompts.
- **Voice integration:** Use scoped read tools for status and narrowly scoped action endpoints for confirmed citizen or officer intents. Verify inbound webhook authenticity, sanitize tool inputs, and handle delayed or duplicated post-call delivery.
- **Resilience:** If speech recognition, telephony, or ElevenLabs is unavailable, citizens and staff can complete the workflow through the web interface. A failed notification does not alter the underlying case result.

The implementation stack is an engineering decision. The source memo suggests Next.js/TypeScript, PostgreSQL, a backend API, a background worker, object storage, and ElevenLabs; no vendor choice besides the proposed ElevenLabs voice layer is required by this PRD.

## 13. Pilot validation plan

1. Configure at least two categories with distinct SLA and evidence rules and one ward routing map.
2. Run a full case from voice intake through citizen-confirmed closure in each pilot language; compare original transcript with the confirmed case.
3. Attempt forbidden transitions through direct API calls and voice tools, then inspect refusal reasons and audit records.
4. Fast-forward a test clock through warning and two escalation levels; replay worker jobs to verify idempotency.
5. Submit a resolution without evidence, then with evidence; dispute it and send it through supervisor review and rework.
6. Test wrong-role access, cross-citizen access, concurrent transitions, repeated webhook requests, and voice-provider outage with text fallback.
7. Conduct usability sessions with citizens and field staff, including users who prefer Marathi or Hindi and users who need slower spoken prompts.

## 14. Decisions needed before production

| Decision | Proposed pilot default | Owner |
|---|---|---|
| Official categories, ward boundaries, and department responsibilities | Small municipality-approved catalog | Municipal operations |
| SLA duration and calendar for each category | Configured pilot values, clearly labeled | Municipal policy owner |
| Citizen verification window and handling of no response | Remain pending; supervisor review after configured window | Municipal policy/legal owner |
| Appeals and reopening | Excluded from P0 until rule, deadline, and actor are approved | Municipal policy/legal owner |
| Identity proof for phone actions | Phone OTP plus case association; assess assisted access | Security/product |
| Voice transcript/recording retention and consent language | Institution-approved schedule and localized consent | Privacy/legal owner |
| Sensitive complaint categories | Exclude from pilot until redaction and access rules are defined | Municipal operations/privacy |

## 15. Sources and research notes

1. [PIB: 2025 grievance volume and central disposal time](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2241740&lang=1&reg=3), checked 11 October 2026.
2. [PIB: 2025 State/UT disposal time](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2223641&lang=2&reg=48), checked 11 October 2026.
3. [PIB: Samadhan Didi launch](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2266985&lang=1&reg=1), checked 11 October 2026.
4. [PRS Legislative Research: grievance redressal mechanisms](https://prsindia.org/policy/report-summaries/strengthening-of-grievance-redressal-mechanisms), cited in the source memo; detailed recommendations should be checked before use in policy design.
5. [ElevenLabs: tools](https://elevenlabs.io/docs/eleven-agents/customization/tools), checked 11 October 2026.
6. [ElevenLabs: post-call webhooks](https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks), checked 11 October 2026.
7. [Swachhata Integration FAQ URL from source memo](https://www.swachh.city/assets/files/Integration_FAQ_V2.pdf), returned 404 on 11 October 2026; no SLA value from it is treated as verified policy.
