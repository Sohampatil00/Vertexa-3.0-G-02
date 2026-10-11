"""Strict command inputs; roles and official timestamps never come from clients."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, strict=True)


class Login(Input):
    username: str = Field(min_length=1, max_length=100)
    password: SecretStr = Field(min_length=1, max_length=128)


class Command(Input):
    channel: Literal["TEXT", "VOICE"] = "TEXT"


class Submit(Command):
    description: str = Field(min_length=1, max_length=5000)
    location: str = Field(min_length=1, max_length=2000)
    category: str = Field(min_length=1, max_length=100)
    ward: str = Field(min_length=1, max_length=100)
    confirmation: bool
    latitude: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    longitude: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    accuracy_m: float | None = Field(default=None, ge=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def complete_coordinates(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Latitude and longitude must be provided together")
        if self.accuracy_m is not None and self.latitude is None:
            raise ValueError("Accuracy requires coordinates")
        return self


class Validate(Command):
    category: str = Field(min_length=1, max_length=100)
    ward: str = Field(min_length=1, max_length=100)
    department: str = Field(min_length=1, max_length=100)
    jurisdiction: str = Field(min_length=1, max_length=200)


class Reject(Command):
    reason_code: str = Field(min_length=1, max_length=100)
    explanation: str = Field(min_length=1, max_length=2000)


class Assign(Command):
    officer_id: str = Field(min_length=1, max_length=36)
    department: str = Field(min_length=1, max_length=100)
    reason: str = Field(min_length=1, max_length=2000)


class AcceptAssignment(Command):
    confirmation: bool


class Resolution(Command):
    note: str = Field(min_length=1, max_length=5000)
    evidence_refs: list[str] = Field(min_length=1, max_length=20)


class Verification(Command):
    outcome: Literal["ACCEPT", "DISPUTE"]
    confirmation: bool
    statement: str | None = Field(default=None, max_length=2000)


class Review(Command):
    decision: Literal["REASSIGN", "RETAIN"]
    officer_id: str = Field(min_length=1, max_length=36)
    reason: str = Field(min_length=1, max_length=2000)


class DeadlineExtension(Command):
    new_deadline: str = Field(min_length=20, max_length=50)
    reason: str = Field(min_length=1, max_length=2000)

    @field_validator("new_deadline")
    @classmethod
    def aware_deadline(cls, value):
        date = datetime.fromisoformat(value)
        if date.tzinfo is None or date.utcoffset() is None:
            raise ValueError("The deadline must include a timezone offset")
        return value


class NotificationRetry(Command):
    message_id: str = Field(min_length=36, max_length=36)
    reason: str = Field(min_length=1, max_length=2000)


COMMAND_SCHEMAS = {
    "submit": Submit,
    "validate": Validate,
    "reject": Reject,
    "assign": Assign,
    "accept-assignment": AcceptAssignment,
    "resolution": Resolution,
    "verification": Verification,
    "review": Review,
    "deadline-extension": DeadlineExtension,
    "notification-retry": NotificationRetry,
}
