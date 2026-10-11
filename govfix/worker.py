"""Durable SLA scheduling and transactional in-app delivery, safe for concurrent workers."""

from datetime import timedelta

from sqlalchemy import or_, select
from sqlalchemy.exc import SQLAlchemyError

from govfix.auth import load_actor
from govfix.database import as_utc, utcnow, write_transaction
from govfix.errors import Refusal
from govfix.models import AuditEvent, Case, Notification, OutboxMessage, RoleGrant, User
from govfix.sla import record_due
from govfix.workflow import Workflow, visible

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

    @staticmethod
    def recipients(session, case, message):
        role = message.payload.get("recipient_role")
        recipient_id = message.payload.get("recipient_id")
        if message.kind in {"CITIZEN_VERIFICATION_REQUEST", "DEADLINE_EXTENDED"}:
            role, recipient_id = "CITIZEN", case.citizen_id
        elif message.kind == "SUPERVISOR_REVIEW_REQUEST":
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
            # An unassigned warning must stay visibly undeliverable until ownership exists.
            if case.owner_id is None:
                return []
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
        with self.sessions() as session:
            ids = list(
                session.scalars(
                    select(OutboxMessage.id)
                    .where(
                        OutboxMessage.status.in_(["PENDING", "RETRY"]),
                        or_(
                            OutboxMessage.next_attempt_at.is_(None),
                            OutboxMessage.next_attempt_at <= now,
                        ),
                    )
                    .order_by(OutboxMessage.created_at, OutboxMessage.id)
                    .limit(limit)
                ).all()
            )
        counts = {"DELIVERED": 0, "RETRY": 0, "FAILED": 0, "SKIPPED": 0, "UNAVAILABLE": 0}
        for message_id in ids:
            try:
                counts[self.deliver(message_id)] += 1
            except SQLAlchemyError:
                # A failed DB transaction leaves the message due, with no partial delivery.
                counts["UNAVAILABLE"] += 1
        return counts

    def run_once(self, limit=100):
        return {"sla": self.scan(limit), "notifications": self.dispatch(limit)}
