# Delivery roadmap

**Baseline:** [PRD](../prd.md) P0 is the first release. Dates depend on team capacity and pilot partner availability; milestones below are ordered by dependency rather than calendar promise. Update [implemented.md](./implemented.md) as work actually lands.

| Phase | Deliverable | Exit criterion |
|---|---|---|
| 0. Policy and pilot setup | Named pilot municipality, categories, wards, roles, evidence rules, sample cases, and approved SLA/calendar policy | Policy owner signs off on a versioned pilot configuration; open production decisions are assigned |
| 1. Workflow foundation | Authentication, case model, policy loader, state machine, transition API, and audit | Valid path succeeds; skipped state, wrong role, wrong owner, and missing data are refused and audited |
| 2. Operations | Intake validation, assignment, officer queue, evidence upload, supervisor view | Full text-input case reaches resolution submission with one current owner and complete ownership history |
| 3. SLA automation | Deadline calculation, warning, breach escalation, notifications, supervisor extension | Clock-driven tests show one escalation per threshold despite worker retries; failures remain visible |
| 4. Citizen verification | Resolution presentation, accept/dispute, supervisor review and rework | Accept closes; dispute prevents closure and enters supervised rework; silence does not auto-close |
| 5. P0 voice access | ElevenLabs intake, read-back, confirmed submission, and authenticated status lookup | Language and identity checks pass; text workflow remains usable during provider outage |
| 5b. P1 voice operations | Outbound citizen verification, officer dictation, and spoken timeline explanations | Explicit intent and identity checks pass for every action; failed or ambiguous calls leave case state unchanged |
| 6. Pilot hardening | Security review, accessibility sessions, load/retry tests, observability, backup/restore exercise | [Validation gates](./validation.md) pass and pilot owner accepts known limits |

Phase 5 application integration is implemented locally; provider provisioning and live multilingual validation remain open. See [voice access](./voice-access.md). The next P0 step is Phase 6 pilot hardening after completing the live voice gate; Phase 5b remains optional P1 work.

## Build order within P0

1. Define effective policy version and audited transition transaction before building multiple user interfaces.
2. Build text intake and one end-to-end case path to exercise backend rules.
3. Add deadline worker and escalation to the same audit and policy model.
4. Add resolution evidence and citizen verification, then implement voice as a channel to the proven API.
5. Add the restricted supervisor and auditor views needed to demonstrate refusals and escalations.

## Deferred work

The [PRD](../prd.md) places officer voice dictation, outbound verification calls, and spoken timeline explanations in P1. A pilot may pull a narrow outbound verification demonstration forward only after verified identity, consent, replay protection, and the text verification flow work. A visual policy builder, public map, duplicate clustering, anomaly analytics, and cross-institution templates remain P2.

## Dependencies and risks

| Dependency or risk | Mitigation |
|---|---|
| Municipal policy is unavailable | Use clearly labeled demo rules; do not present them as official SLAs |
| Voice recognition or code-switching quality varies | Test with pilot speakers in Marathi, Hindi, and English; retain transcript and text fallback |
| Citizen does not answer verification | Keep case pending and surface it for supervisor review under approved policy |
| Retried jobs or webhooks duplicate actions | Use idempotency keys, unique constraints, and transactional audit writes |
| Policy changes during open cases | Pin each case to an effective policy version and define controlled migration separately |

## Scope change rule

A feature moves into P0 only if its acceptance criterion, owner, and impact on the critical workflow are recorded in [decisions.md](./decisions.md) and the [PRD](../prd.md) is updated. Do not trade away transition enforcement, role checks, escalation, or audit to add a presentation feature.


## Phase 6 progress

Supabase Data API permissions and login-to-case verification are complete. The authentication
hardening slice adds shared login rate limits, a restricted PostgreSQL backend login and
separate migration/administration credentials. Next: readiness checks, structured logs and
worker failure visibility, followed by backup/restore and pilot load/accessibility validation.
