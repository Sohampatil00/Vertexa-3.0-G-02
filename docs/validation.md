# Validation and release gates

**Status:** Automated backend, browser, worker retry/load, private evidence and snapshot restore checks are recorded in [implemented.md](./implemented.md). ElevenLabs agents are provisioned, with simulated browser/provider contracts tested. Human multilingual/accessibility sessions, municipal approval and the latest deployment remain release gates.

## Test levels

| Level | Purpose | Evidence to retain |
|---|---|---|
| Policy unit tests | Exercise all allowed and forbidden edges, roles, ownership, and required data | Test output and policy version |
| API integration tests | Verify transaction, audit, concurrency, idempotency, and error codes | Test output against a disposable database |
| Worker tests | Verify deadline thresholds, retry, notification failure, and no duplicate escalation | Fake-clock traces and event rows |
| End-to-end tests | Complete text and voice journeys for each role | Case IDs, timeline, screenshots/recordings with safe demo data |
| Usability and accessibility sessions | Check language, read-back, comprehension, and text fallback | Consent-based observations and issue list |
| Security review | Check authorization, private evidence, webhook authenticity, and data leakage | Findings and remediation status |

## Mandatory P0 scenarios

| ID | Scenario | Expected result |
|---|---|---|
| V-01 | Citizen submits by text with required fields | Case is `SUBMITTED`; case ID, policy version, deadline, and audit event exist. |
| V-02 | Citizen completes voice intake, corrects a transcription error, then confirms | Official case reflects corrected fields; original transcript and confirmation are linked; no case exists before confirmation. |
| V-03 | Officer requests `ASSIGNED → CLOSED` by API and voice | Both attempts fail with `INVALID_TRANSITION`; case unchanged; refused attempts audited. |
| V-04 | User with wrong role or officer without current assignment attempts work | Request fails; protected case details are not disclosed; attempt is auditable where the case is visible to the server. |
| V-05 | Assigned officer submits resolution without required note or evidence | `EVIDENCE_REQUIRED` or equivalent; no state change; refusal audited. |
| V-06 | Two requests use the same case version simultaneously | At most one transition succeeds; other receives a stale-version conflict and audit record. |
| V-07 | Same idempotency key and payload are retried | One case mutation and one accepted audit event; repeat returns original outcome. |
| V-08 | Fake clock crosses warning and two escalation thresholds; worker runs twice at each point | One event per threshold, correct recipients, visible levels, no duplicate escalation. |
| V-09 | Notification provider fails after escalation commits | Escalation remains recorded; delivery failure is visible and retryable. |
| V-10 | Verified citizen accepts submitted resolution | Case becomes `CLOSED`; verification actor and time recorded. |
| V-11 | Verified citizen disputes resolution | Case becomes `DISPUTED`, then `SUPERVISOR_REVIEW`; supervisor assigns rework; case does not close. |
| V-12 | Verification request receives no response | Case stays pending; configured review task appears; no automatic closure. |
| V-13 | Citizen requests another citizen's case, evidence, or timeline | Access denied without private information leakage. |
| V-14 | Forged or replayed ElevenLabs webhook arrives | Signature or deduplication rejects it; no case mutation. |
| V-15 | Voice provider is unavailable | Citizen can submit, check status, and verify by text; core workflow and escalation continue. |
| V-16 | Published policy changes while an older case is open | Older case retains its pinned version and deadline until an explicit audited exception/migration. |

## Voice and accessibility checks

Use representative pilot speakers for Marathi, Hindi, English, and mixed-language utterances. Verify named landmarks, numbers, dates, case IDs, and yes/no intent by read-back. Test slow speech, repeating details, one-question-at-a-time prompts, keyboard navigation, screen reader labels, and a full text path. Record actual completion and correction rates; do not claim multilingual quality from provider documentation alone.

## Release gates

P0 is ready for a controlled pilot only when:

1. Every mandatory scenario above has a recorded pass or an explicitly accepted, bounded exception.
2. No invalid or unauthorized state change succeeds in direct API tests.
3. Every governed accepted and refused attempt writes the expected audit record; audit write failure blocks mutation.
4. Escalation fires once per configured threshold under retries and restart.
5. A named policy owner approves the pilot categories, SLA/calendar, evidence rules, and verification window.
6. A security/privacy owner approves identity, consent, retention, access scopes, backup, and incident handling.
7. The [root README](../README.md) includes actual setup, run, test, and deployment steps, and [implemented.md](./implemented.md) reflects verified code.

P1 voice features require additional outbound-call consent and identity tests before use with real citizens. P2 analytics must be evaluated for fairness and privacy before deployment.
