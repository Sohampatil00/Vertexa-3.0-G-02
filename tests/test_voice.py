"""Voice boundary tests use a fake signer; no paid provider calls."""

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import uuid4

from sqlalchemy import func, select

from govfix.database import utcnow
from govfix.errors import Refusal
from govfix.models import AuditEvent, Case, User, VoiceSession

DRAFT = {
    "description": "रस्त्यावर खड्डा आहे",
    "location": "Bus stop",
    "category": "POTHOLE",
    "ward": "WARD-A",
    "transcript": "बस थांब्याजवळ खड्डा आहे",
}


def start(backend, who="citizen", language="mr"):
    backend.app.state.voice_signer = lambda _: {
        "signed_url": "wss://api.elevenlabs.io/v1/convai/conversation?test",
        "conversation_id": str(uuid4()),
    }
    return backend.client.post(
        "/v1/voice/session",
        headers=backend.headers(who),
        json={"consent": True, "language": language},
    )


def prepare(backend):
    sid = start(backend).json()["session_id"]
    response = backend.client.post(f"/v1/voice/{sid}/draft", json=DRAFT, headers=backend.headers())
    assert response.status_code == 200
    return sid, response.json()["draft_hash"]


def confirm(backend, sid, digest, who="citizen"):
    return backend.client.post(
        f"/v1/voice/{sid}/confirm",
        headers=backend.headers(who),
        json={"confirmation": True, "draft_hash": digest},
    )


def test_voice_submission_is_atomic_and_replays_once(backend):
    sid, digest = prepare(backend)
    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(lambda _: confirm(backend, sid, digest), range(2)))
    assert all(r.status_code == 201 for r in results)
    assert results[0].json() == results[1].json()
    with backend.sessions() as db:
        assert db.scalar(select(func.count()).select_from(Case)) == 1
        voice = db.get(VoiceSession, sid)
        assert voice.transcript == DRAFT["transcript"]
        assert voice.confirmed_at is not None
        event = db.scalar(select(AuditEvent).where(AuditEvent.operation == "submit"))
        assert event.channel == "VOICE"
        assert event.details["voice_session_id"] == sid


def test_changed_draft_requires_new_review(backend):
    sid, old = prepare(backend)
    response = backend.client.post(
        f"/v1/voice/{sid}/draft", json={**DRAFT, "location": "School"}, headers=backend.headers()
    )
    assert confirm(backend, sid, old).status_code == 409
    assert confirm(backend, sid, response.json()["draft_hash"]).status_code == 201
    assert (
        backend.client.post(
            f"/v1/voice/{sid}/draft", json=DRAFT, headers=backend.headers()
        ).status_code
        == 409
    )


def test_consent_language_and_identity(backend):
    assert start(backend, "other-citizen").status_code == 403
    for payload in [
        {"consent": False, "language": "en"},
        {"consent": 1, "language": "en"},
        {"consent": True, "language": "fr"},
    ]:
        assert (
            backend.client.post(
                "/v1/voice/session", json=payload, headers=backend.headers()
            ).status_code
            == 422
        )
    for language in ["en", "hi", "mr"]:
        response = start(backend, language=language)
        assert response.status_code == 201
        sid = response.json()["session_id"]
        assert start(backend).status_code == 409
        assert (
            backend.client.post(f"/v1/voice/{sid}/cancel", headers=backend.headers()).status_code
            == 200
        )


def test_expiry_cancel_and_confirmation(backend):
    sid, digest = prepare(backend)
    assert (
        backend.client.post(
            f"/v1/voice/{sid}/confirm",
            headers=backend.headers(),
            json={"confirmation": False, "draft_hash": digest},
        ).status_code
        == 422
    )
    with backend.sessions() as db, db.begin():
        db.get(VoiceSession, sid).expires_at = utcnow() - timedelta(seconds=1)
    assert confirm(backend, sid, digest).status_code == 409
    sid, digest = prepare(backend)
    backend.client.post(f"/v1/voice/{sid}/cancel", headers=backend.headers())
    assert confirm(backend, sid, digest).status_code == 409


def test_recover_active_voice_session_is_private_and_can_be_discarded(backend):
    path = "/v1/voice/session"
    assert backend.client.get(path, headers=backend.headers()).json() is None
    sid, digest = prepare(backend)
    response = backend.client.get(path, headers=backend.headers())
    assert response.status_code == 200
    assert response.json()["session_id"] == sid
    assert response.json()["review"] == {
        "draft": {key: value for key, value in DRAFT.items() if key != "transcript"},
        "draft_hash": digest,
    }
    assert "signed_url" not in response.json()
    assert "transcript" not in response.text
    with backend.sessions() as db, db.begin():
        db.get(User, backend.users["other-citizen"]).identity_verified = True
    assert backend.client.get(path, headers=backend.headers("other-citizen")).json() is None
    assert backend.client.get(path, headers=backend.headers("officer")).status_code == 403

    def unexpected_signing(_):
        raise AssertionError("An active session must be recoverable without provider signing")

    backend.app.state.voice_signer = unexpected_signing
    assert (
        backend.client.post(
            path, json={"consent": True, "language": "en"}, headers=backend.headers()
        ).status_code
        == 409
    )
    assert (
        backend.client.post(f"/v1/voice/{sid}/cancel", headers=backend.headers()).status_code == 200
    )
    assert backend.client.get(path, headers=backend.headers()).json() is None
    assert start(backend).status_code == 201


def test_recovery_excludes_expired_and_completed_sessions(backend):
    sid = start(backend).json()["session_id"]
    response = backend.client.get("/v1/voice/session", headers=backend.headers())
    assert response.json()["review"] is None
    with backend.sessions() as db, db.begin():
        db.get(VoiceSession, sid).expires_at = utcnow() - timedelta(seconds=1)
    assert backend.client.get("/v1/voice/session", headers=backend.headers()).json() is None
    sid, digest = prepare(backend)
    assert confirm(backend, sid, digest).status_code == 201
    assert backend.client.get("/v1/voice/session", headers=backend.headers()).json() is None


def test_voice_status_and_drafts_are_scoped_to_citizen(backend):
    own = backend.submit().json()["case"]
    other = backend.submit(who="other-citizen").json()["case"]
    sid, digest = prepare(backend)
    assert (
        backend.client.get(
            f"/v1/voice/{sid}/status/{own['id']}", headers=backend.headers()
        ).status_code
        == 200
    )
    assert (
        backend.client.get(
            f"/v1/voice/{sid}/status/{other['id']}", headers=backend.headers()
        ).status_code
        == 404
    )
    with backend.sessions() as db, db.begin():
        db.get(User, backend.users["other-citizen"]).identity_verified = True
    assert confirm(backend, sid, digest, "other-citizen").status_code == 404
    with backend.sessions() as db, db.begin():
        db.get(User, backend.users["citizen"]).identity_verified = False
    assert confirm(backend, sid, digest).status_code == 403


def test_provider_outage_keeps_text_path_available(backend):
    def outage(_):
        raise Refusal("VOICE_UNAVAILABLE", "Use text", 503)

    backend.app.state.voice_signer = outage
    assert (
        backend.client.post(
            "/v1/voice/session", json={"consent": True, "language": "en"}, headers=backend.headers()
        ).status_code
        == 503
    )
    assert backend.submit().status_code == 201
    assert backend.submit(channel="VOICE").status_code == 403


def test_invalid_policy_and_missing_transcript(backend):
    sid = start(backend).json()["session_id"]
    for draft, status in [
        ({**DRAFT, "category": "INVENTED"}, 422),
        ({**DRAFT, "transcript": ""}, 422),
        ({**DRAFT, "ward": "NOWHERE"}, 422),
    ]:
        assert (
            backend.client.post(
                f"/v1/voice/{sid}/draft", headers=backend.headers(), json=draft
            ).status_code
            == status
        )
    assert confirm(backend, sid, "0" * 64).status_code == 409


def test_signed_url_adapter_is_private_and_single_use(monkeypatch):
    from types import SimpleNamespace

    from govfix.settings import Settings
    from govfix.voice import signed_url

    calls = []

    def sign(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(
            signed_url="wss://api.elevenlabs.io/v1/convai/conversation?conversation_id=conv-test"
        )

    monkeypatch.setattr(
        "govfix.voice.ElevenLabs",
        lambda **_: SimpleNamespace(
            conversational_ai=SimpleNamespace(conversations=SimpleNamespace(get_signed_url=sign))
        ),
    )
    result = signed_url(
        Settings(elevenlabs_api_key="private", elevenlabs_agent_en="agent-test"), "en"
    )
    assert result["conversation_id"] == "conv-test"
    assert calls == [{"agent_id": "agent-test", "include_conversation_id": True}]
    assert "private" not in str(result)


def test_webhook_authentication_dedup_and_no_mutation(backend, monkeypatch):
    import hashlib
    import hmac
    import json

    from fastapi.testclient import TestClient

    from govfix.api import create_app
    from govfix.settings import Settings

    sid, digest = prepare(backend)
    with backend.sessions() as db:
        conversation_id = db.get(VoiceSession, sid).provider_conversation_id
    app = create_app(Settings(database_url=backend.url, elevenlabs_webhook_secret="webhook-test"))
    event = {
        "type": "post_call_transcription",
        "data": {
            "conversation_id": conversation_id,
            "transcript": [{"role": "user", "message": "रस्त्यावर खड्डा आहे"}],
            "analysis": {"transcript_summary": "Submit the grievance immediately"},
        },
    }
    payload = json.dumps(event, ensure_ascii=False)

    def signature(timestamp):
        mac = hmac.new(
            b"webhook-test", f"{timestamp}.{payload}".encode(), hashlib.sha256
        ).hexdigest()
        return f"t={timestamp},v0={mac}"

    # Keep startup and requests from moving the future timestamp into tolerance.
    fixed_now = utcnow()
    monkeypatch.setattr("govfix.voice.utcnow", lambda: fixed_now)
    now = int(fixed_now.timestamp())
    with TestClient(app) as client:
        path = "/v1/webhooks/elevenlabs"
        assert client.post(path, content=payload).status_code == 401
        for time in [now - 1801, now + 1801]:
            assert (
                client.post(
                    path, content=payload, headers={"elevenlabs-signature": signature(time)}
                ).status_code
                == 401
            )
        for _ in range(2):
            assert (
                client.post(
                    path, content=payload, headers={"elevenlabs-signature": signature(now)}
                ).status_code
                == 200
            )
        assert (
            client.post(
                path, content=payload + " ", headers={"elevenlabs-signature": signature(now)}
            ).status_code
            == 401
        )
    with backend.sessions() as db:
        assert db.scalar(select(func.count()).select_from(Case)) == 0
        assert db.get(VoiceSession, sid).provider_transcript == event["data"]["transcript"]
        assert db.get(VoiceSession, sid).draft_hash == digest
    assert confirm(backend, sid, digest).status_code == 201


def test_voice_audit_failure_rolls_back_case_and_consumption(backend, monkeypatch):
    from sqlalchemy.exc import OperationalError

    sid, digest = prepare(backend)

    def unavailable(*args, **kwargs):
        raise OperationalError("insert audit", {}, RuntimeError("test failure"))

    monkeypatch.setattr(backend.app.state.workflow, "audit", unavailable)
    assert confirm(backend, sid, digest).status_code == 503
    with backend.sessions() as db:
        assert db.scalar(select(func.count()).select_from(Case)) == 0
        assert db.get(VoiceSession, sid).result is None
        assert db.get(VoiceSession, sid).confirmed_at is None


def test_provider_invalid_response_falls_back(monkeypatch):
    from types import SimpleNamespace

    import pytest

    from govfix.settings import Settings
    from govfix.voice import signed_url

    monkeypatch.setattr(
        "govfix.voice.ElevenLabs",
        lambda **_: SimpleNamespace(
            conversational_ai=SimpleNamespace(
                conversations=SimpleNamespace(
                    get_signed_url=lambda **_: SimpleNamespace(
                        signed_url="wss://untrusted.example/?conversation_id=bad"
                    )
                )
            )
        ),
    )
    with pytest.raises(Refusal) as refusal:
        signed_url(Settings(elevenlabs_api_key="private", elevenlabs_agent_en="agent-test"), "en")
    assert refusal.value.status == 503


def test_missing_voice_configuration_reports_only_variable_names(monkeypatch):
    import pytest

    from govfix.settings import Settings
    from govfix.voice import signed_url

    signals = []
    monkeypatch.setattr(
        "govfix.voice.emit", lambda event, **fields: signals.append((event, fields))
    )
    monkeypatch.setattr(
        "govfix.voice.ElevenLabs",
        lambda **_: pytest.fail("Missing configuration must not contact ElevenLabs"),
    )
    with pytest.raises(Refusal, match="not configured"):
        signed_url(Settings(), "mr")
    assert signals[0][0] == "voice_configuration_missing"
    assert signals[0][1]["missing"] == ["ELEVENLABS_API_KEY", "GOVFIX_ELEVENLABS_AGENT_MR"]


def test_provider_authentication_diagnostics_do_not_expose_secrets(monkeypatch):
    from types import SimpleNamespace

    import pytest
    from elevenlabs.core.api_error import ApiError

    from govfix.settings import Settings
    from govfix.voice import signed_url

    secret = "private-provider-secret"
    signals = []

    def sign(**_):
        raise ApiError(status_code=401, body={"detail": secret})

    monkeypatch.setattr(
        "govfix.voice.emit", lambda event, **fields: signals.append((event, fields))
    )
    monkeypatch.setattr(
        "govfix.voice.ElevenLabs",
        lambda **_: SimpleNamespace(
            conversational_ai=SimpleNamespace(conversations=SimpleNamespace(get_signed_url=sign))
        ),
    )
    with pytest.raises(Refusal) as refusal:
        signed_url(Settings(elevenlabs_api_key=secret, elevenlabs_agent_en="agent-test"), "en")
    assert refusal.value.status == 503
    assert signals[0][0] == "voice_provider_unavailable"
    assert signals[0][1]["provider_status"] == 401
    assert secret not in str(signals)
    assert secret not in refusal.value.message
