"""Scoped operations data and authenticated, audited evidence uploads."""

import hashlib
import json
from typing import Annotated

from fastapi import Depends, Header, Query, Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy import func, select
from starlette.concurrency import run_in_threadpool

from govfix.auth import Actor, load_actor
from govfix.command_headers import require_key, require_version
from govfix.database import as_utc, utcnow, write_transaction
from govfix.errors import Refusal
from govfix.evidence import make_evidence_store, project_evidence, validate_image
from govfix.models import Assignment, Case, Evidence, IdempotencyRecord, RoleGrant, User, new_id
from govfix.workflow import visible


def register_operations(app, sessions, settings, workflow, require_actor, read_case, scope_filter):
    store = make_evidence_store(settings)

    def options(policy):
        return {
            "checksum": hashlib.sha256(
                json.dumps(
                    policy, sort_keys=True, separators=(",", ":"), ensure_ascii=False
                ).encode()
            ).hexdigest(),
            **{
                key: policy[key]
                for key in (
                    "version",
                    "municipality",
                    "timezone",
                    "wards",
                    "categories",
                    "rejection_reason_codes",
                )
            },
        }

    @app.get("/v1/intake-options")
    def intake_options(request: Request, actor: Annotated[Actor, Depends(require_actor)]):
        with sessions() as session:
            return {
                "policy": options(workflow.policy_for(session, None)),
                "evidence_max_bytes": store.max_bytes,
                "request_id": request.state.request_id,
            }

    @app.get("/v1/operations/summary")
    def summary(
        request: Request,
        actor: Annotated[Actor, Depends(require_actor)],
        owned: bool = False,
        mine: bool = False,
    ):
        with sessions() as session:
            filters = [scope_filter(actor)]
            if owned:
                filters.append(Case.owner_id == actor.id)
            if mine:
                filters.append(Case.citizen_id == actor.id)
            counts = dict(
                session.execute(
                    select(Case.workflow_state, func.count())
                    .where(*filters)
                    .group_by(Case.workflow_state)
                ).all()
            )
            overdue = session.scalar(
                select(func.count())
                .select_from(Case)
                .where(
                    *filters,
                    Case.terminal_at.is_(None),
                    Case.current_deadline <= utcnow(),
                )
            )
            verification_waiting = session.scalar(
                select(func.count())
                .select_from(Case)
                .where(
                    *filters,
                    Case.workflow_state == "CITIZEN_VERIFICATION",
                    Case.verification_alerted_at.is_not(None),
                )
            )
            escalation_counts = dict(
                session.execute(
                    select(Case.escalation_level, func.count())
                    .where(
                        *filters,
                        Case.terminal_at.is_(None),
                        Case.escalation_level.in_((1, 2)),
                    )
                    .group_by(Case.escalation_level)
                ).all()
            )
            return {
                "states": counts,
                "total": sum(counts.values()),
                "overdue": overdue,
                "verification_waiting": verification_waiting,
                "escalations": {
                    "level_1": escalation_counts.get(1, 0),
                    "level_2": escalation_counts.get(2, 0),
                },
                "request_id": request.state.request_id,
            }

    @app.get("/v1/cases/{case_id}/operations")
    def case_operations(
        case_id: str, request: Request, actor: Annotated[Actor, Depends(require_actor)]
    ):
        with sessions() as session:
            case = read_case(session, actor, case_id)
            policy = workflow.policy_for(session, case)
            officers = []
            if any(actor.has_role(role, case) for role in {"DISPATCHER", "SUPERVISOR"}):
                officers = [
                    {"id": user.id, "name": user.display_name}
                    for user in session.scalars(
                        select(User)
                        .join(RoleGrant)
                        .where(
                            User.active.is_(True),
                            RoleGrant.role == "OFFICER",
                            RoleGrant.ward == case.ward,
                            (RoleGrant.department == case.department)
                            | RoleGrant.department.is_(None),
                        )
                        .distinct()
                        .order_by(User.display_name, User.id)
                    ).all()
                ]
            history = []
            if any(actor.has_role(role, case) for role in {"SUPERVISOR", "WARD_HEAD", "AUDITOR"}):
                history = [
                    {
                        "officer_id": item.officer_id,
                        "assigned_by": item.assigned_by,
                        "reason": item.reason,
                        "started_at": as_utc(item.started_at).isoformat(),
                        "ended_at": as_utc(item.ended_at).isoformat() if item.ended_at else None,
                    }
                    for item in session.scalars(
                        select(Assignment)
                        .where(Assignment.case_id == case.id)
                        .order_by(Assignment.started_at)
                    ).all()
                ]
            owner = session.get(User, case.owner_id) if case.owner_id else None
            return {
                "policy": options(policy),
                "officers": officers,
                "assignments": history,
                "owner_name": owner.display_name if owner else None,
                "evidence_max_bytes": store.max_bytes,
                "request_id": request.state.request_id,
            }

    @app.get("/v1/cases/{case_id}/evidence")
    def evidence_list(
        case_id: str, request: Request, actor: Annotated[Actor, Depends(require_actor)]
    ):
        with sessions() as session:
            case = read_case(session, actor, case_id)
            items = session.scalars(
                select(Evidence)
                .where(
                    Evidence.case_id == case.id,
                    Evidence.complete.is_(True),
                    Evidence.content_type.is_not(None),
                )
                .order_by(Evidence.uploaded_at, Evidence.id)
            ).all()
            return {
                "evidence": [project_evidence(item) for item in items],
                "request_id": request.state.request_id,
            }

    @app.get("/v1/cases/{case_id}/evidence/{evidence_id}")
    def download(case_id: str, evidence_id: str, actor: Annotated[Actor, Depends(require_actor)]):
        with sessions() as session:
            case = read_case(session, actor, case_id)
            item = session.get(Evidence, evidence_id)
            if not item or item.case_id != case.id or not item.complete or not item.content_type:
                raise Refusal("EVIDENCE_NOT_FOUND", "Evidence not found.", 404)
            return Response(
                store.read(item),
                media_type=item.content_type,
                headers={
                    "Content-Disposition": 'attachment; filename="evidence"',
                    "X-Content-Type-Options": "nosniff",
                },
            )

    def allowed_upload(actor, case, policy, kind):
        if not actor.has_role("OFFICER", case) or case.owner_id != actor.id:
            raise Refusal("OWNER_REQUIRED", "Only the current officer can upload evidence.", 403)
        if case.workflow_state != "IN_PROGRESS":
            raise Refusal(
                "INVALID_TRANSITION", "Accept the assignment before uploading evidence.", 409
            )
        category = next(item for item in policy["categories"] if item["code"] == case.category)
        if kind not in category["resolution_evidence"]:
            raise Refusal("INVALID_EVIDENCE_KIND", "Choose a required evidence kind.", 422)

    def persist_upload(
        actor_id, case_id, data, kind, checksum, content_type, key, version, request_id, active_role
    ):
        # Decode before acquiring the actor/case locks; audit any refusal inside the transaction.
        validation_error = None
        try:
            validate_image(data, content_type, checksum)
        except Refusal as refusal:
            validation_error = refusal
        actual_checksum = hashlib.sha256(data).hexdigest()
        saved_key = None
        committed = False
        try:
            with write_transaction(sessions) as session:
                actor = load_actor(session, actor_id, lock=True, active_role=active_role)
                case = session.scalar(
                    select(Case).where(Case.public_id == case_id).with_for_update()
                )
                if not case or not visible(actor, case):
                    raise Refusal("CASE_ACCESS_DENIED", "Case not found.", 404)
                record = None
                digest = hashlib.sha256(
                    json.dumps(
                        [
                            case_id,
                            kind,
                            checksum,
                            actual_checksum,
                            content_type,
                            version,
                        ]
                    ).encode()
                ).hexdigest()
                try:
                    require_key(key)
                    record = session.scalar(
                        select(IdempotencyRecord).where(
                            IdempotencyRecord.actor_id == actor.id,
                            IdempotencyRecord.operation == "evidence-upload",
                            IdempotencyRecord.key == key,
                        )
                    )
                    # Recheck ownership even for cached responses after reassignment.
                    allowed_upload(actor, case, workflow.policy_for(session, case), kind)
                    if record:
                        if record.request_hash != digest:
                            raise Refusal(
                                "IDEMPOTENCY_CONFLICT", "This key has different content.", 409
                            )
                        committed = True
                        return record.status_code, {**record.response, "request_id": request_id}
                    require_version(version, case.version)
                    if validation_error:
                        raise validation_error
                    item = Evidence(
                        id=new_id(),
                        case_id=case.id,
                        uploader_id=actor.id,
                        kind=kind,
                        object_key=new_id(),
                        sha256=checksum,
                        complete=True,
                        content_type=content_type,
                        size_bytes=len(data),
                        uploaded_at=utcnow(),
                    )
                    store.save(item.object_key, data, content_type)
                    saved_key = item.object_key
                    session.add(item)
                    workflow.audit(
                        session,
                        actor=actor,
                        case=case,
                        operation="evidence-upload",
                        request_id=request_id,
                        role="OFFICER",
                        details={"evidence_id": item.id, "sha256": checksum, "kind": kind},
                    )
                    status, response = (
                        201,
                        {
                            "evidence": project_evidence(item),
                            "case_version": case.version,
                            "request_id": request_id,
                        },
                    )
                except Refusal as refusal:
                    workflow.audit(
                        session,
                        actor=actor,
                        case=case,
                        operation="evidence-upload",
                        request_id=request_id,
                        role=actor.recorded_role,
                        reason=refusal.code,
                    )
                    status, response = refusal.status, refusal.response(request_id, case.version)
                if key and key.strip() and len(key) <= 200 and record is None and status < 500:
                    session.add(
                        IdempotencyRecord(
                            actor_id=actor.id,
                            operation="evidence-upload",
                            key=key,
                            request_hash=digest,
                            response=response,
                            status_code=status,
                        )
                    )
            committed = status == 201
            return status, response
        finally:
            if saved_key and not committed:
                store.delete(saved_key)

    @app.post(
        "/v1/cases/{case_id}/evidence",
        status_code=201,
        openapi_extra={
            "requestBody": {
                "required": True,
                "content": {
                    content_type: {"schema": {"type": "string", "format": "binary"}}
                    for content_type in ("image/png", "image/jpeg", "image/webp")
                },
            }
        },
    )
    async def upload(
        case_id: str,
        request: Request,
        actor: Annotated[Actor, Depends(require_actor)],
        kind: Annotated[str, Query(max_length=50)],
        checksum: Annotated[str, Header(alias="X-Content-SHA256")],
        key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
        version: Annotated[str | None, Header(alias="If-Match")] = None,
    ):
        def preflight():
            with sessions() as session:
                case = read_case(session, actor, case_id)
                allowed_upload(actor, case, workflow.policy_for(session, case), kind)

        await run_in_threadpool(preflight)
        data = bytearray()
        async for chunk in request.stream():
            if len(data) + len(chunk) > store.max_bytes:
                raise Refusal(
                    "EVIDENCE_TOO_LARGE", f"Use an image under {store.max_bytes} bytes.", 413
                )
            data.extend(chunk)
        status, response = await run_in_threadpool(
            persist_upload,
            actor.id,
            case_id,
            bytes(data),
            kind,
            checksum,
            request.headers.get("content-type", ""),
            key,
            version,
            request.state.request_id,
            actor.active_role,
        )
        return JSONResponse(response, status_code=status)
