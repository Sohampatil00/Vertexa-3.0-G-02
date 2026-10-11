# Citizen verification and rework

Phase 4 presents the latest submitted resolution note and its selected private evidence to the case's citizen. A verified citizen selects **Accept** or **Dispute**, confirms the choice, and supplies a statement for a dispute. Acceptance requires an additional closure confirmation. The API still checks role, case association, identity verification, current state, current case version, and idempotency key.

Acceptance moves the case to `CLOSED`, records a terminal time, and ends the active assignment. A dispute moves it through `DISPUTED` to `SUPERVISOR_REVIEW` in the same transaction and queues a supervisor notification. The supervisor sees the citizen's statement and chooses to retain the current owner for `IN_PROGRESS` rework or reassign an eligible officer into `ASSIGNED`. Rework can submit a new resolution and start a new citizen verification cycle.

The policy's `verification_review_after_hours` is an elapsed-hour demo window. Migration `0005` schedules already pending cases using their latest verification request and pinned policy. Each new resolution schedules a fresh window. The worker flags an unanswered case once per cycle, writes an audit event, and queues an in-app alert to scoped supervisors. The supervisor dashboard counts flagged pending cases and can filter its queue to them. A failed alert remains visible in delivery diagnostics and can be retried. A citizen response clears the active wait flag. **The timer never closes, disputes, or otherwise decides the case.**

Run `uv run govfix worker --once` for one check or `uv run govfix worker --poll-seconds 30` continuously. The `verification.cases_flagged` result counts new wait alerts. See [SLA operations](./sla-operations.md) for notification retry behavior.

Validation: `uv run pytest tests/test_verification.py -q` and `uv run python scripts/test_browser.py`. The local `--verified` account flag records administrator-established demo identity; production citizen identity proof remains open.
