"""All governed case changes and their audit records share one transaction."""

import hashlib
import json
from datetime import datetime, timedelta

from pydantic import ValidationError
from sqlalchemy import select

from govfix.auth import Actor, load_actor
from govfix.command_headers import require_key, require_version
from govfix.database import as_utc, utcnow, write_transaction
from govfix.errors import Refusal
from govfix.evidence import EvidenceStore
from govfix.models import (
    Assignment,
    AuditEvent,
    Case,
    Evidence,
    IdempotencyRecord,
    OutboxMessage,
    PolicyVersion,
    User,
    new_id,
)
from govfix.schemas import COMMAND_SCHEMAS
from govfix.sla import record_due, recorded_thresholds, schedule_next, threshold_time

STAFF_ROLES = {"INTAKE_OFFICER", "DISPATCHER", "OFFICER", "SUPERVISOR", "WARD_HEAD", "AUDITOR"}
OPERATION_EDGES = {
    "validate": ("SUBMITTED", ("VALIDATED",)),
    "reject": ("SUBMITTED", ("REJECTED",)),
    "assign": ("VALIDATED", ("ASSIGNED",)),
    "accept-assignment": ("ASSIGNED", ("IN_PROGRESS",)),
    "resolution": ("IN_PROGRESS", ("RESOLUTION_SUBMITTED",)),
    "verification": ("CITIZEN_VERIFICATION", ("CLOSED", "DISPUTED")),
    "review": ("SUPERVISOR_REVIEW", ("ASSIGNED", "IN_PROGRESS")),
}


def operation_for_edge(source: str, target: str) -> str | None:
    return next(
        (
            operation
            for operation, (state, targets) in OPERATION_EDGES.items()
            if source == state and target in targets
        ),
        None,
    )


def visible(actor: Actor, case: Case) -> bool:
    return (actor.id == case.citizen_id and actor.has_role("CITIZEN")) or any(
        actor.has_role(role, case) for role in STAFF_ROLES
    )


def snapshot(case: Case | None) -> dict | None:
    if case is None:
        return None
    return {
        "workflow_state": case.workflow_state,
        "version": case.version,
        "owner_id": case.owner_id,
        "category": case.category,
        "ward": case.ward,
        "department": case.department,
        "current_deadline": as_utc(case.current_deadline).isoformat(),
        "escalation_level": case.escalation_level,
        "verification_due_at": as_utc(case.verification_due_at).isoformat()
        if case.verification_due_at
        else None,
        "verification_alerted_at": as_utc(case.verification_alerted_at).isoformat()
        if case.verification_alerted_at
        else None,
    }


def project_case(case: Case, policy: dict) -> dict:
    submitted = as_utc(case.submitted_at)
    deadline = as_utc(case.current_deadline)
    observed = as_utc(case.terminal_at) if case.terminal_at else utcnow()
    warning = next(t for t in policy["thresholds"] if t["key"] == "WARNING")
    warning_at = threshold_time(case, warning)
    sla_status = (
        "OVERDUE" if observed >= deadline else ("WARNING" if observed >= warning_at else "ON_TRACK")
    )
    return {
        "id": case.public_id,
        "workflow_state": case.workflow_state,
        "description": case.description,
        "location": case.location,
        "latitude": case.latitude,
        "longitude": case.longitude,
        "accuracy_m": case.accuracy_m,
        "category": case.category,
        "ward": case.ward,
        "department": case.department,
        "owner_id": case.owner_id,
        "policy_version": case.policy_version,
        "version": case.version,
        "submitted_at": submitted.isoformat(),
        "original_deadline": as_utc(case.original_deadline).isoformat(),
        "current_deadline": deadline.isoformat(),
        "timezone": policy["timezone"],
        "calendar_basis": policy["calendar"]["basis"],
        "sla_status": sla_status,
        "escalation_level": case.escalation_level,
        "verification_due_at": as_utc(case.verification_due_at).isoformat()
        if case.verification_due_at
        else None,
        "verification_alerted_at": as_utc(case.verification_alerted_at).isoformat()
        if case.verification_alerted_at
        else None,
    }


class Workflow:
    def __init__(self, sessions, settings):
        self.sessions = sessions
        self.settings = settings

    def policy_for(self, session, case: Case | None) -> dict:
        version = case.policy_version if case else self.settings.policy_version
        policy = session.get(PolicyVersion, version)
        if policy is None:
            raise Refusal("POLICY_NOT_FOUND", "The required policy is unavailable.", 503)
        return policy.definition

    @staticmethod
    def audit(
        session,
        *,
        actor: Actor | None,
        case: Case | None,
        operation: str,
        request_id: str,
        role: str,
        before=None,
        reason=None,
        channel="TEXT",
        details=None,
        occurred_at=None,
    ):
        event = AuditEvent(
            id=new_id(),
            case_id=case.id if case else None,
            operation=operation,
            result="REFUSED" if reason else "ACCEPTED",
            reason_code=reason,
            actor_id=actor.id if actor else None,
            actor_role=role,
            channel=channel,
            case_version=case.version if case else None,
            policy_version=case.policy_version if case else None,
            request_id=request_id,
            before=before,
            after=snapshot(case),
            details=details or {},
            occurred_at=occurred_at or utcnow(),
        )
        session.add(event)
        session.flush()
        return event

    def execute(
        self,
        actor_id: str,
        operation: str,
        body: dict,
        key: str | None,
        expected_version: str | None,
        case_id: str | None,
        request_id: str,
    ):
        with write_transaction(self.sessions) as session:
            # Actor locks serialize idempotency keys, including concurrent case creation.
            actor = load_actor(session, actor_id, lock=True)
            case = (
                session.scalar(select(Case).where(Case.public_id == case_id).with_for_update())
                if case_id
                else None
            )
            before = snapshot(case)
            may_see = case is not None and visible(actor, case)
            digest = hashlib.sha256(
                json.dumps(
                    {"case_id": case_id, "body": body, "expected_version": expected_version},
                    sort_keys=True,
                    separators=(",", ":"),
                    allow_nan=False,
                ).encode()
            ).hexdigest()
            record = None
            role = actor.recorded_role
            channel = body.get("channel", "TEXT")
            if channel not in {"TEXT", "VOICE"}:
                channel = "TEXT"
            try:
                if case_id and not may_see:
                    raise Refusal("CASE_ACCESS_DENIED", "Case not found.", 404)
                require_key(key)
                record = session.scalar(
                    select(IdempotencyRecord).where(
                        IdempotencyRecord.actor_id == actor.id,
                        IdempotencyRecord.operation == operation,
                        IdempotencyRecord.key == key,
                    )
                )
                if operation == "submit" and not actor.has_role("CITIZEN"):
                    raise Refusal("ROLE_NOT_ALLOWED", "Only a citizen can submit a case.", 403)
                if record:
                    if record.request_hash != digest:
                        raise Refusal(
                            "IDEMPOTENCY_CONFLICT",
                            "This key was used for a different request.",
                            409,
                        )
                    return record.status_code, {**record.response, "request_id": request_id}
                if case:
                    require_version(expected_version, case.version)
                policy = self.policy_for(session, case)
                try:
                    command = COMMAND_SCHEMAS[operation].model_validate(body)
                except ValidationError as exc:
                    code = (
                        "EVIDENCE_REQUIRED"
                        if operation == "resolution"
                        and any(error["loc"][0] == "evidence_refs" for error in exc.errors())
                        else "REQUIRED_FIELD_MISSING"
                    )
                    raise Refusal(
                        code, "Required command fields are missing or invalid.", 422
                    ) from exc
                if command.channel == "VOICE":
                    raise Refusal(
                        "IDENTITY_OR_CONFIRMATION_REQUIRED",
                        "A verified voice session is required for voice actions.",
                        403,
                    )
                if case is None:
                    role = "CITIZEN"
                    case = self.submit(session, actor, command, policy)
                    event = self.audit(
                        session,
                        actor=actor,
                        case=case,
                        operation=operation,
                        request_id=request_id,
                        role=role,
                        before=before,
                    )
                else:
                    if (
                        operation not in {"deadline-extension", "notification-retry"}
                        and case.workflow_state != OPERATION_EDGES[operation][0]
                    ):
                        raise Refusal(
                            "INVALID_TRANSITION",
                            "This action is not allowed in the current state.",
                            409,
                        )
                    if operation in {"deadline-extension", "notification-retry"}:
                        if operation == "deadline-extension" and case.workflow_state in {
                            "CLOSED",
                            "REJECTED",
                        }:
                            raise Refusal(
                                "INVALID_TRANSITION", "Terminal cases cannot be extended.", 409
                            )
                        target, roles = case.workflow_state, ["SUPERVISOR"]
                    else:
                        target = self.target(operation, command)
                        roles = next(
                            (
                                edge["roles"]
                                for edge in policy["transitions"]
                                if edge["from"] == case.workflow_state and edge["to"] == target
                            ),
                            None,
                        )
                    if roles is None:
                        raise Refusal(
                            "INVALID_TRANSITION",
                            "This action is not allowed in the current state.",
                            409,
                        )
                    permitted_role = next(
                        (role for role in roles if actor.has_role(role, case)), None
                    )
                    if permitted_role is None:
                        raise Refusal(
                            "ROLE_NOT_ALLOWED", "Your role does not permit this action.", 403
                        )
                    role = permitted_role
                    if role == "OFFICER" and case.owner_id != actor.id:
                        raise Refusal(
                            "NOT_ASSIGNED_OWNER", "Only the current assigned officer may act.", 403
                        )
                    if role == "CITIZEN" and case.citizen_id != actor.id:
                        raise Refusal("CASE_ACCESS_DENIED", "Case not found.", 404)
                    if operation == "deadline-extension":
                        deadline = as_utc(datetime.fromisoformat(command.new_deadline))
                        now = utcnow()
                        if deadline <= max(as_utc(case.current_deadline), now) or deadline - as_utc(
                            case.submitted_at
                        ) > timedelta(days=3650):
                            raise Refusal(
                                "INVALID_DEADLINE",
                                "Choose a later future deadline within ten years of submission.",
                                422,
                            )
                        # Preserve crossed thresholds before moving the deadline.
                        record_due(session, case, policy, now, self)
                        before = snapshot(case)
                    self.apply(session, actor, case, operation, command, policy)
                    case.workflow_state = target
                    case.version += 1
                    if operation == "verification":
                        case.verification_due_at = None
                        case.verification_alerted_at = None
                    if target in {"CLOSED", "REJECTED"} and operation in {"verification", "reject"}:
                        case.terminal_at = utcnow()
                        case.next_sla_check = None
                        self.end_assignment(session, case)
                    session.flush()
                    details = command.model_dump(
                        exclude={"channel", "confirmation", "evidence_refs"}
                    )
                    if operation == "resolution":
                        details["evidence_refs"] = command.evidence_refs
                    event = self.audit(
                        session,
                        actor=actor,
                        case=case,
                        operation=operation,
                        request_id=request_id,
                        role=role,
                        before=before,
                        details=details,
                    )
                    if operation == "validate":
                        session.add(
                            OutboxMessage(
                                event_id=event.id,
                                kind="INTAKE_VALIDATED",
                                payload={
                                    "case_id": case.public_id,
                                    "recipient_role": "DISPATCHER",
                                    "intake_officer": actor.display_name,
                                },
                            )
                        )
                    if operation == "deadline-extension":
                        session.add(
                            OutboxMessage(
                                event_id=event.id,
                                kind="DEADLINE_EXTENDED",
                                payload={
                                    "case_id": case.public_id,
                                    "recipient_id": case.citizen_id,
                                    "old_deadline": before["current_deadline"],
                                    "new_deadline": as_utc(case.current_deadline).isoformat(),
                                    "reason": command.reason,
                                },
                            )
                        )
                    if operation == "resolution":
                        self.system_transition(
                            session,
                            case,
                            "CITIZEN_VERIFICATION",
                            request_id,
                            "request-verification",
                            "CITIZEN_VERIFICATION_REQUEST",
                        )
                    if operation == "verification" and target == "DISPUTED":
                        self.system_transition(
                            session,
                            case,
                            "SUPERVISOR_REVIEW",
                            request_id,
                            "route-dispute",
                            "SUPERVISOR_REVIEW_REQUEST",
                        )
                response = {
                    "case": project_case(case, policy),
                    "audit_event_id": event.id,
                    "request_id": request_id,
                }
                status = 201 if operation == "submit" else 200
            except Refusal as refusal:
                # All domain refusals precede mutation, and this commit stores only the attempt.
                self.audit(
                    session,
                    actor=actor,
                    case=case,
                    operation=operation,
                    request_id=request_id,
                    role=role,
                    before=before,
                    reason=refusal.code,
                    channel=channel,
                )
                response = refusal.response(request_id, case.version if may_see else None)
                status = refusal.status
            if (
                key
                and key.strip()
                and len(key) <= 200
                and record is None
                and status < 500
                and (not case_id or may_see)
            ):
                session.add(
                    IdempotencyRecord(
                        actor_id=actor.id,
                        operation=operation,
                        key=key,
                        request_hash=digest,
                        response=response,
                        status_code=status,
                    )
                )
            return status, response

    @staticmethod
    def target(operation, command) -> str:
        if operation == "verification":
            return "CLOSED" if command.outcome == "ACCEPT" else "DISPUTED"
        if operation == "review":
            return "ASSIGNED" if command.decision == "REASSIGN" else "IN_PROGRESS"
        return OPERATION_EDGES[operation][1][0]

    @staticmethod
    def submit(session, actor, command, policy) -> Case:
        if not command.confirmation:
            raise Refusal(
                "IDENTITY_OR_CONFIRMATION_REQUIRED", "Explicit confirmation is required.", 422
            )
        category = next(
            (item for item in policy["categories"] if item["code"] == command.category), None
        )
        if category is None or command.ward not in policy["wards"]:
            raise Refusal("INVALID_POLICY_VALUE", "Choose a configured category and ward.", 422)
        now = utcnow()
        deadline = now + timedelta(hours=category["sla_hours"])
        case = Case(
            id=new_id(),
            public_id=f"GF-{new_id()}",
            citizen_id=actor.id,
            workflow_state="SUBMITTED",
            description=command.description,
            location=command.location,
            latitude=command.latitude,
            longitude=command.longitude,
            accuracy_m=command.accuracy_m,
            category=command.category,
            ward=command.ward,
            department=category["department"],
            policy_version=policy["version"],
            submitted_at=now,
            original_deadline=deadline,
            current_deadline=deadline,
            escalation_level=0,
            version=1,
        )
        schedule_next(case, policy, set())
        session.add(case)
        session.flush()
        return case

    @staticmethod
    def eligible_officer(session, officer_id, case):
        user = session.get(User, officer_id)
        if (
            user is None
            or not user.active
            or not load_actor(session, officer_id).has_role("OFFICER", case)
        ):
            raise Refusal(
                "INELIGIBLE_OWNER",
                "Choose an active officer in the case's ward and department.",
                422,
            )

    @staticmethod
    def end_assignment(session, case):
        assignment = session.scalar(
            select(Assignment).where(
                Assignment.case_id == case.id,
                Assignment.ended_at.is_(None),
            )
        )
        if assignment:
            assignment.ended_at = utcnow()
            session.flush()

    def assign(self, session, actor, case, officer_id, reason):
        self.eligible_officer(session, officer_id, case)
        self.end_assignment(session, case)
        session.add(
            Assignment(
                case_id=case.id,
                officer_id=officer_id,
                assigned_by=actor.id,
                reason=reason,
                started_at=utcnow(),
            )
        )
        case.owner_id = officer_id

    def apply(self, session, actor, case, operation, command, policy):
        if operation == "notification-retry":
            message = session.scalar(
                select(OutboxMessage)
                .join(AuditEvent)
                .where(OutboxMessage.id == command.message_id, AuditEvent.case_id == case.id)
                .with_for_update(of=OutboxMessage)
            )
            if message is None:
                raise Refusal("NOTIFICATION_NOT_FOUND", "Notification not found.", 404)
            if message.status != "FAILED":
                raise Refusal(
                    "NOTIFICATION_NOT_FAILED", "Only failed deliveries can be retried.", 409
                )
            message.status = "PENDING"
            message.attempts = 0
            message.next_attempt_at = utcnow()
            message.last_error = None
        elif operation == "deadline-extension":
            case.current_deadline = as_utc(datetime.fromisoformat(command.new_deadline))
            schedule_next(case, policy, recorded_thresholds(session, case))
        elif operation == "validate":
            if command.jurisdiction != policy["municipality"]:
                raise Refusal(
                    "INVALID_POLICY_VALUE", "The jurisdiction does not match this policy.", 422
                )
            if (command.category, command.ward, command.department) != (
                case.category,
                case.ward,
                case.department,
            ):
                raise Refusal(
                    "POLICY_CORRECTION_REQUIRED",
                    "Category or routing changes require a separate audited correction.",
                    422,
                )
        elif operation == "reject":
            if command.reason_code not in policy["rejection_reason_codes"]:
                raise Refusal("INVALID_POLICY_VALUE", "Choose a configured rejection reason.", 422)
        elif operation == "assign":
            if command.department != case.department:
                raise Refusal(
                    "INVALID_POLICY_VALUE", "Assignment must use the case department.", 422
                )
            self.assign(session, actor, case, command.officer_id, command.reason)
        elif operation == "accept-assignment":
            if not command.confirmation:
                raise Refusal(
                    "IDENTITY_OR_CONFIRMATION_REQUIRED", "Explicit acceptance is required.", 422
                )
        elif operation == "resolution":
            evidence = session.scalars(
                select(Evidence).where(
                    Evidence.id.in_(command.evidence_refs),
                    Evidence.case_id == case.id,
                    Evidence.complete.is_(True),
                )
            ).all()
            category = next(item for item in policy["categories"] if item["code"] == case.category)
            if len({item.id for item in evidence}) != len(set(command.evidence_refs)) or not set(
                category["resolution_evidence"]
            ).issubset({item.kind for item in evidence}):
                raise Refusal("EVIDENCE_REQUIRED", "Completed case evidence is required.", 422)
            for item in evidence:
                if item.content_type is not None:
                    EvidenceStore(self.settings).read(item)
        elif operation == "verification":
            if not actor.identity_verified or not command.confirmation:
                raise Refusal(
                    "IDENTITY_OR_CONFIRMATION_REQUIRED",
                    "Verified identity and explicit confirmation are required.",
                    403,
                )
            if command.outcome == "DISPUTE" and not command.statement:
                raise Refusal("REQUIRED_FIELD_MISSING", "A dispute statement is required.", 422)
        elif operation == "review":
            if command.decision == "RETAIN":
                if command.officer_id != case.owner_id:
                    raise Refusal(
                        "INELIGIBLE_OWNER", "Retained rework must use the current owner.", 422
                    )
                self.eligible_officer(session, command.officer_id, case)
            else:
                self.assign(session, actor, case, command.officer_id, command.reason)

    def system_transition(self, session, case, target, request_id, operation, kind):
        policy = self.policy_for(session, case)
        if not any(
            edge["from"] == case.workflow_state
            and edge["to"] == target
            and "WORKFLOW_ENGINE" in edge["roles"]
            for edge in policy["transitions"]
        ):
            raise RuntimeError("Missing internal workflow transition in the pinned policy")
        before = snapshot(case)
        case.workflow_state = target
        case.version += 1
        if target == "CITIZEN_VERIFICATION":
            case.verification_due_at = utcnow() + timedelta(
                hours=policy["verification_review_after_hours"]
            )
            case.verification_alerted_at = None
        event = self.audit(
            session,
            actor=None,
            case=case,
            operation=operation,
            request_id=request_id,
            role="WORKFLOW_ENGINE",
            before=before,
        )
        session.add(
            OutboxMessage(event_id=event.id, kind=kind, payload={"case_id": case.public_id})
        )
