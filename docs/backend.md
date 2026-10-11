# Running the workflow foundation

Phase 1 provides a FastAPI service with SQLAlchemy persistence, Alembic migrations, local account authentication, scoped role grants, versioned case commands, and transactional audit/idempotency records. It uses the fictional `DEMO_ONLY` policy. Python 3.12 and [uv](https://docs.astral.sh/uv/getting-started/installation/) are required.

## Setup

From the repository root:

```sh
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

Open [API documentation](http://127.0.0.1:8000/docs). Call `POST /v1/auth/login` with a username and password, then use **Authorize** to supply the returned bearer token. Sessions expire after 60 minutes by default and `POST /v1/auth/logout` revokes them. Passwords use Argon2; only a SHA-256 hash of each random session token is stored. Roles are read from the database on each request.

## First case path

1. As the citizen, `POST /v1/cases` with description, location, `POTHOLE`, `WARD-A`, and `confirmation: true`. Set a new `Idempotency-Key`.
2. As intake, call the case's `/validate` endpoint with `POTHOLE`, `WARD-A`, `PUBLIC_WORKS`, and jurisdiction `Fictional Demo Municipality`.
3. As dispatcher, call `/assign` with the officer ID, `PUBLIC_WORKS`, and a reason.
4. As that officer, call `/accept-assignment` with `confirmation: true`.

For steps 2–4, send a new `Idempotency-Key` and an `If-Match` header containing the current case version, e.g. `"1"`. The response supplies the next version. A retry must use the original key, payload, and version; it returns the original command outcome. Reusing a key for different content is refused.

Citizen reads are restricted to their own cases. Staff reads are restricted to explicitly granted wards and optional departments. An officer's grant permits reading cases in that scope; changing a case still requires current ownership. Supervisors, ward heads, and auditors can see refused attempts in the timeline. Other roles receive only accepted timeline events without internal audit details.

The resolution, verification, and rework commands implement the backend gates for the complete P0 graph. Resolution requires existing, completed evidence records from the same case; supplied object references alone cannot create evidence. Private upload completion is Phase 2 work, so full resolution demonstrations currently use trusted test fixtures. Internal verification/review transitions and their pending outbox requests commit atomically. There is no delivery worker yet, so queued requests remain `PENDING`.

## Configuration and database

Export `GOVFIX_DATABASE_URL`, `GOVFIX_POLICY_VERSION`, and `GOVFIX_SESSION_MINUTES` as needed; values in `.env.example` are examples and are not automatically loaded. The default local database is `sqlite:///./govfix.db`. PostgreSQL URLs use `postgresql+psycopg://...`.

The API never creates or changes tables at startup. Run `uv run govfix init-db` to migrate and import the default policy. Run `uv run alembic upgrade head` for schema-only upgrades. Existing policy versions cannot be rewritten; import a new validated version with `uv run govfix import-policy PATH`, then explicitly select it with `GOVFIX_POLICY_VERSION` for new submissions. Open cases retain their pinned policy and original deadline.

Case mutation, ownership intervals, audit events, and idempotency results share one transaction. PostgreSQL locks actor and case rows; SQLite uses `BEGIN IMMEDIATE` for write transactions and deferred transactions for reads. Database triggers refuse ordinary updates or deletes to audit history and policy versions. Privileged database administrators can alter those protections; independent backup/export and restricted production database roles remain pilot hardening work.

The elapsed-hour demo deadline is recorded at submission and SLA status is derived on reads. Automatic escalation, deadline extensions, notifications, and the verification wait review worker remain Phase 3/4 work. Voice commands are refused until a verified voice-session implementation exists.

## Validation

```sh
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

This local foundation still needs approved municipal policy, production citizen identity verification, login/request rate limits, private evidence storage, operational interfaces, workers, and release validation before a real pilot.
