"""Scoped SLA history, delivery diagnostics, and the authenticated notification inbox."""

from typing import Annotated

from fastapi import Depends, Query, Request
from sqlalchemy import select

from govfix.auth import Actor
from govfix.database import as_utc
from govfix.models import AuditEvent, Case, Notification, OutboxMessage, PolicyVersion, SlaThreshold


def register_notifications(app, sessions, require_actor, read_case, scope_filter):
    @app.get("/v1/notifications")
    def inbox(
        request: Request,
        actor: Annotated[Actor, Depends(require_actor)],
        limit: Annotated[int, Query(ge=1, le=100)] = 20,
        offset: Annotated[int, Query(ge=0)] = 0,
    ):
        with sessions() as session:
            rows = session.execute(
                select(Notification, Case, OutboxMessage)
                .join(Case, Notification.case_id == Case.id)
                .join(OutboxMessage, Notification.message_id == OutboxMessage.id)
                .where(Notification.recipient_id == actor.id, scope_filter(actor))
                .order_by(Notification.created_at.desc(), Notification.id)
                .offset(offset)
                .limit(limit)
            ).all()
            policies = {
                version: session.get(PolicyVersion, version).definition
                for version in {case.policy_version for _, case, _ in rows}
            }
            return {
                "notifications": [
                    {
                        "id": item.id,
                        "case_id": case.public_id,
                        "kind": item.kind,
                        "threshold": message.payload.get("threshold"),
                        "new_deadline": message.payload.get("new_deadline"),
                        "reason": message.payload.get("reason")
                        if item.kind == "DEADLINE_EXTENDED"
                        else None,
                        "created_at": as_utc(item.created_at).isoformat(),
                        "timezone": policies[case.policy_version]["timezone"],
                    }
                    for item, case, message in rows
                ],
                "limit": limit,
                "offset": offset,
                "request_id": request.state.request_id,
            }

    @app.get("/v1/cases/{case_id}/sla")
    def sla(
        case_id: str,
        request: Request,
        actor: Annotated[Actor, Depends(require_actor)],
        limit: Annotated[int, Query(ge=1, le=100)] = 50,
        offset: Annotated[int, Query(ge=0)] = 0,
    ):
        with sessions() as session:
            case = read_case(session, actor, case_id)
            thresholds = session.scalars(
                select(SlaThreshold)
                .where(SlaThreshold.case_id == case.id)
                .order_by(SlaThreshold.threshold_at, SlaThreshold.id)
            ).all()
            privileged = any(
                actor.has_role(role, case) for role in {"SUPERVISOR", "WARD_HEAD", "AUDITOR"}
            )
            deliveries = []
            if privileged:
                deliveries = [
                    {
                        "id": message.id,
                        "kind": message.kind,
                        "status": message.status,
                        "attempts": message.attempts,
                        "last_error": message.last_error,
                        "next_attempt_at": as_utc(message.next_attempt_at).isoformat()
                        if message.next_attempt_at
                        else None,
                        "delivered_at": as_utc(message.delivered_at).isoformat()
                        if message.delivered_at
                        else None,
                    }
                    for message in session.scalars(
                        select(OutboxMessage)
                        .join(AuditEvent)
                        .where(AuditEvent.case_id == case.id)
                        .order_by(OutboxMessage.created_at.desc(), OutboxMessage.id)
                        .offset(offset)
                        .limit(limit)
                    ).all()
                ]
            return {
                "original_deadline": as_utc(case.original_deadline).isoformat(),
                "current_deadline": as_utc(case.current_deadline).isoformat(),
                "escalation_level": case.escalation_level,
                "thresholds": [
                    {
                        "key": item.threshold_key,
                        "threshold_at": as_utc(item.threshold_at).isoformat(),
                        "observed_at": as_utc(item.observed_at).isoformat(),
                        "deadline": as_utc(item.deadline).isoformat(),
                    }
                    for item in thresholds
                ],
                "deliveries": deliveries,
                "limit": limit,
                "offset": offset,
                "request_id": request.state.request_id,
            }
