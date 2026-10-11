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

The web interface sends `X-GovFix-Role` with the selected dashboard role on case reads,
commands, evidence requests, summaries, and notifications. This restricts a multi-role
account to that role's existing grants for the request, including transaction-time
authorization. An unassigned or revoked role returns 403. API clients that omit this
optional header retain the account's complete set of grants. Notifications keep the
role of the dashboard from which the inbox was opened.

Citizen views show personal reports, progress, resolution photos, and permitted
accept/dispute responses. Staff assignment, audit diagnostics, escalation, and
delivery retry controls stay in their respective dashboards. `/v1/me` advertises
`voice_languages` only for a verified citizen with a configured voice provider and
language agent; the citizen page hides unavailable voice controls.

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
# Supabase deployment

Supabase PostgreSQL is the selected project database. Supabase Auth and Storage integrations are configured separately:

- **Database:** set `GOVFIX_DATABASE_URL` to the Supabase Postgres connection string. The
  application normalizes `postgresql://` and `postgres://` URLs to the installed psycopg driver.
- **Authentication:** `GOVFIX_AUTH_PROVIDER=local` (default) uses provisioned GovFix accounts,
  including when PostgreSQL and Storage are hosted by Supabase. To use Supabase email/password
  login, explicitly set `GOVFIX_AUTH_PROVIDER=supabase`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY`.
  The verified Supabase UUID must already exist in `users.id` with application-controlled
  `user_roles`. Login exchanges that identity for an opaque GovFix session; logout revokes it.
  Raw provider JWTs are not accepted as GovFix bearer tokens. Neither email confirmation nor
  provider metadata grants municipal roles or verified citizen identity.
- **Evidence:** set `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_STORAGE_BUCKET` for the private
  evidence bucket. The service-role key is server-only and must never be sent to the browser.
  Evidence remains checksum-verified and its metadata is committed transactionally with the case
  audit event.

Export the Supabase PostgreSQL connection string as `GOVFIX_DATABASE_URL` in the app and worker environments; never commit database passwords. `SUPABASE_URL` is the HTTP API URL and cannot replace the PostgreSQL connection string. When `SUPABASE_URL` is set, startup refuses a missing/non-PostgreSQL database setting to prevent accidental SQLite use. SQLite remains available for isolated tests and explicitly selected local demos. The current no-environment fallback is still SQLite; it does not establish a Supabase connection.


## Local Supabase connection troubleshooting

For a local machine without IPv6 routing, copy **Connect → Direct → Session pooler → URI** from the Supabase dashboard. Keep its exact pooler hostname and `postgres.PROJECT_REF` username; the direct `db.PROJECT_REF.supabase.co` host may have only an IPv6 DNS record and fail local hostname resolution. Use port `5432`, URL-encode password characters, and append `?sslmode=require` (or `&sslmode=require` if parameters already exist).

Keep exactly one `GOVFIX_DATABASE_URL` assignment in `.env`. A later assignment overrides an earlier one. Reload the environment before running migrations and restart both API and worker afterward. Adding SSL alone cannot fix an IPv6/DNS connection failure. See [Supabase connection options](https://supabase.com/docs/guides/database/connecting-to-postgres).


## Supabase permission boundary and workflow verification

Migration `0007` enables RLS on all 14 GovFix tables and revokes table privileges from
`PUBLIC`, `anon`, `authenticated`, and `service_role`, plus execute access to the history
trigger function. No Data API policies are installed: all governed reads and writes go
through the backend's scoped authorization, transactions, idempotency and audit checks.
Private Storage uses its own schema; its service-role integration still works.
Default table privileges for the migration owner are revoked for future tables in `public`.
Downgrading does not restore unsafe grants. Migration `0008` adds the `govfix_backend` group and explicit policies confined to that
trusted backend role. The API and worker connect as `govfix_runtime`, with no ownership,
RLS bypass, schema creation, role administration or password/role-grant mutation rights.
See [Supabase's grants and RLS guidance](https://supabase.com/docs/guides/api/securing-your-api).

After loading `.env` (`set -a; source .env; set +a`):

```sh
uv run govfix init-db
uv run python scripts/audit_supabase.py
uv run python scripts/verify_login_case.py
```

The audit exits nonzero for missing tables, disabled RLS, unexpected policies or API-role grants.
The live workflow check creates temporary accounts inside a transaction and exercises
login → identity → intake options → case creation → list/detail/timeline/actions → logout.
It verifies another citizen cannot see the case and a revoked session is denied. Nested
savepoints exercise request commits; the outer rollback removes every verification record.
Run it serially; it uses one database connection across requests. It currently checks the
local account provider. Native Supabase Auth is covered by mocked identity-provider tests;
real native login still needs a provisioned and linked Supabase Auth account.

Never point `GOVFIX_TEST_DATABASE_URL` at Supabase: the main test fixture drops its schema.
Use `scripts/test_postgres.py` for the disposable PostgreSQL suite.


## Phase 6 authentication hardening

### Shared login budgets

Every well-formed login attempt reserves a PostgreSQL budget before Argon2 or Supabase Auth:
5 attempts per account and 30 per peer IP in a 900-second window by default. Successful
attempts count too. Both checks are atomic across processes; account keys are normalized
for budgeting and never used to resolve the account identity. Stored keys are HMAC hashes;
passwords, account names and IP addresses are never stored in budget rows. Blocked requests
return `LOGIN_RATE_LIMITED`, HTTP 429 and `Retry-After`; a database outage refuses login
with HTTP 503. Budgets survive restarts; the worker removes expired rows in bounded batches.

Configure `GOVFIX_LOGIN_ACCOUNT_LIMIT`, `GOVFIX_LOGIN_IP_LIMIT`,
`GOVFIX_LOGIN_WINDOW_SECONDS`, and a generated `GOVFIX_LOGIN_RATE_SECRET` shared by all
API processes. Changing the secret resets budgets; keep it stable across restarts.
The fallback secret is for isolated local demonstrations only.

The app reads the peer address from the ASGI request, never `X-Forwarded-For` itself.
For direct access, run Uvicorn with `--no-proxy-headers`. Behind a reverse proxy, explicitly
set `--forwarded-allow-ips` to that proxy's addresses; never trust arbitrary forwarding
headers. Account limits remain shared when many citizens use one address; adjust IP limits
for the pilot's network after measuring legitimate traffic. These limits reduce guessing;
they do not replace edge traffic limits or approved identity verification.

### Restricted PostgreSQL login

```sh
# Load the existing owner connection, then apply the schema migration.
set -a; source .env; set +a
uv run govfix init-db
uv run python scripts/provision_database_role.py        # preview
uv run python scripts/provision_database_role.py --apply
# Reload the changed environment before restarting API/worker.
set -a; source .env; set +a
uv run python scripts/audit_supabase.py
uv run python scripts/verify_login_case.py
```

Provisioning creates a generated password for `govfix_runtime`, verifies its connection,
and atomically updates the private `.env` without printing credentials. It retains the
owner URI as `GOVFIX_MIGRATION_DATABASE_URL`. `govfix init-db`, policy import, account
provisioning and Alembic use that owner URI; API and worker use `GOVFIX_DATABASE_URL`.
Do not rerun provisioning to rotate passwords: it refuses existing role/URI configurations.

The backend can read provisioned users and role grants, create/update workflow records,
append audit/evidence/SLA records, and prune login budgets. `UPDATE(active)` on `users`
is the minimum column permission needed for PostgreSQL account row locks; password hashes
and role grants remain read-only. Schema ownership, CREATE, TRUNCATE, history mutation,
policy mutation and RLS bypass are denied. RLS policies grant row access solely to the
trusted backend group; case-level scope checks remain in the API and transactional workflow.
Data API roles have no grants and cannot inherit the backend group.

`GOVFIX_REQUIRE_RESTRICTED_ROLE=true` rejects API/worker startup with an administrative
connection; provisioning enables it. Future tables receive no automatic backend grants:
add exact privileges and policies in a reviewed migration.

In deployment, provide the migration URI only to the administration job, never the API or
worker process; local `.env` combines both for developer administration. Store production
credentials in the deployment secret manager, with separate runtime and administration
access. The live rollback verification seeds using the admin connection, then switches to
`govfix_backend` for all application requests and rolls back every generated record.
