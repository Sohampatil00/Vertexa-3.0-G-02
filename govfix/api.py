"""Authenticated API for the Phase 1 backend foundation."""

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Body, Depends, FastAPI, Header, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from sqlalchemy import and_, or_, select, text
from sqlalchemy.exc import SQLAlchemyError
from starlette.concurrency import run_in_threadpool

from govfix.auth import Actor, authenticate, login, token_hash
from govfix.database import as_utc, make_engine, make_sessions, write_transaction
from govfix.errors import Refusal
from govfix.models import AuditEvent, AuthSession, Case, PolicyVersion, new_id
from govfix.notifications import register_notifications
from govfix.operations import register_operations
from govfix.schemas import COMMAND_SCHEMAS, Login
from govfix.settings import Settings
from govfix.workflow import STAFF_ROLES, Workflow, operation_for_edge, project_case, visible

bearer = HTTPBearer(auto_error=False)


def visibility_filter(actor: Actor):
    conditions = []
    if actor.has_role("CITIZEN"):
        conditions.append(Case.citizen_id == actor.id)
    for grant in actor.grants:
        if grant.role in STAFF_ROLES:
            conditions.append(
                and_(
                    Case.ward == grant.ward,
                    Case.department == grant.department if grant.department else True,
                )
            )
    return or_(*conditions) if conditions else False


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    engine = make_engine(settings.database_url)
    sessions = make_sessions(engine)
    workflow = Workflow(sessions, settings)

    @asynccontextmanager
    async def lifespan(_app):
        try:
            with sessions() as session:
                revision = session.execute(text("SELECT version_num FROM alembic_version")).scalar()
                if (
                    revision != "0005"
                    or session.get(PolicyVersion, settings.policy_version) is None
                ):
                    raise RuntimeError("Run 'uv run govfix init-db' before starting the API")
            yield
        finally:
            engine.dispose()

    app = FastAPI(
        title="GovFix",
        version="0.1.0",
        lifespan=lifespan,
        description="Demo policy workflow foundation; local provisioned accounts.",
    )
    app.state.sessions = sessions
    app.state.workflow = workflow

    @app.middleware("http")
    async def request_id(request: Request, call_next):
        request.state.request_id = f"req_{new_id()}"
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        response.headers["Cache-Control"] = "no-store"
        return response

    def require_actor(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
        with sessions() as session:
            return authenticate(session, credentials.credentials if credentials else None)

    def transport_audit(request: Request, reason: str, actor: Actor | None = None, channel="TEXT"):
        operation = (
            "submit" if request.url.path == "/v1/cases" else request.path_params.get("operation")
        )
        # The operation-specific routes place their names on the route, not in user input.
        if operation is None and request.url.path.startswith("/v1/cases/"):
            operation = request.url.path.rsplit("/", 1)[-1]
        if operation == "evidence":
            operation = "evidence-upload"
        if request.method != "POST" or operation not in {*COMMAND_SCHEMAS, "evidence-upload"}:
            return
        with write_transaction(sessions) as session:
            case = session.scalar(
                select(Case).where(Case.public_id == request.path_params.get("case_id"))
            )
            workflow.audit(
                session,
                actor=actor,
                case=case,
                operation=operation,
                request_id=request.state.request_id,
                role="UNAUTHENTICATED" if actor is None else actor.recorded_role,
                reason=reason,
                channel=channel,
            )

    def unavailable_response(request: Request):
        refusal = Refusal(
            "DEPENDENCY_UNAVAILABLE", "A required dependency is unavailable. Retry later.", 503
        )
        return JSONResponse(refusal.response(request.state.request_id), status_code=503)

    async def audited_refusal(request: Request, refusal: Refusal, actor=None, channel="TEXT"):
        try:
            await run_in_threadpool(transport_audit, request, refusal.code, actor, channel)
        except SQLAlchemyError:
            return unavailable_response(request)
        return JSONResponse(
            refusal.response(request.state.request_id),
            status_code=refusal.status,
            headers={"WWW-Authenticate": "Bearer"} if refusal.status == 401 else None,
        )

    def channel_from_body(body):
        channel = body.get("channel") if isinstance(body, dict) else None
        return channel if isinstance(channel, str) and channel in {"TEXT", "VOICE"} else "TEXT"

    def actor_from_request(request):
        authorization = request.headers.get("authorization", "").split()
        with sessions() as session:
            return authenticate(
                session,
                authorization[1]
                if len(authorization) == 2 and authorization[0].lower() == "bearer"
                else None,
            )

    @app.exception_handler(Refusal)
    async def refusal_handler(request: Request, exc: Refusal):
        channel = "TEXT"
        if (
            request.method == "POST"
            and request.url.path.startswith("/v1/cases")
            and not request.url.path.endswith("/evidence")
        ):
            try:
                channel = channel_from_body(await request.json())
            except ValueError:
                pass
        actor = None
        try:
            actor = await run_in_threadpool(actor_from_request, request)
        except Refusal:
            pass
        except SQLAlchemyError:
            return unavailable_response(request)
        return await audited_refusal(request, exc, actor=actor, channel=channel)

    @app.exception_handler(RequestValidationError)
    async def invalid_input(request: Request, exc: RequestValidationError):
        actor = None
        is_command = request.method == "POST" and (
            request.url.path == "/v1/cases" or request.url.path.startswith("/v1/cases/")
        )
        if is_command:
            try:
                actor = await run_in_threadpool(actor_from_request, request)
            except Refusal as refusal:
                return await audited_refusal(request, refusal, channel=channel_from_body(exc.body))
            except SQLAlchemyError:
                return unavailable_response(request)
        malformed = any(error["type"] == "json_invalid" for error in exc.errors())
        code = "INVALID_REQUEST" if malformed else "REQUIRED_FIELD_MISSING"
        if request.url.path.endswith("/resolution") and any(
            "evidence_refs" in error["loc"] for error in exc.errors()
        ):
            code = "EVIDENCE_REQUIRED"
        refusal = Refusal(
            code, "Required request fields are missing or invalid.", 400 if malformed else 422
        )
        return await audited_refusal(request, refusal, actor, channel_from_body(exc.body))

    @app.exception_handler(SQLAlchemyError)
    async def unavailable(request: Request, _exc):
        return unavailable_response(request)

    @app.get("/health")
    def health(request: Request):
        return {"status": "ok", "mode": "DEMO_ONLY", "request_id": request.state.request_id}

    @app.post("/v1/auth/login")
    def sign_in(body: Login, request: Request):
        response = login(
            sessions, body.username, body.password.get_secret_value(), settings.session_minutes
        )
        return {**response, "request_id": request.state.request_id}

    @app.post("/v1/auth/logout")
    def sign_out(
        request: Request,
        actor: Annotated[Actor, Depends(require_actor)],
        credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer)],
    ):
        with write_transaction(sessions) as session:
            auth_session = session.get(AuthSession, token_hash(credentials.credentials))
            if auth_session and auth_session.user_id == actor.id:
                auth_session.revoked = True
        return {"revoked": True, "request_id": request.state.request_id}

    @app.get("/v1/me")
    def me(request: Request, actor: Annotated[Actor, Depends(require_actor)]):
        return {
            "id": actor.id,
            "username": actor.username,
            "display_name": actor.display_name,
            "roles": [
                {"role": grant.role, "ward": grant.ward, "department": grant.department}
                for grant in actor.grants
            ],
            "request_id": request.state.request_id,
        }

    @app.post("/v1/cases", status_code=201)
    def submit(
        body: COMMAND_SCHEMAS["submit"],
        request: Request,
        actor: Annotated[Actor, Depends(require_actor)],
        idempotency_key: Annotated[str | None, Header()] = None,
    ):
        status, response = workflow.execute(
            actor.id,
            "submit",
            body.model_dump(),
            idempotency_key,
            None,
            None,
            request.state.request_id,
        )
        return JSONResponse(response, status_code=status)

    def register_command(operation: str):
        def endpoint(
            case_id: str,
            body,
            request: Request,
            actor: Annotated[Actor, Depends(require_actor)],
            idempotency_key: Annotated[str | None, Header()] = None,
            if_match: Annotated[str | None, Header()] = None,
        ):
            status, response = workflow.execute(
                actor.id,
                operation,
                body.model_dump(),
                idempotency_key,
                if_match,
                case_id,
                request.state.request_id,
            )
            return JSONResponse(response, status_code=status)

        endpoint.__annotations__["body"] = Annotated[COMMAND_SCHEMAS[operation], Body()]
        app.add_api_route(
            f"/v1/cases/{{case_id}}/{operation}", endpoint, methods=["POST"], name=operation
        )

    for operation in COMMAND_SCHEMAS:
        if operation != "submit":
            register_command(operation)

    def read_case(session, actor, case_id):
        case = session.scalar(select(Case).where(Case.public_id == case_id))
        if case is None or not visible(actor, case):
            raise Refusal("CASE_ACCESS_DENIED", "Case not found.", 404)
        return case

    @app.get("/v1/cases")
    def list_cases(
        request: Request,
        actor: Annotated[Actor, Depends(require_actor)],
        limit: Annotated[int, Query(ge=1, le=100)] = 20,
        offset: Annotated[int, Query(ge=0)] = 0,
        state: Annotated[str | None, Query(max_length=40)] = None,
        owned: bool = False,
        verification_waiting: bool = False,
    ):
        with sessions() as session:
            filters = [visibility_filter(actor)]
            if state:
                filters.append(Case.workflow_state == state)
            if owned:
                filters.append(Case.owner_id == actor.id)
            if verification_waiting:
                filters.extend(
                    [
                        Case.workflow_state == "CITIZEN_VERIFICATION",
                        Case.verification_alerted_at.is_not(None),
                    ]
                )
            cases = session.scalars(
                select(Case)
                .where(*filters)
                .order_by(
                    Case.submitted_at.desc(),
                    Case.id,
                )
                .offset(offset)
                .limit(limit)
            ).all()
            policies = {
                version: session.get(PolicyVersion, version).definition
                for version in {case.policy_version for case in cases}
            }
            return {
                "cases": [project_case(case, policies[case.policy_version]) for case in cases],
                "limit": limit,
                "offset": offset,
                "request_id": request.state.request_id,
            }

    @app.get("/v1/cases/{case_id}")
    def get_case(case_id: str, request: Request, actor: Annotated[Actor, Depends(require_actor)]):
        with sessions() as session:
            case = read_case(session, actor, case_id)
            return {
                "case": project_case(case, workflow.policy_for(session, case)),
                "request_id": request.state.request_id,
            }

    @app.get("/v1/cases/{case_id}/timeline")
    def timeline(
        case_id: str,
        request: Request,
        actor: Annotated[Actor, Depends(require_actor)],
        limit: Annotated[int, Query(ge=1, le=100)] = 50,
        offset: Annotated[int, Query(ge=0)] = 0,
    ):
        with sessions() as session:
            case = read_case(session, actor, case_id)
            privileged = any(
                actor.has_role(role, case) for role in {"SUPERVISOR", "WARD_HEAD", "AUDITOR"}
            )
            query = select(AuditEvent).where(AuditEvent.case_id == case.id)
            if not privileged:
                query = query.where(AuditEvent.result == "ACCEPTED")
            events = session.scalars(
                query.order_by(AuditEvent.occurred_at, AuditEvent.id).offset(offset).limit(limit)
            ).all()
            return {
                "events": [
                    {
                        "id": event.id,
                        "operation": event.operation,
                        "result": event.result,
                        "occurred_at": as_utc(event.occurred_at).isoformat(),
                        "case_version": event.case_version,
                        **(
                            {
                                "reason_code": event.reason_code,
                                "actor_id": event.actor_id,
                                "actor_role": event.actor_role,
                                "before": event.before,
                                "after": event.after,
                                "details": event.details,
                                "request_id": event.request_id,
                            }
                            if privileged
                            else {}
                        ),
                    }
                    for event in events
                ],
                "limit": limit,
                "offset": offset,
                "request_id": request.state.request_id,
            }

    @app.get("/v1/cases/{case_id}/resolution")
    def current_resolution(
        case_id: str, request: Request, actor: Annotated[Actor, Depends(require_actor)]
    ):
        with sessions() as session:
            case = read_case(session, actor, case_id)
            event = session.scalar(
                select(AuditEvent)
                .where(
                    AuditEvent.case_id == case.id,
                    AuditEvent.operation == "resolution",
                    AuditEvent.result == "ACCEPTED",
                )
                .order_by(AuditEvent.case_version.desc())
                .limit(1)
            )
            dispute = session.scalar(
                select(AuditEvent)
                .where(
                    AuditEvent.case_id == case.id,
                    AuditEvent.operation == "verification",
                    AuditEvent.result == "ACCEPTED",
                )
                .order_by(AuditEvent.case_version.desc())
                .limit(1)
            )
            return {
                "resolution": {
                    "note": event.details["note"],
                    "evidence_refs": event.details["evidence_refs"],
                    "submitted_at": as_utc(event.occurred_at).isoformat(),
                }
                if event
                else None,
                "dispute_statement": dispute.details.get("statement")
                if dispute
                and dispute.details.get("outcome") == "DISPUTE"
                and (event is None or dispute.case_version > event.case_version)
                else None,
                "request_id": request.state.request_id,
            }

    @app.get("/v1/cases/{case_id}/allowed-actions")
    def actions(case_id: str, request: Request, actor: Annotated[Actor, Depends(require_actor)]):
        with sessions() as session:
            case = read_case(session, actor, case_id)
            policy = workflow.policy_for(session, case)
            options = []
            for edge in policy["transitions"]:
                if edge["from"] != case.workflow_state:
                    continue
                if not any(actor.has_role(role, case) for role in edge["roles"]):
                    continue
                if "OFFICER" in edge["roles"] and case.owner_id != actor.id:
                    continue
                if "CITIZEN" in edge["roles"] and (
                    case.citizen_id != actor.id or not actor.identity_verified
                ):
                    continue
                operation = operation_for_edge(edge["from"], edge["to"])
                if operation:
                    options.append(
                        {
                            "operation": operation,
                            "target": edge["to"],
                            "required_fields": [
                                name
                                for name, field in COMMAND_SCHEMAS[operation].model_fields.items()
                                if field.is_required()
                            ],
                        }
                    )
            if actor.has_role("SUPERVISOR", case):
                if case.workflow_state not in {"CLOSED", "REJECTED"}:
                    options.append(
                        {
                            "operation": "deadline-extension",
                            "target": case.workflow_state,
                            "required_fields": ["new_deadline", "reason"],
                        }
                    )
                options.append(
                    {
                        "operation": "notification-retry",
                        "target": case.workflow_state,
                        "required_fields": ["message_id", "reason"],
                    }
                )
            return {
                "actions": options,
                "case_version": case.version,
                "request_id": request.state.request_id,
            }

    @app.get("/v1/policies/{version}")
    def get_policy(version: str, request: Request, actor: Annotated[Actor, Depends(require_actor)]):
        if not actor.has_role("AUDITOR"):
            raise Refusal("ROLE_NOT_ALLOWED", "Policy access requires an auditor role.", 403)
        with sessions() as session:
            policy = session.get(PolicyVersion, version)
            if policy is None:
                raise Refusal("POLICY_NOT_FOUND", "Policy not found.", 404)
            return {
                "policy": policy.definition,
                "checksum": policy.checksum,
                "request_id": request.state.request_id,
            }

    register_operations(
        app, sessions, settings, workflow, require_actor, read_case, visibility_filter
    )

    register_notifications(app, sessions, require_actor, read_case, visibility_filter)

    @app.get("/", include_in_schema=False)
    def home():
        return RedirectResponse("/app/")

    static = Path(__file__).parent / "static"
    if static.is_dir():
        app.mount("/app", StaticFiles(directory=static, html=True), name="operations-ui")

    return app


app = create_app()
