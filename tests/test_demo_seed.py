import json
import stat
from collections import Counter

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from govfix.api import create_app
from govfix.cli import import_policy, migrate
from govfix.database import make_engine, make_sessions, write_transaction
from govfix.models import AuditEvent, AuthSession, Case, Evidence, PolicyVersion, User
from govfix.policy import load_policy
from govfix.settings import Settings
from scripts import seed_demo
from scripts.seed_demo import POLICY, ROOT, SCENARIOS, main


def test_demo_import_preserves_policy_and_is_repeatable(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'demo.db'}"
    settings = Settings(
        database_url=url,
        policy_version="demo-pilot-v3",
        evidence_directory=str(tmp_path / "evidence"),
        embedded_worker=False,
    )
    credentials = tmp_path / "credentials.json"
    monkeypatch.setenv("GOVFIX_DATABASE_URL", url)
    monkeypatch.setattr(Settings, "from_env", staticmethod(lambda: settings))
    monkeypatch.setattr("sys.argv", ["seed_demo", "--apply", "--credentials", str(credentials)])
    migrate(url)
    engine = make_engine(url)
    sessions = make_sessions(engine)
    old_policy = ROOT / "config/policies/demo-pilot-v2.json"
    with write_transaction(sessions) as session:
        import_policy(session, old_policy)
    expected = json.loads(SCENARIOS.read_text())["cases"]
    policy, _ = load_policy(POLICY)
    previous_dataset = tmp_path / "previous-demo-scenarios.json"
    previous_dataset.write_text(
        json.dumps({"policy_version": policy["version"], "synthetic": True, "cases": expected[:-1]})
    )

    def snapshot():
        with sessions() as session:
            return [
                session.scalar(select(func.count()).select_from(model))
                for model in (Case, Evidence, AuditEvent, User)
            ]

    # Existing demo databases have the first 34 cases. Import the new ward-head
    # scenario by key without replaying or rewriting those cases.
    monkeypatch.setattr(seed_demo, "SCENARIOS", previous_dataset)
    main()
    assert snapshot()[0] == len(expected) - 1
    monkeypatch.setattr(seed_demo, "SCENARIOS", SCENARIOS)
    monkeypatch.setattr(
        "sys.argv",
        ["seed_demo", "--apply", "--credentials", str(credentials), "--scenario", "case-35"],
    )
    main()
    first = snapshot()
    main()
    assert snapshot() == first
    assert stat.S_IMODE(credentials.stat().st_mode) == 0o600
    with sessions() as session:
        cases = session.scalars(select(Case)).all()
        assert len(cases) == len(expected)
        assert {c.category for c in cases} == {c["code"] for c in policy["categories"]}
        assert Counter(c.workflow_state for c in cases) == Counter(
            c["target_state"] for c in expected
        )
        assert any(c.escalation_level > 0 for c in cases)
        assert any(
            c.ward == "WARD-A" and c.escalation_level >= 2 and c.terminal_at is None for c in cases
        )
        assert session.get(PolicyVersion, "demo-pilot-v2").checksum == load_policy(old_policy)[1]
        assert session.scalar(select(func.count()).select_from(AuthSession)) == 0
        photo = session.scalars(select(Evidence)).first()
        case = session.get(Case, photo.case_id)
        photo_url = f"/v1/cases/{case.public_id}/evidence/{photo.id}"
        assert photo.complete and photo.content_type == "image/jpeg"
    with TestClient(create_app(settings)) as client:
        assert client.get(photo_url).status_code == 401
        response = client.post(
            "/v1/auth/login",
            json={
                "username": "sample-citizen",
                "password": json.loads(credentials.read_text())["sample-citizen"],
            },
        )
        assert response.status_code == 200
        headers = {"Authorization": f"Bearer {response.json()['access_token']}"}
        assert (
            len(client.get("/v1/intake-options", headers=headers).json()["policy"]["categories"])
            == 20
        )
        downloaded = client.get(photo_url, headers=headers)
        assert downloaded.status_code == 200 and downloaded.headers["content-type"] == "image/jpeg"
        for category in policy["categories"]:
            if category.get("image"):
                image = category["image"]
                assert (ROOT / "web/public" / image.lstrip("/")).is_file()
    engine.dispose()
