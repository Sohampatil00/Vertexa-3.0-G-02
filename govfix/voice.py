"""Consent-bound voice drafts. Models can prepare drafts, never confirm them."""

import hashlib
import json
from datetime import timedelta
from typing import Annotated, Literal
from urllib.parse import parse_qs, urlparse

import httpx
from elevenlabs.client import ElevenLabs
from elevenlabs.core.api_error import ApiError
from elevenlabs.errors import BadRequestError
from fastapi import Depends, Request
from pydantic import Field, field_validator
from sqlalchemy import select
from starlette.concurrency import run_in_threadpool

from govfix.auth import Actor, load_actor
from govfix.database import as_utc, utcnow, write_transaction
from govfix.errors import Refusal
from govfix.models import VoiceSession
from govfix.schemas import Input, Submit
from govfix.workflow import project_case


class StartVoice(Input):
    consent: bool
    language: Literal["en", "hi", "mr"]

    @field_validator("consent")
    @classmethod
    def explicit_consent(cls, value):
        if value is not True:
            raise ValueError("Explicit consent is required")
        return value


class VoiceDraft(Input):
    description: str = Field(min_length=1, max_length=5000)
    location: str = Field(min_length=1, max_length=2000)
    category: str = Field(min_length=1, max_length=100)
    ward: str = Field(min_length=1, max_length=100)
    transcript: str = Field(min_length=1, max_length=20000)


class VoiceConfirm(Input):
    confirmation: bool
    draft_hash: str = Field(min_length=64, max_length=64)

    @field_validator("confirmation")
    @classmethod
    def explicit_confirmation(cls, value):
        if value is not True:
            raise ValueError("Explicit confirmation is required")
        return value


def signed_url(settings, language):
    agent = getattr(settings, f"elevenlabs_agent_{language}")
    if not settings.elevenlabs_api_key or not agent:
        raise Refusal("VOICE_UNAVAILABLE", "Voice is unavailable. Please use the text form.", 503)
    try:
        result = ElevenLabs(
            api_key=settings.elevenlabs_api_key, timeout=10
        ).conversational_ai.conversations.get_signed_url(
            agent_id=agent, include_conversation_id=True
        )
        url = result.signed_url
        parsed = urlparse(url)
        conversation_id = (
            getattr(result, "conversation_id", None)
            or parse_qs(parsed.query).get("conversation_id", [None])[0]
        )
        if parsed.scheme != "wss" or parsed.hostname != "api.elevenlabs.io" or not conversation_id:
            raise ValueError("Invalid provider response")
        return {"signed_url": url, "conversation_id": conversation_id}
    except (ApiError, httpx.HTTPError, ValueError, KeyError, AttributeError, TypeError) as exc:
        raise Refusal(
            "VOICE_UNAVAILABLE", "Voice is unavailable. Please use the text form.", 503
        ) from exc


def verified(actor):
    if not actor.identity_verified or not actor.has_role("CITIZEN"):
        raise Refusal(
            "IDENTITY_OR_CONFIRMATION_REQUIRED", "Verified citizen identity is required.", 403
        )


def register_voice(app, sessions, settings, workflow, require_actor, read_case):
    app.state.voice_signer = lambda language: signed_url(settings, language)

    def owned(session, actor, session_id, *, allow_completed=False):
        actor = load_actor(session, actor.id, lock=True)
        verified(actor)
        voice = session.scalar(
            select(VoiceSession)
            .where(VoiceSession.id == session_id, VoiceSession.actor_id == actor.id)
            .with_for_update()
        )
        if voice is None:
            raise Refusal("VOICE_SESSION_NOT_FOUND", "Voice session not found.", 404)
        if voice.cancelled or (not allow_completed and voice.result is not None):
            raise Refusal("VOICE_SESSION_ENDED", "Start a new voice session.", 409)
        if as_utc(voice.expires_at) <= utcnow():
            raise Refusal("VOICE_SESSION_EXPIRED", "Start a new voice session.", 409)
        return actor, voice

    @app.post("/v1/voice/session", status_code=201)
    def start(body: StartVoice, request: Request, actor: Annotated[Actor, Depends(require_actor)]):
        verified(actor)
        provider = app.state.voice_signer(body.language)
        with write_transaction(sessions) as session:
            fresh = load_actor(session, actor.id, lock=True)
            verified(fresh)
            active = session.scalar(
                select(VoiceSession).where(
                    VoiceSession.actor_id == actor.id,
                    VoiceSession.cancelled.is_(False),
                    VoiceSession.result.is_(None),
                    VoiceSession.expires_at > utcnow(),
                )
            )
            if active:
                raise Refusal("VOICE_SESSION_ACTIVE", "End your current voice session first.", 409)
            voice = VoiceSession(
                actor_id=actor.id,
                provider_conversation_id=provider["conversation_id"],
                language=body.language,
                policy_version=settings.policy_version,
                expires_at=utcnow() + timedelta(minutes=15),
            )
            session.add(voice)
            session.flush()
            workflow.audit(
                session,
                actor=fresh,
                case=None,
                operation="voice-consent",
                request_id=request.state.request_id,
                role="CITIZEN",
                channel="VOICE",
                details={"voice_session_id": voice.id, "language": body.language},
            )
            return {
                "session_id": voice.id,
                "signed_url": provider["signed_url"],
                "expires_at": as_utc(voice.expires_at).isoformat(),
            }

    @app.post("/v1/voice/{session_id}/draft")
    def draft(session_id: str, body: VoiceDraft, actor: Annotated[Actor, Depends(require_actor)]):
        with write_transaction(sessions) as session:
            _, voice = owned(session, actor, session_id)
            policy = workflow.policy_for(session, None)
            if voice.policy_version != policy["version"]:
                raise Refusal("VOICE_POLICY_CHANGED", "Start a new voice session.", 409)
            if (
                body.category not in {c["code"] for c in policy["categories"]}
                or body.ward not in policy["wards"]
            ):
                raise Refusal("INVALID_POLICY_VALUE", "Choose a configured category and ward.", 422)
            voice.draft = body.model_dump(exclude={"transcript"})
            # Browser ASR transcript is retained separately; it is not proof of identity or consent.
            voice.transcript = body.transcript
            voice.draft_hash = hashlib.sha256(
                json.dumps(
                    {"draft": voice.draft, "transcript": voice.transcript},
                    sort_keys=True,
                    ensure_ascii=False,
                    separators=(",", ":"),
                ).encode()
            ).hexdigest()
            return {
                "draft": voice.draft,
                "draft_hash": voice.draft_hash,
                "message": "Read back the draft; ask the citizen to review and confirm on screen.",
            }

    @app.post("/v1/voice/{session_id}/confirm", status_code=201)
    def confirm(
        session_id: str,
        body: VoiceConfirm,
        request: Request,
        actor: Annotated[Actor, Depends(require_actor)],
    ):
        with write_transaction(sessions) as session:
            fresh, voice = owned(session, actor, session_id, allow_completed=True)
            if not voice.draft or body.draft_hash != voice.draft_hash:
                raise Refusal(
                    "VOICE_DRAFT_CHANGED", "Review the latest draft before confirming.", 409
                )
            if voice.result:
                return voice.result
            policy = workflow.policy_for(session, None)
            if policy["version"] != voice.policy_version:
                raise Refusal("VOICE_POLICY_CHANGED", "Start a new voice session.", 409)
            command = Submit(**voice.draft, confirmation=True, channel="VOICE")
            case = workflow.submit(session, fresh, command, policy)
            event = workflow.audit(
                session,
                actor=fresh,
                case=case,
                operation="submit",
                request_id=request.state.request_id,
                role="CITIZEN",
                channel="VOICE",
                details={"voice_session_id": voice.id, "draft_hash": voice.draft_hash},
            )
            voice.confirmed_at = utcnow()
            voice.result = {"case": project_case(case, policy), "audit_event_id": event.id}
            return voice.result

    @app.get("/v1/voice/{session_id}/status/{case_id}")
    def status(
        session_id: str,
        case_id: str,
        request: Request,
        actor: Annotated[Actor, Depends(require_actor)],
    ):
        with write_transaction(sessions) as session:
            fresh, voice = owned(session, actor, session_id)
            case = read_case(session, fresh, case_id)
            if case.citizen_id != actor.id:
                raise Refusal("CASE_ACCESS_DENIED", "Case not found.", 404)
            workflow.audit(
                session,
                actor=fresh,
                case=case,
                operation="voice-status",
                request_id=request.state.request_id,
                role="CITIZEN",
                channel="VOICE",
                details={"voice_session_id": voice.id},
            )
            return {
                "id": case.public_id,
                "state": case.workflow_state,
                "current_deadline": as_utc(case.current_deadline).isoformat(),
            }

    @app.post("/v1/voice/{session_id}/cancel")
    def cancel(session_id: str, actor: Annotated[Actor, Depends(require_actor)]):
        with write_transaction(sessions) as session:
            _, voice = owned(session, actor, session_id, allow_completed=True)
            voice.cancelled = True
        return {"cancelled": True}

    @app.post("/v1/webhooks/elevenlabs")
    async def webhook(request: Request):
        if not settings.elevenlabs_webhook_secret:
            raise Refusal("VOICE_UNAVAILABLE", "Voice webhook is not configured.", 503)
        raw = bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw) > 256_000:
                raise Refusal("INVALID_REQUEST", "Webhook payload too large.", 413)
        signature = request.headers.get("elevenlabs-signature", "")
        try:
            fields = dict(part.strip().split("=", 1) for part in signature.split(","))
            # The SDK checks old timestamps; also reject timestamps in the future.
            if abs(utcnow().timestamp() - int(fields["t"])) > 1800:
                raise ValueError("Timestamp outside tolerance")
            event = ElevenLabs(api_key="webhook-verifier").webhooks.construct_event(
                rawBody=raw.decode("utf-8"),
                sig_header=signature,
                secret=settings.elevenlabs_webhook_secret,
            )
        except (BadRequestError, ValueError, KeyError, UnicodeError) as exc:
            raise Refusal("WEBHOOK_AUTH_FAILED", "Invalid webhook signature.", 401) from exc
        if not isinstance(event, dict) or event.get("type") != "post_call_transcription":
            return {"received": True, "ignored": True}
        data = event.get("data")
        if not isinstance(data, dict) or not isinstance(data.get("conversation_id"), str):
            raise Refusal("INVALID_REQUEST", "Missing conversation ID.", 422)
        transcript = data.get("transcript")
        if not isinstance(transcript, list):
            raise Refusal("INVALID_REQUEST", "Missing transcript.", 422)

        def store():
            with write_transaction(sessions) as session:
                voice = session.scalar(
                    select(VoiceSession)
                    .where(VoiceSession.provider_conversation_id == data["conversation_id"])
                    .with_for_update()
                )
                if voice is None:
                    return {"received": True, "ignored": True}
                if voice.provider_transcript is None:
                    # No summary, identity, extracted command, or audio is accepted here.
                    voice.provider_transcript = [
                        {"role": line.get("role"), "message": line.get("message")}
                        for line in transcript
                        if isinstance(line, dict)
                        and line.get("role") in {"user", "agent"}
                        and isinstance(line.get("message"), str)
                    ]
                return {"received": True}

        return await run_in_threadpool(store)
