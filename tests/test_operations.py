import hashlib
import io

import pytest
from PIL import Image
from sqlalchemy import event, func, select
from sqlalchemy.exc import OperationalError

from govfix.models import AuditEvent, Evidence


def photo():
    stream = io.BytesIO()
    Image.new("RGB", (8, 8), "white").save(stream, format="PNG")
    return stream.getvalue()


def upload(
    backend,
    case,
    *,
    who="officer",
    data=None,
    checksum=None,
    key="photo-key",
    version=None,
    kind="AFTER_PHOTO",
    content_type="image/png",
):
    data = photo() if data is None else data
    return backend.client.post(
        f"/v1/cases/{case['id']}/evidence?kind={kind}",
        content=data,
        headers={
            **backend.headers(who, key, case["version"] if version is None else version),
            "Content-Type": content_type,
            "X-Content-SHA256": checksum or hashlib.sha256(data).hexdigest(),
        },
    )


def test_real_upload_reaches_resolution_with_history(backend):
    case = backend.in_progress()
    response = upload(backend, case)
    assert response.status_code == 201, response.text
    evidence = response.json()["evidence"]
    assert evidence["complete"] and evidence["sha256"] == hashlib.sha256(photo()).hexdigest()
    assert "object_key" not in evidence
    assert upload(backend, case).json()["evidence"]["id"] == evidence["id"]
    result = backend.command(
        case, "resolution", {"note": "Road repaired", "evidence_refs": [evidence["id"]]}, "officer"
    )
    assert result.status_code == 200, result.text
    assert result.json()["case"]["workflow_state"] == "CITIZEN_VERIFICATION"
    for who in ("citizen", "supervisor", "officer"):
        files = backend.client.get(f"/v1/cases/{case['id']}/evidence", headers=backend.headers(who))
        assert files.json()["evidence"][0]["id"] == evidence["id"]
        download = backend.client.get(
            f"/v1/cases/{case['id']}/evidence/{evidence['id']}", headers=backend.headers(who)
        )
        assert download.content == photo()
        assert download.headers["cache-control"] == "no-store"
        assert download.headers["content-disposition"].startswith("attachment")
    ops = backend.client.get(
        f"/v1/cases/{case['id']}/operations", headers=backend.headers("supervisor")
    ).json()
    assert len(ops["assignments"]) == 1
    assert ops["assignments"][0]["ended_at"] is None
    assert ops["owner_name"] == "officer"
    with backend.sessions() as session:
        assert session.scalar(select(func.count()).select_from(Evidence)) == 1
        assert (
            session.scalar(
                select(func.count())
                .select_from(AuditEvent)
                .where(AuditEvent.operation == "evidence-upload", AuditEvent.result == "ACCEPTED")
            )
            == 1
        )


@pytest.mark.parametrize(
    "who,status",
    [
        ("other-officer", 403),
        ("citizen", 403),
        ("supervisor", 403),
        ("outside-supervisor", 404),
        ("other-citizen", 404),
    ],
)
def test_upload_role_and_scope(backend, who, status):
    case = backend.in_progress()
    assert upload(backend, case, who=who).status_code == status
    with backend.sessions() as session:
        assert session.scalar(select(func.count()).select_from(Evidence)) == 0
        refused = session.scalar(
            select(AuditEvent).where(AuditEvent.operation == "evidence-upload")
        )
        assert refused.result == "REFUSED"
        assert refused.actor_id == backend.users[who]


@pytest.mark.parametrize(
    "change,code",
    [
        ({"checksum": "0" * 64}, "CHECKSUM_MISMATCH"),
        ({"data": b"fake image"}, "INVALID_IMAGE"),
        ({"content_type": "image/jpeg"}, "INVALID_IMAGE"),
        ({"kind": "BEFORE_PHOTO"}, "INVALID_EVIDENCE_KIND"),
        ({"version": 1}, "STALE_CASE_VERSION"),
    ],
)
def test_invalid_upload_never_completes(backend, change, code):
    case = backend.in_progress()
    response = upload(backend, case, **change)
    assert response.status_code in (409, 422)
    assert response.json()["error"]["code"] == code
    with backend.sessions() as session:
        assert session.scalar(select(func.count()).select_from(Evidence)) == 0


def test_upload_limits_and_state(backend):
    case = backend.assigned()
    assert upload(backend, case).status_code == 409
    case = backend.command(case, "accept-assignment", {"confirmation": True}, "officer").json()[
        "case"
    ]
    response = upload(backend, case, data=b"x" * (5 * 1024 * 1024 + 1))
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "EVIDENCE_TOO_LARGE"


def test_download_scope_and_corrupt_storage(backend):
    case = backend.in_progress()
    evidence = upload(backend, case).json()["evidence"]
    path = f"/v1/cases/{case['id']}/evidence/{evidence['id']}"
    assert backend.client.get(path).status_code == 401
    for who in ("other-citizen", "outside-supervisor"):
        assert backend.client.get(path, headers=backend.headers(who)).status_code == 404
    other = backend.submit().json()["case"]
    assert (
        backend.client.get(
            f"/v1/cases/{other['id']}/evidence/{evidence['id']}", headers=backend.headers()
        ).status_code
        == 404
    )
    from govfix.evidence import EvidenceStore

    with backend.sessions() as session:
        item = session.get(Evidence, evidence["id"])
        EvidenceStore(backend.app.state.workflow.settings).path(item.object_key).write_bytes(
            b"tampered"
        )
    assert backend.client.get(path, headers=backend.headers()).status_code == 503
    result = backend.command(
        case, "resolution", {"note": "Repaired", "evidence_refs": [evidence["id"]]}, "officer"
    )
    assert result.status_code == 503
    assert (
        backend.client.get(f"/v1/cases/{case['id']}", headers=backend.headers()).json()["case"][
            "workflow_state"
        ]
        == "IN_PROGRESS"
    )


def test_upload_audit_failure_removes_file_and_metadata(backend):
    case = backend.in_progress()
    engine = backend.app.state.sessions.kw["bind"]

    def fail(_conn, _cursor, statement, _params, _context, _many):
        if "INSERT INTO audit_events" in statement:
            raise OperationalError("injected", {}, Exception("audit unavailable"))

    event.listen(engine, "before_cursor_execute", fail)
    try:
        assert upload(backend, case).status_code == 503
    finally:
        event.remove(engine, "before_cursor_execute", fail)
    from pathlib import Path

    root = Path(backend.app.state.workflow.settings.evidence_directory)
    assert not root.exists() or list(root.iterdir()) == []
    with backend.sessions() as session:
        assert session.scalar(select(func.count()).select_from(Evidence)) == 0
    assert upload(backend, case).status_code == 201


def test_operations_are_scoped_and_queue_filters_work(backend):
    case = backend.in_progress()
    backend.submit(who="other-citizen", ward="WARD-B")
    ops = backend.client.get(
        f"/v1/cases/{case['id']}/operations", headers=backend.headers("dispatcher")
    ).json()
    assert {o["id"] for o in ops["officers"]} == {
        backend.users["officer"],
        backend.users["other-officer"],
    }
    assert ops["assignments"] == []
    for who in ("citizen", "officer"):
        ops = backend.client.get(
            f"/v1/cases/{case['id']}/operations", headers=backend.headers(who)
        ).json()
        assert ops["officers"] == [] and ops["assignments"] == []
    assert (
        backend.client.get(
            f"/v1/cases/{case['id']}/operations", headers=backend.headers("outside-supervisor")
        ).status_code
        == 404
    )
    result = backend.client.get(
        "/v1/cases?owned=true&state=IN_PROGRESS", headers=backend.headers("officer")
    ).json()
    assert [item["id"] for item in result["cases"]] == [case["id"]]
    assert (
        backend.client.get("/v1/cases?owned=true", headers=backend.headers("other-officer")).json()[
            "cases"
        ]
        == []
    )
    assert (
        backend.client.get("/v1/operations/summary", headers=backend.headers("supervisor")).json()[
            "total"
        ]
        == 1
    )
    assert (
        backend.client.get(
            "/v1/operations/summary", headers=backend.headers("outside-supervisor")
        ).json()["total"]
        == 1
    )
    assert backend.client.get("/v1/intake-options").status_code == 401


def test_conflicting_upload_key(backend):
    case = backend.in_progress()
    assert upload(backend, case).status_code == 201
    assert upload(backend, case, checksum="0" * 64).status_code == 409


def test_web_served_without_exposing_private_files(backend):
    assert backend.client.get("/").history[0].status_code == 307
    assert backend.client.get("/app/").status_code == 200
    assert "Municipal operations" in backend.client.get("/app/").text
    assert backend.client.get("/app/../var/evidence/test").status_code == 404


def test_retry_after_transient_storage_failure(backend, monkeypatch):
    from govfix.errors import Refusal
    from govfix.evidence import EvidenceStore

    case = backend.in_progress()
    original = EvidenceStore.save

    def unavailable(*_args):
        raise Refusal("EVIDENCE_UNAVAILABLE", "Temporary failure", 503)

    monkeypatch.setattr(EvidenceStore, "save", unavailable)
    assert upload(backend, case).status_code == 503
    monkeypatch.setattr(EvidenceStore, "save", original)
    assert upload(backend, case).status_code == 201


def test_same_length_different_bytes_conflict(backend):
    case = backend.in_progress()
    assert upload(backend, case).status_code == 201
    original = photo()
    changed = original[:-1] + bytes([original[-1] ^ 1])
    result = upload(backend, case, data=changed, checksum=hashlib.sha256(original).hexdigest())
    assert result.status_code == 409


def test_exclusive_storage_preserves_existing_object(tmp_path):
    from govfix.errors import Refusal
    from govfix.evidence import EvidenceStore
    from govfix.models import new_id
    from govfix.settings import Settings

    store = EvidenceStore(Settings(evidence_directory=str(tmp_path / "objects")))
    key = new_id()
    store.save(key, b"existing")
    with pytest.raises(Refusal):
        store.save(key, b"replacement")
    assert store.path(key).read_bytes() == b"existing"


def test_private_store_cannot_be_configured_under_static():
    from pathlib import Path

    from govfix.evidence import EvidenceStore
    from govfix.settings import Settings

    public = Path(__file__).resolve().parents[1] / "govfix/static/evidence"
    with pytest.raises(ValueError, match="outside the public"):
        EvidenceStore(Settings(evidence_directory=str(public)))
