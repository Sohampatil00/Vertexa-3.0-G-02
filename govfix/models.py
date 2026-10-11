"""Persistence models for the Phase 1 workflow foundation."""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from govfix.database import utcnow


def new_id() -> str:
    return str(uuid4())


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    username: Mapped[str] = mapped_column(String(100), unique=True)
    display_name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    identity_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RoleGrant(Base):
    __tablename__ = "user_roles"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[str] = mapped_column(String(40))
    ward: Mapped[str | None] = mapped_column(String(100))
    department: Mapped[str | None] = mapped_column(String(100))


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)


class PolicyVersion(Base):
    __tablename__ = "policy_versions"
    version: Mapped[str] = mapped_column(String(100), primary_key=True)
    checksum: Mapped[str] = mapped_column(String(64))
    definition: Mapped[dict] = mapped_column(JSON)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Case(Base):
    __tablename__ = "grievances"
    __table_args__ = (
        CheckConstraint("version >= 1", name="case_positive_version"),
        CheckConstraint("escalation_level >= 0", name="case_nonnegative_escalation"),
        CheckConstraint(
            "workflow_state IN ('SUBMITTED','VALIDATED','REJECTED','ASSIGNED',"
            "'IN_PROGRESS','RESOLUTION_SUBMITTED','CITIZEN_VERIFICATION',"
            "'CLOSED','DISPUTED','SUPERVISOR_REVIEW')",
            name="case_known_state",
        ),
        Index("ix_case_queue", "ward", "department", "workflow_state", "owner_id"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    public_id: Mapped[str] = mapped_column(String(40), unique=True)
    citizen_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    workflow_state: Mapped[str] = mapped_column(String(40))
    category: Mapped[str] = mapped_column(String(100))
    department: Mapped[str] = mapped_column(String(100))
    ward: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text)
    location: Mapped[str] = mapped_column(Text)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    policy_version: Mapped[str] = mapped_column(ForeignKey("policy_versions.version"))
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    terminal_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    original_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    current_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    escalation_level: Mapped[int] = mapped_column(Integer, default=0)
    version: Mapped[int] = mapped_column(Integer, default=1)
    next_sla_check: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    verification_due_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), index=True
    )
    verification_alerted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Assignment(Base):
    __tablename__ = "assignments"
    __table_args__ = (
        Index(
            "ix_one_active_assignment",
            "case_id",
            unique=True,
            sqlite_where=text("ended_at IS NULL"),
            postgresql_where=text("ended_at IS NULL"),
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    case_id: Mapped[str] = mapped_column(ForeignKey("grievances.id"), index=True)
    officer_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    assigned_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    reason: Mapped[str] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Evidence(Base):
    """Private images verified by the upload service; legacy trusted fixtures have null metadata."""

    __tablename__ = "evidence"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    case_id: Mapped[str] = mapped_column(ForeignKey("grievances.id"), index=True)
    uploader_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(String(50))
    object_key: Mapped[str] = mapped_column(Text)
    sha256: Mapped[str] = mapped_column(String(64))
    complete: Mapped[bool] = mapped_column(Boolean, default=False)
    content_type: Mapped[str | None] = mapped_column(String(50))
    size_bytes: Mapped[int | None] = mapped_column(Integer)
    uploaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (Index("ix_audit_case_time", "case_id", "occurred_at"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    case_id: Mapped[str | None] = mapped_column(ForeignKey("grievances.id"))
    operation: Mapped[str] = mapped_column(String(100))
    result: Mapped[str] = mapped_column(String(20))
    reason_code: Mapped[str | None] = mapped_column(String(100))
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    actor_role: Mapped[str] = mapped_column(String(40))
    channel: Mapped[str] = mapped_column(String(20))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    case_version: Mapped[int | None] = mapped_column(Integer)
    policy_version: Mapped[str | None] = mapped_column(ForeignKey("policy_versions.version"))
    request_id: Mapped[str] = mapped_column(String(50), index=True)
    before: Mapped[dict | None] = mapped_column(JSON)
    after: Mapped[dict | None] = mapped_column(JSON)
    details: Mapped[dict] = mapped_column(JSON, default=dict)


class IdempotencyRecord(Base):
    __tablename__ = "idempotency_records"
    __table_args__ = (UniqueConstraint("actor_id", "operation", "key", name="uq_idempotency"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    operation: Mapped[str] = mapped_column(String(100))
    key: Mapped[str] = mapped_column(String(200))
    request_hash: Mapped[str] = mapped_column(String(64))
    response: Mapped[dict] = mapped_column(JSON)
    status_code: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class OutboxMessage(Base):
    __tablename__ = "outbox_messages"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("audit_events.id"), unique=True)
    kind: Mapped[str] = mapped_column(String(100))
    payload: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20), default="PENDING")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(String(100))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (Index("ix_outbox_due", "status", "next_attempt_at"),)


class SlaThreshold(Base):
    """One immutable threshold event per case and pinned policy, across extensions."""

    __tablename__ = "sla_thresholds"
    __table_args__ = (
        UniqueConstraint("case_id", "policy_version", "threshold_key", name="uq_sla_threshold"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    case_id: Mapped[str] = mapped_column(ForeignKey("grievances.id"), index=True)
    policy_version: Mapped[str] = mapped_column(ForeignKey("policy_versions.version"))
    threshold_key: Mapped[str] = mapped_column(String(100))
    event_id: Mapped[str] = mapped_column(ForeignKey("audit_events.id"), unique=True)
    threshold_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Notification(Base):
    """Durable in-app delivery; a unique message/recipient pair prevents duplicate delivery."""

    __tablename__ = "notifications"
    __table_args__ = (
        UniqueConstraint("message_id", "recipient_id", name="uq_notification_recipient"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    message_id: Mapped[str] = mapped_column(ForeignKey("outbox_messages.id"))
    recipient_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("grievances.id"))
    kind: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
