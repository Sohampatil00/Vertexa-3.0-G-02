"""Durable SLA scheduling and transactional in-app delivery, safe for concurrent workers."""

from datetime import timedelta

from sqlalchemy import delete, or_, select
from sqlalchemy.exc import SQLAlchemyError

from govfix.auth import load_actor
from govfix.database import as_utc, utcnow, write_transaction
from govfix.errors import Refusal
from govfix.models import (
    AuditEvent,
    Case,
    LoginBudget,
    Notification,
    OutboxMessage,
    RoleGrant,
    User,
    new_id,
)
from govfix.sla import record_due
from govfix.workflow import Workflow, snapshot, visible

MAX_ATTEMPTS = 5


class Worker:
    def __init__(self, sessions, settings, *, clock=utcnow):
        self.sessions = sessions
        self.workflow = Workflow(sessions, settings)
        self.clock = clock

    def scan(self, limit=100):
        now = as_utc(self.clock())
        with write_transaction(self.sessions) as session:
            cases = session.scalars(
                select(Case)
                .where(Case.terminal_at.is_(None), Case.next_sla_check <= now)
                .order_by(Case.next_sla_check, Case.id)
                .limit(limit)
                .with_for_update(skip_locked=True)
            ).all()
            count = sum(
                record_due(
                    session, case, self.workflow.policy_for(session, case), now, self.workflow
                )
                for case in cases
            )
        return {"cases_checked": len(cases), "thresholds_recorded": count}

    def scan_verification(self, limit=100):
        now = as_utc(self.clock())
        with write_transaction(self.sessions) as session:
            cases = session.scalars(
                select(Case)
                .where(
                    Case.workflow_state == "CITIZEN_VERIFICATION",
                    Case.verification_due_at <= now,
                    Case.verification_alerted_at.is_(None),
                )
                .order_by(Case.verification_due_at, Case.id)
                .limit(limit)
                .with_for_update(skip_locked=True)
            ).all()
            for case in cases:
                before = snapshot(case)
                case.verification_alerted_at = now
                case.version += 1
                event = self.workflow.audit(
                    session,
                    actor=None,
                    case=case,
                    operation="verification-wait-review",
                    request_id=f"job_{new_id()}",
                    role="WORKFLOW_ENGINE",
                    occurred_at=now,
                    before=before,
                    details={"verification_due_at": as_utc(case.verification_due_at).isoformat()},
                )
                session.add(
                    OutboxMessage(
                        event_id=event.id,
                        kind="VERIFICATION_WAIT_REVIEW",
                        payload={"case_id": case.public_id, "recipient_role": "SUPERVISOR"},
                    )
                )
        return {"cases_flagged": len(cases)}

    @staticmethod
    def recipients(session, case, message):
        role = message.payload.get("recipient_role")
        recipient_id = message.payload.get("recipient_id")
        if message.kind in {"CITIZEN_VERIFICATION_REQUEST", "DEADLINE_EXTENDED"}:
            role, recipient_id = "CITIZEN", case.citizen_id
        elif message.kind in {"SUPERVISOR_REVIEW_REQUEST", "VERIFICATION_WAIT_REVIEW"}:
            role = "SUPERVISOR"
        elif message.kind != "SLA_THRESHOLD":
            raise Refusal("UNSUPPORTED_NOTIFICATION", "No notification adapter for this kind.", 503)
        if role == "CITIZEN":
            recipient_id = case.citizen_id
        if role == "OFFICER":
            recipient_id = case.owner_id
        if recipient_id:
            user = session.get(User, recipient_id)
            if not user or not user.active:
                return []
            actor = load_actor(session, user.id)
            return [user.id] if visible(actor, case) and actor.has_role(role, case) else []
        if role == "OFFICER":
            return []
        if role not in {"SUPERVISOR", "WARD_HEAD", "INTAKE_OFFICER", "DISPATCHER", "AUDITOR"}:
            return []
        return list(
            session.scalars(
                select(User.id)
                .join(RoleGrant)
                .where(
                    User.active.is_(True),
                    RoleGrant.role == role,
                    RoleGrant.ward == case.ward,
                    (RoleGrant.department == case.department) | RoleGrant.department.is_(None),
                )
                .distinct()
            ).all()
        )

    def deliver(self, message_id):
        now = as_utc(self.clock())
        with write_transaction(self.sessions) as session:
            # Case before outbox is the same lock order used by administrative retry commands.
            case = session.scalar(
                select(Case)
                .join(AuditEvent, AuditEvent.case_id == Case.id)
                .join(OutboxMessage, OutboxMessage.event_id == AuditEvent.id)
                .where(OutboxMessage.id == message_id)
                .with_for_update(of=Case, skip_locked=True)
            )
            if case is None:
                return "SKIPPED"
            message = session.scalar(
                select(OutboxMessage)
                .where(OutboxMessage.id == message_id)
                .with_for_update(skip_locked=True)
            )
            if (
                message is None
                or message.status not in {"PENDING", "RETRY"}
                or (message.next_attempt_at and as_utc(message.next_attempt_at) > now)
            ):
                return "SKIPPED"
            message.attempts += 1
            try:
                recipients = self.recipients(session, case, message)
                if not recipients:
                    raise Refusal("RECIPIENT_UNAVAILABLE", "No eligible active recipient.", 503)
                for user_id in recipients:
                    session.add(
                        Notification(
                            message_id=message.id,
                            recipient_id=user_id,
                            case_id=case.id,
                            kind=message.kind,
                            created_at=now,
                        )
                    )
                message.status = "DELIVERED"
                message.delivered_at = now
                message.next_attempt_at = None
                message.last_error = None
                self.workflow.audit(
                    session,
                    actor=None,
                    case=case,
                    operation="notification-delivered",
                    request_id=f"job_{message.id}",
                    role="WORKFLOW_ENGINE",
                    occurred_at=now,
                    details={"message_id": message.id, "recipient_count": len(recipients)},
                )
            except Refusal as refusal:
                message.status = "FAILED" if message.attempts >= MAX_ATTEMPTS else "RETRY"
                message.last_error = refusal.code
                message.next_attempt_at = (
                    now + timedelta(seconds=30 * 2 ** (message.attempts - 1))
                    if message.status == "RETRY"
                    else None
                )
                self.workflow.audit(
                    session,
                    actor=None,
                    case=case,
                    operation="notification-failed",
                    request_id=f"job_{message.id}",
                    role="WORKFLOW_ENGINE",
                    reason=refusal.code,
                    occurred_at=now,
                    details={"message_id": message.id, "attempt": message.attempts},
                )
            return message.status

    def dispatch(self, limit=100):
        now = as_utc(self.clock())
        counts = {"DELIVERED": 0, "RETRY": 0, "FAILED": 0, "SKIPPED": 0, "UNAVAILABLE": 0}
        cursor = None
        processed = 0
        # Bounded keyset pages let unlocked cases progress behind a locked oldest case.
        for _page in range(10):
            with self.sessions() as session:
                query = select(OutboxMessage.id, OutboxMessage.created_at).where(
                    OutboxMessage.status.in_(["PENDING", "RETRY"]),
                    or_(
                        OutboxMessage.next_attempt_at.is_(None),
                        OutboxMessage.next_attempt_at <= now,
                    ),
                )
                if cursor:
                    created_at, message_id = cursor
                    query = query.where(
                        or_(
                            OutboxMessage.created_at > created_at,
                            (OutboxMessage.created_at == created_at)
                            & (OutboxMessage.id > message_id),
                        )
                    )
                rows = session.execute(
                    query.order_by(OutboxMessage.created_at, OutboxMessage.id).limit(
                        limit - processed
                    )
                ).all()
            if not rows:
                break
            for message_id, created_at in rows:
                cursor = (created_at, message_id)
                try:
                    result = self.deliver(message_id)
                except SQLAlchemyError:
                    result = "UNAVAILABLE"
                counts[result] += 1
                if result != "SKIPPED":
                    processed += 1
                if processed >= limit:
                    return counts
        return counts

    def prune_login_budgets(self, limit=100):
        now = as_utc(self.clock())
        with write_transaction(self.sessions) as session:
            keys = session.scalars(
                select(LoginBudget.key)
                .where(LoginBudget.expires_at <= now)
                .order_by(LoginBudget.expires_at, LoginBudget.key)
                .limit(limit)
                .with_for_update(skip_locked=True)
            ).all()
            if keys:
                session.execute(
                    delete(LoginBudget).where(
                        LoginBudget.key.in_(keys), LoginBudget.expires_at <= now
                    )
                )
        return len(keys)

    def run_once(self, limit=100):
        try:
            return {
                "sla": self.scan(limit),
                "verification": self.scan_verification(limit),
                "notifications": self.dispatch(limit),
                "login_budgets_pruned": self.prune_login_budgets(limit),
            }
        except SQLAlchemyError:
            # Keep polling through transient database failure; no transaction can partially commit.
            return {"error": "DEPENDENCY_UNAVAILABLE"}
