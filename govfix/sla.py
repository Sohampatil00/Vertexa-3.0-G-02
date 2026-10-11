"""Elapsed-hour scheduling shared by projections, commands, and workers."""

from sqlalchemy import select

from govfix.database import as_utc
from govfix.models import SlaThreshold

ESCALATION_LEVELS = {"WARNING": 0, "SUPERVISOR_ESCALATION": 1, "WARD_HEAD_ESCALATION": 2}


def threshold_time(case, threshold):
    submitted = as_utc(case.submitted_at)
    return submitted + (as_utc(case.current_deadline) - submitted) * (
        threshold["percent_of_sla"] / 100
    )


def recorded_thresholds(session, case):
    return set(
        session.scalars(
            select(SlaThreshold.threshold_key).where(
                SlaThreshold.case_id == case.id, SlaThreshold.policy_version == case.policy_version
            )
        ).all()
    )


def schedule_next(case, policy, recorded):
    remaining = [
        threshold_time(case, threshold)
        for threshold in policy["thresholds"]
        if threshold["key"] not in recorded
    ]
    case.next_sla_check = min(remaining) if remaining and case.terminal_at is None else None


def record_due(session, case, policy, now, workflow):
    """Caller holds the case lock; history, level, audit and outbox commit together."""
    from govfix.models import OutboxMessage, new_id
    from govfix.workflow import snapshot

    if case.terminal_at is not None or case.workflow_state in {"CLOSED", "REJECTED"}:
        case.next_sla_check = None
        return 0
    recorded = recorded_thresholds(session, case)
    count = 0
    for threshold in policy["thresholds"]:
        key = threshold["key"]
        due = threshold_time(case, threshold)
        if key in recorded or now < due:
            continue
        before = snapshot(case)
        case.escalation_level = max(case.escalation_level, ESCALATION_LEVELS[key])
        case.version += 1
        event = workflow.audit(
            session,
            actor=None,
            case=case,
            operation="sla-threshold",
            request_id=f"job_{new_id()}",
            role="WORKFLOW_ENGINE",
            before=before,
            occurred_at=now,
            details={
                "threshold": key,
                "threshold_at": due.isoformat(),
                "deadline": as_utc(case.current_deadline).isoformat(),
            },
        )
        session.add(
            SlaThreshold(
                case_id=case.id,
                policy_version=case.policy_version,
                threshold_key=key,
                event_id=event.id,
                threshold_at=due,
                observed_at=now,
                deadline=case.current_deadline,
            )
        )
        # Snapshot the current owner; escalation recipients are role-scoped at delivery time.
        payload = {
            "case_id": case.public_id,
            "recipient_role": threshold["recipient_role"],
            "threshold": key,
            "threshold_at": due.isoformat(),
        }
        if threshold["recipient_role"] == "OFFICER":
            payload["recipient_id"] = case.owner_id
        session.add(OutboxMessage(event_id=event.id, kind="SLA_THRESHOLD", payload=payload))
        recorded.add(key)
        count += 1
    schedule_next(case, policy, recorded)
    session.flush()
    return count
