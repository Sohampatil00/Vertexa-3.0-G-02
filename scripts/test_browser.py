"""Exercise the operations UI against a temporary SQLite database and private storage."""

import os
import secrets
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.request import urlopen

from PIL import Image
from playwright.sync_api import expect, sync_playwright

from govfix.cli import import_policy, migrate, provision_user
from govfix.database import make_engine, make_sessions, write_transaction

ROOT = Path(__file__).resolve().parents[1]


def run_browser(url, password, photo):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
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
        page.get_by_role("button", name="New grievance", exact=True).first.click()
        page.get_by_label("Description").fill("Pothole near demo bus stop")
        page.get_by_label("Location").fill("Demo main road")
        page.get_by_label("I confirm that these details accurately describe my grievance.").check()
        page.get_by_role("button", name="Confirm submission").click()
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
        expect(
            page.get_by_text(
                "Resolution submitted. The case remains open pending citizen verification."
            )
        ).to_be_visible()
        sign_out()
        login("supervisor")
        open_case()
        expect(page.get_by_role("heading", name="Ownership history")).to_be_visible()
        expect(page.get_by_text("Current assignment", exact=True)).to_be_visible()
        with page.expect_download() as pending:
            page.get_by_role("button", name="Download photo").click()
        download = pending.value
        assert Path(download.path()).read_bytes() == photo.read_bytes()
        target = ROOT / "artifacts/operations-desktop.png"
        target.parent.mkdir(exist_ok=True)
        page.screenshot(path=str(target), full_page=True)
        page.set_viewport_size({"width": 390, "height": 844})
        expect(page.get_by_role("heading", name="Ownership history")).to_be_visible()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.screenshot(path=str(ROOT / "artifacts/operations-mobile.png"), full_page=True)
        sign_out()
        login("citizen")
        open_case()
        expect(page.get_by_role("button", name="Download photo")).to_be_visible()
        expect(page.get_by_role("heading", name="Ownership history")).not_to_be_visible()
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
            "Browser workflow passed: citizen → intake → dispatcher → officer → supervisor; "
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
            **os.environ,
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
                run_browser(address + "/app/", password, photo)
            finally:
                process.terminate()
                process.wait(timeout=10)


if __name__ == "__main__":
    main()
