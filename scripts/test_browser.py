"""Exercise the operations UI against a temporary SQLite database and private storage."""

import json
import os
import secrets
import socket
import subprocess
import sys
import tempfile
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.request import urlopen

from PIL import Image
from playwright.sync_api import expect, sync_playwright
from sqlalchemy import select

from govfix.cli import import_policy, migrate, provision_user
from govfix.database import as_utc, make_engine, make_sessions, utcnow, write_transaction
from govfix.models import Case, OutboxMessage
from govfix.settings import Settings
from govfix.worker import Worker

ROOT = Path(__file__).resolve().parents[1]


def test_voice_sdk(page, case, handlers):
    """Exercise real SDK callbacks with fake ASR/tool events, never a paid call."""
    page.context.grant_permissions(["microphone"])
    sockets, confirmations, drafts = [], [], []
    review = {
        "description": case["description"],
        "location": case["location"],
        "category": case["category"],
        "ward": case["ward"],
    }

    def endpoint(route):
        path = route.request.url.rsplit("/", 1)[-1]
        if path == "session":
            result = {
                "session_id": "mock-session",
                "signed_url": "wss://api.elevenlabs.io/v1/convai/conversation?conversation_id=mock-conversation",
                "expires_at": (datetime.now(UTC) + timedelta(minutes=15)).isoformat(),
            }
        elif path == "draft":
            drafts.append(route.request.post_data_json)
            result = {"draft": review, "draft_hash": "a" * 64}
        elif path == "confirm":
            confirmations.append(route.request.post_data_json)
            result = {"case": case}
        else:
            result = {"cancelled": True}
        route.fulfill(json=result)

    def websocket(socket):
        sockets.append(socket)

        def message(raw):
            value = json.loads(raw)
            if value.get("type") == "conversation_initiation_client_data":
                socket.send(
                    json.dumps(
                        {
                            "type": "conversation_initiation_metadata",
                            "conversation_initiation_metadata_event": {
                                "conversation_id": "mock-conversation",
                                "agent_output_audio_format": "pcm_16000",
                                "user_input_audio_format": "pcm_16000",
                            },
                        }
                    )
                )

        socket.on_message(message)

    page.route("**/v1/voice/**", endpoint)
    handlers[:] = [websocket]
    page.get_by_role("button", name="Start voice", exact=True).click()
    expect(page.get_by_role("status").filter(has_text="Microphone active")).to_be_visible(
        timeout=15000
    )
    socket = sockets[0]
    socket.send(
        json.dumps(
            {
                "type": "user_transcript",
                "user_transcription_event": {
                    "user_transcript": "बस थांब्याजवळ खड्डा आहे",
                    "event_id": 1,
                },
            }
        )
    )
    socket.send(
        json.dumps(
            {
                "type": "client_tool_call",
                "client_tool_call": {
                    "tool_name": "prepare_grievance",
                    "tool_call_id": "mock-tool",
                    "event_id": 2,
                    "parameters": review,
                },
            }
        )
    )
    expect(page.get_by_role("heading", name="Review your grievance")).to_be_visible()
    assert drafts[0]["transcript"] == "बस थांब्याजवळ खड्डा आहे"
    expect(page.get_by_role("button", name="Confirm voice grievance")).to_be_disabled()
    assert not confirmations
    page.get_by_role("button", name="Stop voice and review").click()
    expect(page.get_by_role("status").filter(has_text="Voice stopped")).to_be_visible()
    page.get_by_label("I reviewed the read-back and these exact details are correct.").check()
    page.get_by_role("button", name="Confirm voice grievance").click()
    page.get_by_role("button", name="Submit grievance", exact=True).click()
    expect(page.get_by_role("heading", name="Review your grievance")).not_to_be_visible()
    assert confirmations == [{"confirmation": True, "draft_hash": "a" * 64}]
    page.unroute("**/v1/voice/**", endpoint)


def run_browser(url, password, photo, worker):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
        )
        page = browser.new_page(timezone_id="UTC", viewport={"width": 1440, "height": 1000})
        handlers = []
        page.route_web_socket("**", lambda socket: handlers[0](socket))
        errors = []
        page.on("pageerror", lambda exc: errors.append(str(exc)))
        page.goto(url)
        page.wait_for_load_state("networkidle")
        expect(page.get_by_role("heading", name="Every case has a next step.")).to_be_visible()

        def login(username):
            page.get_by_label("Username", exact=True).fill(username)
            page.get_by_label("Password", exact=True).fill(password)
            page.get_by_role("button", name="Sign in", exact=True).click()
            expect(page.get_by_role("button", name="Sign out")).to_be_visible()

        def sign_out():
            page.get_by_role("button", name="Sign out").click()
            expect(page.get_by_role("button", name="Sign in", exact=True)).to_be_visible()

        def open_case():
            page.get_by_role("button").filter(
                has=page.get_by_role("heading", name="Pothole near demo bus stop")
            ).click()
            expect(page.get_by_role("heading", name="Case timeline")).to_be_visible()

        login("citizen")
        expect(page.get_by_role("heading", name="Voice assistance")).to_be_visible()
        expect(page.get_by_role("button", name="Start voice", exact=True)).to_be_disabled()
        page.get_by_label("Voice language").select_option("mr")
        page.get_by_label("I consent to sending microphone audio", exact=False).check()
        page.get_by_role("button", name="Start voice", exact=True).click()
        expect(
            page.get_by_role("alert").filter(has_text="text form remains available")
        ).to_be_visible()
        expect(page.get_by_role("status").filter(has_text="Microphone off.")).to_be_visible()
        page.get_by_role("button", name="New grievance", exact=True).first.click()
        page.get_by_label("Description").fill("Pothole near demo bus stop")
        page.get_by_label("Location").fill("Demo main road")
        page.get_by_label("I confirm that these details accurately describe my grievance.").check()
        with page.expect_response(
            lambda response: (
                response.url.endswith("/v1/cases") and response.request.method == "POST"
            )
        ) as submission:
            page.get_by_role("button", name="Confirm submission").click()
        created = submission.value.json()["case"]
        test_voice_sdk(page, created, handlers)
        expect(page.get_by_role("heading", name="Pothole near demo bus stop")).to_be_visible()
        sign_out()
        login("intake")
        open_case()
        page.get_by_role("button", name="validate", exact=True).click()
        page.get_by_label("I reviewed the jurisdiction, location, category and routing.").check()
        page.get_by_role("button", name="Confirm validate", exact=True).click()
        expect(page.get_by_role("button", name="validate", exact=True)).not_to_be_visible()
        sign_out()
        login("dispatcher")
        open_case()
        page.get_by_role("button", name="assign", exact=True).click()
        page.get_by_label("Responsible officer").select_option(label="Demo officer")
        page.get_by_label("Assignment reason").fill("Assigned to demo road repair team")
        page.get_by_role("button", name="Confirm assign", exact=True).click()
        expect(page.get_by_text("Demo officer", exact=True)).to_be_visible()
        sign_out()
        login("officer")
        open_case()
        page.get_by_role("button", name="accept assignment", exact=True).click()
        page.get_by_label("I accept ownership of this assignment.").check()
        page.get_by_role("button", name="Confirm accept assignment").click()
        expect(page.get_by_label("Resolution photo")).to_be_visible()
        page.get_by_label("Resolution photo").set_input_files(str(photo))
        page.get_by_role("button", name="Upload photo", exact=True).click()
        expect(page.get_by_role("button", name="Download photo")).to_be_visible()
        page.get_by_role("button", name="resolution", exact=True).click()
        page.get_by_label("Work completed").fill("Repaired pothole and verified the surface")
        page.locator('input[name="evidence"]').check()
        page.get_by_role("button", name="Submit resolution", exact=True).click()
        expect(page.get_by_role("heading", name="Submitted resolution")).to_be_visible()
        expect(page.get_by_text("Repaired pothole and verified the surface")).to_be_visible()
        with worker.sessions() as session:
            row = session.scalar(
                select(Case).where(Case.description == "Pothole near demo bus stop")
            )
            simulated = as_utc(row.submitted_at) + timedelta(hours=109)
        worker.clock = lambda: simulated
        cycle = worker.run_once()
        assert cycle["sla"]["thresholds_recorded"] == 3
        assert cycle["verification"]["cases_flagged"] == 1
        with worker.sessions() as session:
            failed_id = session.scalar(
                select(OutboxMessage.id).where(OutboxMessage.status == "RETRY")
            )
        for _attempt in range(4):
            with worker.sessions() as session:
                simulated = as_utc(session.get(OutboxMessage, failed_id).next_attempt_at)
            worker.deliver(failed_id)
        sign_out()
        login("supervisor")
        page.get_by_label("Verification needs review").check()
        open_case()
        expect(
            page.get_by_text("A supervisor has been alerted to the wait.", exact=False)
        ).to_be_visible()
        expect(page.get_by_role("heading", name="Ownership history")).to_be_visible()
        expect(page.get_by_text("Current assignment", exact=True)).to_be_visible()
        with page.expect_download() as pending:
            page.get_by_role("button", name="Download photo").click()
        download = pending.value
        assert Path(download.path()).read_bytes() == photo.read_bytes()
        expect(page.get_by_text("recipient unavailable", exact=True).first).to_be_visible()
        with write_transaction(worker.sessions) as session:
            provision_user(
                session,
                username="head",
                display_name="Demo ward head",
                password=password,
                role="WARD_HEAD",
                wards=["WARD-A"],
            )
        page.get_by_label("Retry reason").fill("Ward head account is now available")
        page.get_by_role("button", name="Retry delivery", exact=True).click()
        expect(page.get_by_role("button", name="Retry delivery", exact=True)).not_to_be_visible()
        assert worker.deliver(failed_id) == "DELIVERED"
        page.get_by_role("button", name="deadline extension", exact=True).click()
        page.get_by_label("New deadline", exact=False).fill(
            (utcnow() + timedelta(days=7)).strftime("%Y-%m-%dT%H:%M")
        )
        page.get_by_label("Extension reason", exact=True).fill(
            "Additional repair observation period"
        )
        page.get_by_role("button", name="Confirm deadline extension", exact=True).click()
        expect(page.get_by_role("alertdialog")).to_be_visible()
        page.get_by_role("button", name="Confirm extension", exact=True).click()
        expect(
            page.get_by_role("button", name="Confirm deadline extension", exact=True)
        ).not_to_be_visible()
        worker.dispatch()
        page.get_by_role("button", name="Refresh case", exact=True).click()
        expect(page.get_by_role("heading", name="SLA and escalation")).to_be_visible()
        expect(page.get_by_text("Escalation level 2", exact=True)).to_be_visible()
        target = ROOT / "artifacts/operations-desktop.png"
        target.parent.mkdir(exist_ok=True)
        page.screenshot(path=str(target), full_page=True)
        page.set_viewport_size({"width": 390, "height": 844})
        expect(page.get_by_role("heading", name="Ownership history")).to_be_visible()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.screenshot(path=str(ROOT / "artifacts/operations-mobile.png"), full_page=True)
        sign_out()
        login("citizen")
        page.get_by_role("button", name="Notifications", exact=True).click()
        expect(page.get_by_text("deadline extended", exact=True)).to_be_visible()
        expect(page.get_by_text("Additional repair observation period", exact=True)).to_be_visible()
        page.get_by_role("button").filter(
            has=page.get_by_text("deadline extended", exact=True)
        ).click()
        expect(page.get_by_role("heading", name="Pothole near demo bus stop")).to_be_visible()
        expect(page.get_by_role("button", name="Download photo")).to_be_visible()
        expect(page.get_by_role("heading", name="Ownership history")).not_to_be_visible()
        page.get_by_role("button", name="verification", exact=True).click()
        page.get_by_label("Dispute the resolution and request supervised rework").check()
        page.get_by_label("What still needs to be fixed?").fill("The surface is still uneven")
        page.get_by_label("I reviewed the resolution and confirm this response.").check()
        page.get_by_role("button", name="Submit dispute", exact=True).click()
        expect(page.get_by_text("The surface is still uneven")).to_be_visible()
        sign_out()
        login("supervisor")
        open_case()
        expect(page.get_by_role("heading", name="Citizen dispute")).to_be_visible()
        page.get_by_role("button", name="review", exact=True).click()
        page.get_by_label("Supervisor review reason").fill("Repair the uneven surface")
        page.get_by_role("button", name="Send for rework", exact=True).click()
        expect(page.get_by_role("button", name="review", exact=True)).not_to_be_visible()
        sign_out()
        login("officer")
        open_case()
        expect(page.get_by_text("The surface is still uneven")).to_be_visible()
        page.get_by_role("button", name="resolution", exact=True).click()
        page.get_by_label("Work completed").fill("Reworked and levelled the road surface")
        page.locator('input[name="evidence"]').check()
        page.get_by_role("button", name="Submit resolution", exact=True).click()
        expect(page.get_by_text("Reworked and levelled the road surface")).to_be_visible()
        sign_out()
        login("citizen")
        open_case()
        page.get_by_role("button", name="verification", exact=True).click()
        page.get_by_label("I reviewed the resolution and confirm this response.").check()
        page.get_by_role("button", name="Accept resolution", exact=True).click()
        expect(page.get_by_role("alertdialog")).to_be_visible()
        page.get_by_role("button", name="Accept and close case", exact=True).click()
        expect(page.get_by_text("closed", exact=True).first).to_be_visible()
        page.get_by_role("button", name="New grievance", exact=True).click()
        page.get_by_label("Description").fill("Duplicate demo pothole report")
        page.get_by_label("Location").fill("Demo main road")
        page.get_by_label("I confirm that these details accurately describe my grievance.").check()
        page.get_by_role("button", name="Confirm submission").click()
        expect(page.get_by_role("heading", name="Duplicate demo pothole report")).to_be_visible()
        sign_out()
        login("intake")
        page.get_by_role("button").filter(
            has=page.get_by_role("heading", name="Duplicate demo pothole report")
        ).click()
        page.get_by_role("button", name="reject", exact=True).click()
        page.get_by_label("Rejection reason").select_option("DUPLICATE")
        page.get_by_label("Explanation").fill("Already recorded in the original demo case")
        page.get_by_role("button", name="Confirm reject", exact=True).click()
        expect(page.get_by_role("alertdialog")).to_be_visible()
        page.get_by_role("button", name="Keep case open").click()
        expect(page.get_by_role("alertdialog")).not_to_be_visible()
        page.get_by_role("button", name="Confirm reject", exact=True).click()
        page.get_by_role("button", name="Confirm rejection", exact=True).click()
        expect(page.get_by_role("button", name="reject", exact=True)).not_to_be_visible()
        page.route(
            "**/v1/auth/logout",
            lambda route: route.fulfill(
                status=401, json={"error": {"message": "Authentication is required."}}
            ),
        )
        page.get_by_role("button", name="Sign out").click()
        expect(page.get_by_role("button", name="Sign in", exact=True)).to_be_visible()
        expect(page.get_by_role("alert")).to_contain_text("Your session expired")
        assert errors == [], errors
        browser.close()
        print(
            "Browser workflow passed: simulated voice, fallback and text workflow; "
            "citizen → intake → dispatcher → officer → supervisor; "
            "SLA escalation, verification wait, dispute, rework, acceptance, "
            "delivery retry, extension, citizen inbox, "
            "mobile layout and private download verified."
        )


def main():
    with tempfile.TemporaryDirectory(prefix="govfix-browser-") as directory:
        root = Path(directory)
        url = f"sqlite:///{root / 'browser.db'}"
        migrate(url)
        engine = make_engine(url)
        sessions = make_sessions(engine)
        password = secrets.token_urlsafe(24)
        with write_transaction(sessions) as session:
            import_policy(session, ROOT / "config/policies/demo-pilot-v1.json")
            for name, role in (
                ("citizen", "CITIZEN"),
                ("intake", "INTAKE_OFFICER"),
                ("dispatcher", "DISPATCHER"),
                ("officer", "OFFICER"),
                ("supervisor", "SUPERVISOR"),
            ):
                provision_user(
                    session,
                    username=name,
                    display_name=f"Demo {name}",
                    password=password,
                    role=role,
                    wards=["WARD-A"],
                    department="PUBLIC_WORKS" if name in {"dispatcher", "officer"} else None,
                    verified=name == "citizen",
                )
        engine.dispose()
        photo = root / "after.png"
        Image.new("RGB", (64, 64), "white").save(photo)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        env = {
            **{
                key: value
                for key, value in os.environ.items()
                if key != "ELEVENLABS_API_KEY" and not key.startswith("GOVFIX_ELEVENLABS_")
            },
            "GOVFIX_DATABASE_URL": url,
            "GOVFIX_EVIDENCE_DIRECTORY": str(root / "private"),
            "GOVFIX_POLICY_VERSION": "demo-pilot-v1",
        }
        with (root / "server.log").open("w+") as log:
            process = subprocess.Popen(
                [
                    sys.executable,
                    "-m",
                    "uvicorn",
                    "govfix.api:app",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    str(port),
                ],
                env=env,
                cwd=ROOT,
                stdout=log,
                stderr=log,
            )
            try:
                address = f"http://127.0.0.1:{port}"
                for _attempt in range(100):
                    try:
                        urlopen(address + "/health", timeout=1).close()
                        break
                    except OSError:
                        if process.poll() is not None:
                            log.seek(0)
                            raise RuntimeError(log.read()) from None
                        time.sleep(0.1)
                else:
                    raise RuntimeError("Test server did not become ready")
                run_browser(
                    address + "/app/",
                    password,
                    photo,
                    Worker(
                        sessions,
                        Settings(database_url=url, evidence_directory=str(root / "private")),
                    ),
                )
            finally:
                process.terminate()
                process.wait(timeout=10)


if __name__ == "__main__":
    main()
