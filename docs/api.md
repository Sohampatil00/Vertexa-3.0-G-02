# Proposed API contract

**Status:** Phases 1–4 implement case operations, private evidence, SLA history, notifications, explicit citizen verification, and supervisor rework. `/v1/auth/login` and `/v1/auth/logout` provide local account sessions. Voice endpoints remain planned. Run the [backend](./backend.md) to inspect generated OpenAPI at `/docs` and `/openapi.json`.

Current submission requires a configured category and ward as well as description, location, and confirmation, so a provisional demo deadline can be pinned immediately. Validation confirms those values; correction cannot silently change the original deadline. Direct voice commands remain refused; Phase 5 submission uses the verified voice-session routes described below.

## Conventions

- Authenticate every nonpublic request. The server derives roles and jurisdiction from credentials and stored grants.
- All governed `POST` commands require `Idempotency-Key`; state-changing case commands also require `If-Match` with the current case version or an equivalent `expected_version` field.
- Responses include `request_id`. Dates are ISO 8601 instants in UTC; clients display the configured municipal time zone.
- Voice tools call only operation-specific endpoints after identity and intent confirmation. A provider webhook signature proves source delivery, **not** citizen identity or authorization.
- Public case IDs are opaque and not sufficient to read private details.

## Read endpoints

| Method and path | Audience | Result |
|---|---|---|
| `GET /v1/me` | Authenticated user | Identity, permitted role scopes, language preference |
| `GET /v1/cases` | Citizen/staff | Cases filtered by citizen ownership, assignment, or jurisdiction; pagination and allowed filters |
| `GET /v1/cases/{id}` | Authorized user | Current state, owner/department, deadline, SLA status, escalation level, policy version, case version |
| `GET /v1/cases/{id}/timeline` | Authorized user | Role-filtered accepted events and safe descriptions; refused attempts only to permitted staff/auditors |
| `GET /v1/cases/{id}/allowed-actions` | Authorized user | Actions possible for the actor at the observed version, with missing requirements where safe to reveal |
| `GET /v1/policies/{version}` | Admin/auditor | Published policy definition and checksum |

Phase 2 also implements `GET /v1/intake-options` (active demo catalog), `GET /v1/operations/summary` (counts within scope), `GET /v1/cases/{id}/operations` (pinned catalog, eligible officer choices for dispatchers/supervisors, owner name, ownership history for supervisors/ward heads/auditors), and `GET /v1/cases/{id}/evidence` with authenticated `GET /v1/cases/{id}/evidence/{evidence_id}` downloads. Case lists accept `state`, `owned`, `limit`, and `offset`; scope restrictions apply before filters. See [backend setup](./backend.md) for upload headers and storage limits.

Read responses are projections; a citizen must never receive another citizen's contact data or internal-only audit details.

## Governed command endpoints

| Method and path | Actor | Request essentials | Result |
|---|---|---|---|
| `POST /v1/cases` | Citizen | Description, location, evidence refs, explicit confirmation, channel | `SUBMITTED` case, public ID, deadline, version |
| `POST /v1/cases/{id}/validate` | Intake officer | Confirmed category, ward, jurisdiction, department | `VALIDATED` case version |
| `POST /v1/cases/{id}/reject` | Intake officer | Standard reason code and explanation | `REJECTED` case version |
| `POST /v1/cases/{id}/assign` | Dispatcher/supervisor | Officer, department, reason | `ASSIGNED` case version and assignment ID |
| `POST /v1/cases/{id}/accept-assignment` | Assigned officer | Explicit acceptance | `IN_PROGRESS` case version |
| `POST /v1/cases/{id}/resolution` | Assigned officer | Approved note, completed evidence refs | `RESOLUTION_SUBMITTED` then workflow verification request |
| `POST /v1/cases/{id}/verification` | Verified citizen | `ACCEPT` or `DISPUTE`, explicit confirmation; statement required for dispute | `CLOSED` or internally routed `SUPERVISOR_REVIEW` case version |
| `POST /v1/cases/{id}/review` | Supervisor | Rework decision, owner, reason | `ASSIGNED` or `IN_PROGRESS` case version |
| `POST /v1/cases/{id}/deadline-extension` | Authorized supervisor | New deadline and reason | Updated SLA, audit event, citizen notification request |
| `POST /v1/cases/{id}/evidence?kind=...` | Current assigned officer, in progress | Raw image bytes; MIME type, SHA-256 header, idempotency key, case version | Verified private evidence record; workflow version unchanged |

The `resolution` endpoint should commit the officer action and enqueue or perform the deterministic transition to `CITIZEN_VERIFICATION` exactly once. The API must expose the actual committed state consistently; it must not report a state transition before its transaction succeeds.

Phase 3 implements `GET /v1/notifications` and `GET /v1/cases/{id}/sla`. A scoped supervisor can also call `POST /v1/cases/{id}/notification-retry` with `message_id` and `reason`, an idempotency key, and current case version. The message must belong to the case and be `FAILED`. See [SLA operations](./sla-operations.md) for delivery and retry contracts.

Phase 4 adds `GET /v1/cases/{id}/resolution`, returning the latest accepted resolution note, its evidence IDs, submission time, and the current dispute statement through rework until a newer resolution is submitted. The read uses the same case scope check as the case detail. Private evidence still requires authenticated download. Case responses include `verification_due_at` and `verification_alerted_at`; `GET /v1/operations/summary` includes `verification_waiting` for scoped pending cases flagged after the policy window. `GET /v1/cases?verification_waiting=true` filters the caller's visible queue to those flagged cases.

## Voice integration endpoints

| Method and path | Purpose |
|---|---|
| `POST /v1/voice/session` | Verified citizen, explicit consent, en/hi/mr language; returns session ID, expiry and a private single-use signed URL. |
| `POST /v1/voice/{id}/draft` | Validate four intake fields and retain the browser transcript snapshot separately; return a review hash. |
| `POST /v1/voice/{id}/confirm` | Explicit screen confirmation and matching draft hash; atomically submit once and link the voice audit. |
| `GET /v1/voice/{id}/status/{case_id}` | Read only the session citizen’s own case reference, state and current deadline. |
| `POST /v1/voice/{id}/cancel` | End the session and refuse subsequent submissions. |
| `POST /v1/webhooks/elevenlabs` | Verify provider signature, deduplicate conversation/event ID, store permitted post-call metadata; never directly mutate a case from a summary. |

The voice agent receives a minimal authorized status projection. See [voice setup and safeguards](./voice-access.md). If an answer is not present in the API response, the agent should say it cannot verify the fact.

## Response and refusal shape

```json
{
  "error": {
    "code": "INVALID_TRANSITION",
    "message": "This case cannot move from ASSIGNED to CLOSED. The assigned officer must start work, submit a resolution, and obtain citizen verification.",
    "case_version": 4
  },
  "request_id": "req_01..."
}
```

Use `400` for malformed input, `401` for unauthenticated requests, `403` for authenticated lack of permission, `404` when a case is outside the caller's visibility, `409` for invalid transition or stale case version, `422` for missing policy-required data, and `503` when a required dependency prevents a safe mutation. The server logs a refused governed attempt with a safe reason code. It must not reveal case state or ownership to a caller who cannot see the case.

## Example successful command

```http
POST /v1/cases/GF-2026-1007/accept-assignment
Authorization: Bearer <token>
Idempotency-Key: 29ac... 
If-Match: "4"
Content-Type: application/json

{"confirmation": true}
```

The response returns the new case version and corresponding audit event ID. Repeating the exact key and request returns the same result; reusing the key for a different request is a conflict.
