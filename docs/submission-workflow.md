# Submission demonstration

## The whole cycle

1. **Citizen** logs in as `pilot-citizen`, submits a **POTHOLE / WARD-A** grievance by text or voice, and receives a case reference.
2. **Intake** (`pilot-intake`) checks the report and validates it, or rejects it with a reason.
3. **Dispatcher** (`pilot-dispatcher`) assigns it to `pilot-officer`.
4. **Officer** accepts the assignment, completes the work, uploads a resolution photo, and submits a reviewed resolution note. Dictation can fill the note in supported browsers.
5. **Citizen** reviews the resolution and private photo, then explicitly **accepts** to close or **disputes** with a statement.
6. **Supervisor** (`pilot-supervisor`) reviews disputes and orders rework. The officer resolves it again, and the citizen verifies again.
7. **Ward head** tracks escalations; **Auditor** inspects the timeline, policy, delivery diagnostics and system readiness.

Every handoff uses the same Supabase case. Roles control who can see it and which actions are allowed. The worker sends in-app notifications, flags unanswered verification, and escalates missed deadlines. Silence never closes a grievance.

## Voice controls

Citizen intake uses the configured private ElevenLabs agents for English, Hindi and Marathi. A disconnected or refreshed session can be recovered for draft review or discarded before restarting. Models only prepare drafts; the citizen confirms submission on screen.

Case and resolution **Read aloud** controls use the browser speech service. Officer dictation requires explicit microphone consent and a supported browser; it only fills an editable note. Stop dictation, review the note, select evidence, and submit. Unsupported browsers keep the text workflow available.

Phone-based outbound verification requires a connected telephony provider, a verified contact, and separate outbound consent. No phone number is connected in the current ElevenLabs workspace. In-app citizen verification is fully implemented.

## Final deployment

Commit and push the verified changes together, including migration `0010` and the frontend. Before deploying the new build, apply migrations from the trusted local administrator environment:

```sh
set -a
source .env
set +a
uv run govfix init-db
```

In Render Environment, set `GOVFIX_EMBEDDED_WORKER=true` and `GOVFIX_WORKER_POLL_SECONDS=30`, then deploy the latest commit. Keep the existing Supabase runtime URI, Storage credentials, ElevenLabs key and three agent IDs. The administrator URI belongs only on the administrator's computer.

The free web service processes jobs while awake. When Render suspends it, polling pauses and catches up after startup. Use the separate local `govfix worker --poll-seconds 30` process if continuous deadline processing is needed during the demonstration.

## Verification and recovery

```sh
uv run ruff check .
uv run ruff format --check .
npm run build --prefix web
uv run pytest -q
uv run --with pgserver python scripts/test_postgres.py
uv run python scripts/test_browser.py
uv run python scripts/test_load.py
uv run --with pgserver python scripts/test_load.py --postgres
```

The browser exercise includes the complete cycle, voice recovery, mocked dictation/read-aloud, keyboard dialogs, automated WCAG checks, role boundaries and mobile layouts. The load drill verifies 64 concurrent/retried requests create exactly 8 cases and repeated workers record exactly 24 thresholds. Results describe these test conditions, not a large-scale capacity promise.

Create a private snapshot containing database records and completed evidence:

```sh
uv run govfix backup var/private/backups/submission.zip
```

Snapshots include private case data and password hashes, use mode `0600`, and stay excluded from Git. They are application snapshots, not full Supabase project backups: Auth identities, secrets, role definitions and unrelated Storage objects are managed separately. Database schema and backend permissions come from migrations.

Restore into a **new, empty database and separate private evidence store**. Point the environment at that recovery target, then run:

```sh
uv run govfix restore /absolute/path/to/submission.zip
```

Restore refuses an occupied database, checks archive/evidence checksums, preserves case and audit history, revokes copied login sessions, and cancels old microphone sessions. Revision `0009` snapshots can be restored to `0010`; the added location columns remain empty. Run readiness and the login-to-case workflow before switching the service to a restored target.

References: [Radix dialog accessibility](https://www.radix-ui.com/primitives/docs/components/dialog), [browser speech processing](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API), [automated accessibility testing](https://playwright.dev/docs/accessibility-testing).
