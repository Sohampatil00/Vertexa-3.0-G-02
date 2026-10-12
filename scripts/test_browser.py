"""Exercise the operations UI against a temporary SQLite database and private storage."""

import json
import os
import re
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
from govfix.models import Case, OutboxMessage, RoleGrant, User
from govfix.settings import Settings
from govfix.worker import Worker

ROOT = Path(__file__).resolve().parents[1]


def check_accessibility(page, stage):
    page.add_script_tag(path=str(ROOT / "web/node_modules/axe-core/axe.min.js"))
    violations = page.evaluate("""async () => (await axe.run(document, {
        runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']}
    })).violations.map(v => ({id: v.id, impact: v.impact,
      nodes: v.nodes.map(n => ({target: n.target, html: n.html}))}))""")
    assert not violations, {"stage": stage, "violations": violations}


def test_voice_recovery(page, case):
    """A fresh browser can discard an orphaned session and retrieve its saved draft."""
    cancellations = []
    draft = {key: case[key] for key in ("description", "location", "category", "ward")}

    def handler_for(review):
        def endpoint(route):
            if route.request.method == "GET":
                route.fulfill(
                    json={
                        "session_id": "orphaned-session",
                        "language": "mr",
                        "expires_at": (datetime.now(UTC) + timedelta(minutes=15)).isoformat(),
                        "review": review,
                    }
                )
            elif route.request.url.endswith("/cancel"):
                cancellations.append(route.request.url)
                route.fulfill(json={"cancelled": True})
            else:
                route.fulfill(
                    status=409,
                    json={"error": {"message": "End your current voice session first."}},
                )

        return endpoint

    for review in [None, {"draft": draft, "draft_hash": "a" * 64}]:
        endpoint = handler_for(review)
        page.route("**/v1/voice/**", endpoint)
        page.get_by_role("button", name="Start voice", exact=True).click()
        expect(page.get_by_role("alert").filter(has_text="previous voice session")).to_be_visible()
        expect(page.get_by_role("button", name="Start voice", exact=True)).not_to_be_visible()
        if review:
            expect(page.get_by_role("heading", name="Review your grievance")).to_be_visible()
            expect(page.get_by_role("button", name="Confirm voice grievance")).to_be_disabled()
        page.get_by_role("button", name="Discard voice session", exact=True).click()
        expect(page.get_by_role("button", name="Start voice", exact=True)).to_be_enabled()
        expect(
            page.get_by_role("alert").filter(has_text="previous voice session")
        ).not_to_be_visible()
        expect(page.get_by_role("heading", name="Review your grievance")).not_to_be_visible()
        page.unroute("**/v1/voice/**", endpoint)
    assert len(cancellations) == 2


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
        page.add_init_script("""
            window.SpeechRecognition = class {
                start() { window.testRecognition = this; }
                stop() { this.onend?.(); }
                abort() { this.onend?.(); }
            };
            window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
            Object.defineProperty(window, 'speechSynthesis', {value: {
                speak(utterance) { window.testSpokenText = utterance.text; utterance.onend?.(); },
                cancel() {}
            }});
        """)
        page.on("pageerror", lambda exc: errors.append(str(exc)))
        page.goto(url)
        page.wait_for_load_state("networkidle")
        expect(
            page.get_by_role("heading", name=re.compile(r"Sign in to (CivicVoice|GovFix)"))
        ).to_be_visible()
        check_accessibility(page, "login")

        def login(username):
            page.set_viewport_size({"width": 1440, "height": 1000})
            page.get_by_label("Username", exact=True).fill(username)
            page.get_by_label("Password", exact=True).fill(password)
            page.get_by_role("button", name="Sign in to Operations", exact=True).click()
            expect(page.get_by_role("button", name="Sign out")).to_be_visible()
            title = {
                "citizen": "Welcome back, Demo citizen",
                "mixed": "Executive Governance & Ward Oversight — Ward A & B",
                "officer": "Field Operations Console",
                "intake": "Municipal Intake Queue",
                "dispatcher": "Dispatcher Operations — Validated Cases Awaiting Officer Assignment",
                "auditor": "Executive Governance & Ward Oversight — Ward A & B",
            }.get(username, "Ward Operations & Supervisor Oversight")
            expect(page.get_by_role("heading", name=title, exact=True, level=1)).to_be_visible()
            expect(page.get_by_role("navigation", name="Dashboard navigation")).to_be_visible()
            check_accessibility(page, username + " dashboard")
            target = ROOT / "artifacts" / f"dashboard-{username}.png"
            target.parent.mkdir(exist_ok=True)
            page.screenshot(path=str(target), full_page=True)

        def close_case():
            close = page.get_by_role("button", name="Close modal", exact=True)
            if close.is_visible():
                close.click()

        def sign_out():
            close_case()
            page.get_by_role("button", name="Sign out").click()
            expect(
                page.get_by_role("button", name="Sign in to Operations", exact=True)
            ).to_be_visible()

        def open_case(description="Pothole near demo bus stop"):
            page.get_by_role("button", name=f"View case {description}", exact=True).click()
            expect(
                page.get_by_text(re.compile(r"(?:Audit Timeline|Report progress) \(\d+\)"))
            ).to_be_visible()

        login("citizen")
        check_accessibility(page, "citizen dashboard")
        expect(page.get_by_role("button", name="Voice Grievance", exact=False)).not_to_be_visible()
        expect(page.get_by_label("Switch dashboard")).not_to_be_visible()
        expect(page.get_by_text("Ward A & B • Operations", exact=True)).not_to_be_visible()
        expect(page.get_by_text("Node Active", exact=True)).not_to_be_visible()
        sign_out()

        def configured_voice(route):
            response = route.fetch()
            user = response.json()
            user["voice_languages"] = ["en", "hi", "mr"]
            route.fulfill(response=response, json=user)

        # Voice UI is tested with advertised capabilities and a simulated provider.
        page.route("**/v1/me", configured_voice)
        login("citizen")
        page.get_by_role("button", name="Voice Grievance", exact=False).click()
        expect(page.get_by_role("heading", name="Voice assistance")).to_be_visible()
        expect(page.get_by_role("button", name="Start voice", exact=True)).to_be_disabled()
        page.get_by_label("Voice language").select_option("mr")
        page.get_by_label("I consent to sending microphone audio", exact=False).check()
        page.get_by_role("button", name="Start voice", exact=True).click()
        expect(
            page.get_by_role("alert").filter(has_text="text form remains available")
        ).to_be_visible()
        expect(page.get_by_role("status").filter(has_text="Microphone off.")).to_be_visible()
        page.get_by_role("button", name="Report New Grievance", exact=False).first.click()
        check_accessibility(page, "new grievance dialog")
        for key in ["Tab", "Shift+Tab", "Tab"]:
            page.keyboard.press(key)
            assert page.evaluate("document.activeElement.closest('[role=dialog]') !== null")
        page.keyboard.press("Escape")
        expect(page.get_by_role("dialog", name="New grievance", exact=True)).not_to_be_visible()
        page.get_by_role("button", name="Report New Grievance", exact=False).first.click()
        page.get_by_label("Detailed Description").fill("Pothole near demo bus stop")
        page.get_by_label("Location Details").fill("Demo main road")
        page.get_by_label(
            "I confirm that these details accurately describe my grievance", exact=False
        ).check()
        with page.expect_response(
            lambda response: (
                response.url.endswith("/v1/cases") and response.request.method == "POST"
            )
        ) as submission:
            page.get_by_role("button", name="Submit & Generate Case ID").click()
        created = submission.value.json()["case"]
        expect(page.get_by_role("button", name="Close modal", exact=True)).to_be_visible()
        close_case()
        test_voice_recovery(page, created)
        test_voice_sdk(page, created, handlers)
        expect(page.get_by_role("heading", name="Pothole near demo bus stop").last).to_be_visible()
        page.unroute("**/v1/me", configured_voice)
        sign_out()
        login("intake")
        open_case()
        page.get_by_role("button", name="validate", exact=True).click()
        page.get_by_role("button", name="Confirm validate", exact=True).click()
        expect(page.get_by_role("button", name="validate", exact=True)).not_to_be_visible()
        sign_out()
        assert worker.dispatch()["DELIVERED"] == 1
        login("dispatcher")
        page.get_by_role("button", name="Open notifications", exact=True).click()
        expect(
            page.get_by_text("Demo intake validated this grievance", exact=False)
        ).to_be_visible()
        page.get_by_role("button", name="Back to Dashboard", exact=True).click()
        open_case()
        page.get_by_role("button", name="assign", exact=True).click()
        page.get_by_label("Assign to Officer").select_option(label="Demo officer")
        page.get_by_label("Dispatch Reason").fill("Assigned to demo road repair team")
        page.get_by_role("button", name="Confirm assign", exact=True).click()
        expect(page.get_by_text("Demo officer", exact=True)).to_be_visible()
        sign_out()
        login("officer")
        page.get_by_role("button", name=re.compile(r"Needs Acceptance")).click()
        expect(
            page.get_by_role("button", name="View case Pothole near demo bus stop")
        ).to_be_visible()
        open_case()
        page.get_by_role("button", name="accept assignment", exact=True).click()
        page.get_by_label("I accept ownership and commit", exact=False).check()
        page.get_by_role("button", name="Confirm accept assignment").click()
        expect(page.get_by_label("Resolution photo")).to_be_visible()
        page.get_by_label("Resolution photo").set_input_files(str(photo))
        page.get_by_role("button", name="Upload Evidence", exact=True).click()
        expect(page.get_by_role("button", name="Download", exact=True)).to_be_visible()
        page.get_by_role("button", name="resolution", exact=True).click()
        page.get_by_label("I consent to microphone processing", exact=False).check()
        page.get_by_role("button", name="Dictate resolution note", exact=True).click()
        page.evaluate(
            "window.testRecognition.onresult({results: "
            "[[{transcript: 'Repaired pothole and verified the surface'}]]})"
        )
        page.get_by_role("button", name="Stop dictation", exact=True).click()
        expect(page.get_by_label("Work Completed Description")).to_have_value(
            "Repaired pothole and verified the surface"
        )
        page.locator('input[name="evidence"]').check()
        page.get_by_role("button", name="Confirm resolution", exact=True).click()
        expect(page.get_by_text("Field Resolution Submitted", exact=True)).to_be_visible()
        expect(page.get_by_text("Repaired pothole and verified the surface")).to_be_visible()
        page.get_by_role("button", name="Read resolution aloud", exact=True).click()
        assert "Repaired pothole" in page.evaluate("window.testSpokenText")
        page.get_by_role("button", name="Read case timeline aloud", exact=True).click()
        assert "resolution" in page.evaluate("window.testSpokenText")
        sign_out()
        login("mixed")
        expect(page.get_by_label("Switch dashboard").locator("option")).to_have_count(4)
        page.get_by_label("Switch dashboard").select_option("citizen-overview")
        expect(page.get_by_role("heading", name="No grievances registered")).to_be_visible()
        page.get_by_label("Switch dashboard").select_option("field-officer")
        expect(
            page.get_by_role("heading", name="Field Operations Console", level=1)
        ).to_be_visible()
        page.get_by_label("Switch dashboard").select_option("supervisor-queue")
        page.get_by_role("button", name=re.compile(r"All Ward Cases")).click()
        open_case()
        expect(page.get_by_role("button", name="deadline extension", exact=True)).to_be_visible()
        close_case()
        page.get_by_label("Switch dashboard").select_option("auditor-portal")
        open_case()
        expect(
            page.get_by_role("button", name="deadline extension", exact=True)
        ).not_to_be_visible()
        expect(page.get_by_text("Authorized Next Actions", exact=True)).not_to_be_visible()
        expect(page.get_by_role("button", name="Upload Evidence", exact=True)).not_to_be_visible()
        sign_out()
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
        login("supervisor")
        open_case()
        expect(
            page.get_by_text("A supervisor has been alerted to the wait.", exact=False)
        ).to_be_visible()
        expect(page.get_by_text("Officer Assignment Log", exact=True)).to_be_visible()
        expect(page.get_by_text("Active Officer", exact=True)).to_be_visible()
        with page.expect_download() as pending:
            page.get_by_role("button", name="Download", exact=True).click()
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
        page.get_by_label("New SLA Deadline").fill(
            (utcnow() + timedelta(days=7)).strftime("%Y-%m-%dT%H:%M")
        )
        page.get_by_label("Reason for Extension", exact=True).fill(
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
        expect(page.get_by_text("Officer Assignment Log", exact=True)).to_be_visible()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.screenshot(path=str(ROOT / "artifacts/operations-mobile.png"), full_page=True)
        sign_out()
        login("citizen")
        page.get_by_role("button", name="Open notifications", exact=True).click()
        expect(page.get_by_text("deadline extended", exact=True)).to_be_visible()
        expect(page.get_by_text("Additional repair observation period", exact=True)).to_be_visible()
        page.get_by_role("button", name="Open deadline extended notification", exact=True).click()
        expect(page.get_by_role("heading", name="Pothole near demo bus stop").last).to_be_visible()
        expect(page.get_by_role("button", name="Download", exact=True)).to_be_visible()
        expect(page.get_by_text("Officer Assignment Log", exact=True)).not_to_be_visible()
        page.get_by_role("button", name="Review resolution", exact=True).click()
        page.get_by_label("Dispute Resolution", exact=True).check()
        page.get_by_label("What Still Needs To Be Fixed?").fill("The surface is still uneven")
        page.get_by_role("button", name="Submit resolution response", exact=True).click()
        expect(page.get_by_text("The surface is still uneven")).to_be_visible()
        sign_out()
        login("supervisor")
        open_case()
        expect(page.get_by_text("Citizen Dispute Statement", exact=True)).to_be_visible()
        page.get_by_role("button", name="review", exact=True).click()
        page.get_by_label("Supervisor Review Reason").fill("Repair the uneven surface")
        page.get_by_role("button", name="Confirm review", exact=True).click()
        expect(page.get_by_role("button", name="review", exact=True)).not_to_be_visible()
        sign_out()
        login("officer")
        open_case()
        expect(page.get_by_text("The surface is still uneven")).to_be_visible()
        page.get_by_role("button", name="resolution", exact=True).click()
        page.get_by_label("Work Completed Description").fill(
            "Reworked and levelled the road surface"
        )
        page.locator('input[name="evidence"]').check()
        page.get_by_role("button", name="Confirm resolution", exact=True).click()
        expect(page.get_by_text("Reworked and levelled the road surface")).to_be_visible()
        sign_out()
        login("citizen")
        open_case()
        page.get_by_role("button", name="Review resolution", exact=True).click()
        page.get_by_role("button", name="Submit resolution response", exact=True).click()
        expect(page.get_by_role("alertdialog")).to_be_visible()
        page.get_by_role("button", name="Accept and close case", exact=True).click()
        expect(page.get_by_text("Resolved & Closed", exact=True).first).to_be_visible()
        sign_out()
        login("auditor")
        expect(
            page.get_by_role("button", name="Report New Grievance", exact=False)
        ).not_to_be_visible()
        open_case()
        expect(page.get_by_text("Officer Assignment Log", exact=True)).to_be_visible()
        expect(page.get_by_text("Authorized Next Actions", exact=True)).not_to_be_visible()
        close_case()
        page.get_by_role("button", name="Charter Spec", exact=False).click()
        expect(
            page.get_by_role("heading", name=re.compile("Municipal Charter Policy Specification"))
        ).to_be_visible()
        page.get_by_role("button", name="System readiness", exact=True).click()
        expect(page.get_by_text("Deployment: degraded", exact=True)).to_be_visible()
        page.set_viewport_size({"width": 390, "height": 844})
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.set_viewport_size({"width": 1440, "height": 1000})
        sign_out()
        login("citizen")
        page.get_by_role("button", name="Report New Grievance", exact=False).click()
        page.get_by_label("Detailed Description").fill("Duplicate demo pothole report")
        page.get_by_label("Location Details").fill("Demo main road")
        page.get_by_label(
            "I confirm that these details accurately describe my grievance", exact=False
        ).check()
        page.get_by_role("button", name="Submit & Generate Case ID").click()
        expect(
            page.get_by_role("heading", name="Duplicate demo pothole report").last
        ).to_be_visible()
        sign_out()
        login("intake")
        open_case("Duplicate demo pothole report")
        page.get_by_role("button", name="reject", exact=True).click()
        page.get_by_label("Rejection Reason Code").select_option("DUPLICATE")
        page.get_by_label("Audited Explanation").fill("Already recorded in the original demo case")
        page.get_by_role("button", name="Confirm reject", exact=True).click()
        expect(page.get_by_role("alertdialog")).to_be_visible()
        page.get_by_role("button", name="Keep case open").click()
        expect(page.get_by_role("alertdialog")).not_to_be_visible()
        page.get_by_role("button", name="Confirm reject", exact=True).click()
        page.get_by_role("button", name="Confirm rejection", exact=True).click()
        expect(page.get_by_role("button", name="reject", exact=True)).not_to_be_visible()
        sign_out()
        login("citizen")
        page.get_by_role("button", name=re.compile(r"^Rejected reports")).click()
        expect(
            page.get_by_role("button", name="View case Duplicate demo pothole report", exact=True)
        ).to_be_visible()
        expect(
            page.get_by_role("button", name="View case Pothole near demo bus stop", exact=True)
        ).not_to_be_visible()
        page.get_by_role("button", name=re.compile(r"^Resolved reports")).click()
        expect(
            page.get_by_role("button", name="View case Pothole near demo bus stop", exact=True)
        ).to_be_visible()
        expect(
            page.get_by_role("button", name="View case Duplicate demo pothole report", exact=True)
        ).not_to_be_visible()
        sign_out()
        login("mixed")
        page.get_by_label("Switch dashboard").select_option("citizen-overview")
        expect(page.get_by_role("heading", name="No grievances registered")).to_be_visible()
        page.get_by_role("button", name="Report New Grievance", exact=True).click()
        page.get_by_label("Detailed Description").fill("Personal report from multi-role citizen")
        page.get_by_label("Location Details").fill("Demo community road")
        page.get_by_label(
            "I confirm that these details accurately describe my grievance", exact=False
        ).check()
        page.get_by_role("button", name="Submit & Generate Case ID").click()
        expect(page.get_by_text(re.compile(r"Report progress \(\d+\)"))).to_be_visible()
        for label in ("deadline extension", "review", "assign", "resolution", "Upload Evidence"):
            expect(page.get_by_role("button", name=label, exact=True)).not_to_be_visible()
        for label in (
            "Authorized Next Actions",
            "SLA and escalation",
            "Officer Assignment Log",
            "Audit Timeline",
        ):
            expect(page.get_by_text(label, exact=False)).not_to_be_visible()
        check_accessibility(page, "multi-role citizen report details")
        close_case()
        expect(
            page.get_by_role("button", name="View case Pothole near demo bus stop", exact=True)
        ).not_to_be_visible()
        page.get_by_role("button", name="Open notifications", exact=True).click()
        expect(page.get_by_role("heading", name="My report notifications")).to_be_visible()
        page.get_by_label("Switch dashboard").select_option("supervisor-queue")
        page.get_by_role("button", name=re.compile(r"All Ward Cases")).click()
        open_case("Personal report from multi-role citizen")
        expect(page.get_by_role("button", name="deadline extension", exact=True)).to_be_visible()
        close_case()
        page.get_by_label("Switch dashboard").select_option("citizen-overview")
        open_case("Personal report from multi-role citizen")
        expect(
            page.get_by_role("button", name="deadline extension", exact=True)
        ).not_to_be_visible()
        page.route(
            "**/v1/auth/logout",
            lambda route: route.fulfill(
                status=401, json={"error": {"message": "Authentication is required."}}
            ),
        )
        close_case()
        page.get_by_role("button", name="Sign out").click()
        expect(page.get_by_role("button", name="Sign in to Operations", exact=True)).to_be_visible()
        expect(page.get_by_role("alert")).to_contain_text("Your session expired")
        assert errors == [], errors
        browser.close()
        print(
            "Browser workflow passed: simulated voice, fallback and text workflow; "
            "citizen → intake → dispatcher → officer → supervisor; "
            "SLA escalation, verification wait, dispute, rework, acceptance, "
            "delivery retry, extension, citizen inbox, "
            "citizen report filters, role-scoped details, multi-role switching, read-only auditor, "
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
                ("auditor", "AUDITOR"),
                ("mixed", "OFFICER"),
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
            mixed = session.scalar(select(User).where(User.username == "mixed"))
            for role in ("CITIZEN", "SUPERVISOR", "AUDITOR"):
                session.add(
                    RoleGrant(
                        user_id=mixed.id, role=role, ward=None if role == "CITIZEN" else "WARD-A"
                    )
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
