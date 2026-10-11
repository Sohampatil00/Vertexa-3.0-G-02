# Running GovFix locally

Phases 1–3 provide a React operations interface and a FastAPI service with SQLAlchemy persistence, Alembic migrations, local account authentication, scoped role grants, versioned case commands, and transactional audit/idempotency records. It uses the fictional `DEMO_ONLY` policy. Python 3.12 and [uv](https://docs.astral.sh/uv/getting-started/installation/) are required.

## Setup

From the repository root:

```sh
npm ci --prefix web
npm run build --prefix web
uv sync --locked
uv run govfix init-db
uv run govfix create-user citizen --name "Demo Citizen" --role CITIZEN --verified
uv run govfix create-user intake --name "Demo Intake" --role INTAKE_OFFICER --ward WARD-A
uv run govfix create-user dispatcher --name "Demo Dispatcher" --role DISPATCHER --ward WARD-A --department PUBLIC_WORKS
uv run govfix create-user officer --name "Demo Officer" --role OFFICER --ward WARD-A --department PUBLIC_WORKS
uv run govfix create-user supervisor --name "Demo Supervisor" --role SUPERVISOR --ward WARD-A
uv run govfix create-user auditor --name "Demo Auditor" --role AUDITOR --ward WARD-A
uv run uvicorn govfix.api:app --host 127.0.0.1 --port 8000
```

Each account command prompts for a password of at least 12 characters. No default credentials or staff registration endpoint exist. Save the officer ID printed by account creation for the assignment request. `--verified` records administrator-established demo identity; it is not an OTP or production identity verification integration.

Open the [operations interface](http://127.0.0.1:8000/app/) and sign in with a provisioned account. Sessions stay in browser memory and are cleared on reload. Citizen intake and verification, staff validation/assignment, an officer queue, resolution upload/submission, and scoped supervisor review/rework are available. See [citizen verification](./citizen-verification.md).

Open [API documentation](http://127.0.0.1:8000/docs). Call `POST /v1/auth/login` with a username and password, then use **Authorize** to supply the returned bearer token. Sessions expire after 60 minutes by default and `POST /v1/auth/logout` revokes them. Passwords use Argon2; only a SHA-256 hash of each random session token is stored. Roles are read from the database on each request.

## First case path

1. As the citizen, `POST /v1/cases` with description, location, `POTHOLE`, `WARD-A`, and `confirmation: true`. Set a new `Idempotency-Key`.
2. As intake, call the case's `/validate` endpoint with `POTHOLE`, `WARD-A`, `PUBLIC_WORKS`, and jurisdiction `Fictional Demo Municipality`.
3. As dispatcher, call `/assign` with the officer ID, `PUBLIC_WORKS`, and a reason.
4. As that officer, call `/accept-assignment` with `confirmation: true`.

For steps 2–4, send a new `Idempotency-Key` and an `If-Match` header containing the current case version, e.g. `"1"`. The response supplies the next version. A retry must use the original key, payload, and version; it returns the original command outcome. Reusing a key for different content is refused.

Citizen reads are restricted to their own cases. Staff reads are restricted to explicitly granted wards and optional departments. An officer's grant permits reading cases in that scope; changing a case still requires current ownership. Supervisors, ward heads, and auditors can see refused attempts in the timeline. Other roles receive only accepted timeline events without internal audit details.

The resolution, verification, and rework commands implement the backend gates for the complete P0 graph. Resolution requires existing, completed evidence records from the same case; supplied object references alone cannot create evidence. Phase 2 uploads actual private images and verifies their checksum, format, size, and completion before resolution submission. Internal verification/review transitions and their pending outbox requests commit atomically. The Phase 3 worker delivers queued requests to authenticated in-app inboxes; start it separately as described in [SLA operations](./sla-operations.md).

## Configuration and database

Export `GOVFIX_DATABASE_URL`, `GOVFIX_POLICY_VERSION`, and `GOVFIX_SESSION_MINUTES` as needed; values in `.env.example` are examples and are not automatically loaded. The default local database is `sqlite:///./govfix.db`. PostgreSQL URLs use `postgresql+psycopg://...`.

The API never creates or changes tables at startup. Run `uv run govfix init-db` to migrate and import the default policy. Run `uv run alembic upgrade head` for schema-only upgrades. Existing policy versions cannot be rewritten; import a new validated version with `uv run govfix import-policy PATH`, then explicitly select it with `GOVFIX_POLICY_VERSION` for new submissions. Open cases retain their pinned policy and original deadline.

Case mutation, ownership intervals, audit events, and idempotency results share one transaction. PostgreSQL locks actor and case rows; SQLite uses `BEGIN IMMEDIATE` for write transactions and deferred transactions for reads. Database triggers refuse ordinary updates or deletes to audit history and policy versions. Privileged database administrators can alter those protections; independent backup/export and restricted production database roles remain pilot hardening work.

The elapsed-hour demo deadline is recorded at submission and SLA status is derived on reads. Phase 3 implements warning/escalation monitoring, audited extensions, and in-app notification retries. Phase 4 flags unanswered verification for supervisor review after the pinned policy window; it never closes the case. Voice commands are refused until a verified voice-session implementation exists.


## Operations interface and evidence

The web client uses React, TypeScript, Vite and Tailwind. `npm run dev --prefix web` runs its development server, with `/v1` proxied to the API on port 8000. The production build writes generated files to `govfix/static/`; restart the API after the first build so `/app/` is mounted. Generated assets and `node_modules` are ignored; the source and npm lockfile are tracked. Node 22.12+ is required. This selects Vite for the local client instead of the earlier Next.js proposal; the current screens need no server rendering or separate web server. See [Vite build guidance](https://vite.dev/guide/build) and [Tailwind’s Vite integration](https://tailwindcss.com/docs/installation/using-vite).

The default private store is `./var/evidence`, outside the static directory. Override it with `GOVFIX_EVIDENCE_DIRECTORY`, pointing to a private writable directory. Set `GOVFIX_EVIDENCE_MAX_BYTES` to change the 5 MiB default, up to 20 MiB. Still PNG, JPEG, and WebP images of at most 20 megapixels are accepted. The API verifies the actual decoded format and SHA-256 rather than trusting the filename or supplied MIME type. Original bytes are preserved, including any EXIF metadata; officers should remove sensitive metadata before upload. Automated metadata removal and approved retention remain hardening work.

The assigned officer uploads during `IN_PROGRESS` using `POST /v1/cases/{id}/evidence?kind=AFTER_PHOTO`. Send raw image bytes with `Content-Type`, `X-Content-SHA256`, `Idempotency-Key`, and `If-Match`. Uploads do not change the workflow version. Exact retries return the same evidence record; altered bytes conflict, and transient storage failures can retry. Accepted/refused attempts are audited. Listing and downloading evidence require a valid session and current case access; there are no public object URLs. Session expiry or revocation also ends download access. Files are served as attachments with no caching. Resolution submission and downloads recheck stored bytes against the recorded checksum.

Completed evidence metadata and audit share one database transaction. If that transaction fails, the new file is removed. A process crash between durable file creation and database commit can leave an unreferenced private file; production storage needs reconciliation and coordinated database/object backups. The local store is for one demo host, not a multi-host production storage solution.

To run the browser workflow against a temporary database with generated credentials and private files:

```sh
uv run playwright install chromium
uv run python scripts/test_browser.py
```

It exercises citizen submission, intake validation, dispatcher assignment, officer acceptance/upload/resolution, supervisor history, private download, and mobile layout. Temporary credentials, database, and evidence are cleaned up. Synthetic screenshots are written to ignored `artifacts/`.

## SLA worker

Run `uv run govfix worker --poll-seconds 30` in a separate terminal with the same database configuration. Use `--once` for a single batch. The API does not run the worker automatically. See [SLA operations](./sla-operations.md) for threshold timing, extensions, inbox delivery, retry behavior, and failure diagnostics.

## Validation

```sh
npm ci --prefix web
npm run build --prefix web
uv run pytest -q
uv run ruff check .
uv run ruff format --check .
uv run govfix init-db
uv run alembic check
```

For an isolated PostgreSQL run on platforms with a supported `pgserver` wheel:

```sh
uv run --with pgserver python scripts/test_postgres.py
```

The helper creates a temporary database, runs the suite, stops PostgreSQL, and removes the temporary data. Alternatively, set `GOVFIX_TEST_DATABASE_URL` to a **disposable test database** before running pytest. The PostgreSQL fixtures downgrade and recreate GovFix tables for each test; never point this variable at an application or pilot database. CI defines separate SQLite and PostgreSQL jobs.

The authentication implementation follows [FastAPI's security guidance](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/) for Argon2 password hashing while using opaque, revocable sessions. Transaction handling follows [SQLAlchemy's SQLite transaction documentation](https://docs.sqlalchemy.org/en/20/dialects/sqlite.html). CI installation follows [uv's GitHub Actions guidance](https://docs.astral.sh/uv/guides/integration/github/).

This local foundation still needs approved municipal policy, production citizen identity verification, login/request rate limits, production object storage, external notification providers, and release validation before a real pilot.
