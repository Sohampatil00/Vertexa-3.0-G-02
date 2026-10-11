# Deploy GovFix on Render

## Free plan for demos

### If Render asks for payment information

The message "Your Blueprint services require payment information" indicates the
creation flow includes paid resources. Check the selected Blueprint path: the
default `render.yaml` defines two paid services, while `render.free.yaml` defines
only one free web service. If the Blueprint flow remains blocked, cancel it and
use **New → Web Service** with the manual settings below.

| Setting | Value |
|---|---|
| Repository | `Sohampatil00/Vertexa-3.0-G-02` |
| Branch | Your pushed deployment branch |
| Language / runtime | Docker |
| Root Directory | Leave blank |
| Dockerfile Path | `./Dockerfile` |
| Docker Command | `python scripts/render_start.py web` |
| Region | Singapore |
| Instance Type | **Free** |
| Health Check Path | `/ready` |
| Auto Deploy | Off |

Add these environment variables in the web service creation form:

| Variable | Value |
|---|---|
| `GOVFIX_DATABASE_URL` | Restricted runtime URI from `.env`, including `sslmode=require` |
| `SUPABASE_URL` | Your HTTPS project URL from `.env` |
| `SUPABASE_SERVICE_ROLE_KEY` | Your server-only Storage service key from `.env` |
| `SUPABASE_STORAGE_BUCKET` | `evidence` |
| `GOVFIX_REQUIRE_RESTRICTED_ROLE` | `true` |
| `GOVFIX_POLICY_VERSION` | `demo-pilot-v1` |
| `GOVFIX_AUTH_PROVIDER` | `local` |
| `GOVFIX_LOGIN_IP_LIMIT` | `300` |
| `GOVFIX_READINESS_TIMEOUT_MS` | `2000` |
| `GOVFIX_LOGIN_RATE_SECRET` | A freshly generated random secret, at least 32 characters |

Generate the login-rate secret on your own terminal, then paste it into Render:

```sh
python3 -c 'import secrets; print(secrets.token_urlsafe(32))'
```

Manual service creation does not read your YAML environment variables, so enter
every value in this table. Do not add a disk, a background worker, a Render
database, or the migration administrator URI. Confirm **Free** is selected before
clicking **Create Web Service**. Render's
[first deploy tutorial](https://render.com/docs/your-first-deploy) describes free
web service creation without payment. If a correctly configured single free web
service still triggers a payment/verification prompt, follow Render's account
support flow; adding payment information is not necessary to debug this project's
deployment configuration.

### Free Blueprint flow

Use **`render.free.yaml`** to create one free web service containing the API and
React interface. The default `render.yaml` creates paid web and worker services.
Render does not offer a free background worker. Keep Supabase for PostgreSQL and
private evidence storage in either setup.

1. Your migrations and `pilot-citizen` / `pilot-auditor` accounts are already
   prepared if you followed the local setup below. Do not recreate the accounts.
2. Commit and push the deployment files to your GitHub branch.
3. In Render choose **New → Blueprint**, connect your repository and branch, and
   set **Blueprint Path** to **`render.free.yaml`**.
4. Confirm the preview contains only **`govfix-web-free`**, with plan **Free**.
5. Enter `GOVFIX_DATABASE_URL` (restricted runtime URI with `sslmode=require`),
   `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` from your local `.env`. Do not
   upload the whole `.env` or add `GOVFIX_MIGRATION_DATABASE_URL`. Render generates
   the login-rate secret automatically.
6. Create the Blueprint and wait for deployment. Open
   `https://YOUR-SERVICE.onrender.com/ready`, then `/app/`, and log in using your
   existing pilot accounts. The health check should return HTTP 200.
7. Run the worker on your Mac in a separate terminal connected to the same
   Supabase database:

   ```sh
   cd /Users/sohampatil/G-02
   set -a
   source .env
   set +a
   unset GOVFIX_MIGRATION_DATABASE_URL
   uv run govfix worker --poll-seconds 30
   ```

Keep this terminal running and the Mac awake during the demo. When it stops,
automatic deadline processing, escalation checks and notification delivery pause.
The API and interface can still run; auditor operations checks will report a
missing/stale worker. `/ready` checks API dependencies and does not require a
running worker. Resume the worker to process pending work.

Free web services sleep after 15 minutes without inbound traffic and take about
one minute to wake. Render provides 750 free instance hours per workspace each
month, shared between free web services. Bandwidth/build quotas also apply; review
usage and billing settings if you add a payment method. See
[Render free-plan limits](https://render.com/docs/free). Live ElevenLabs usage and
Supabase usage follow those providers' own plans.

If using the manual **New → Web Service** flow instead, select **Docker**,
**Free**, Dockerfile `./Dockerfile`, Docker Command
`python scripts/render_start.py web`, and health check `/ready`. Add all environment
variables listed in `render.free.yaml`; generate a random login-rate secret locally
with `python3 -c 'import secrets; print(secrets.token_urlsafe(32))'` and paste it into
`GOVFIX_LOGIN_RATE_SECRET`. The Blueprint flow fills these defaults for you.

## Paid deployment with a hosted worker

The repository includes a Docker image and a Render Blueprint (`render.yaml`).
The web service serves FastAPI and the built React interface at `/app/`. A separate
worker monitors deadlines and delivers in-app notifications every 30 seconds.
Both use your existing **Supabase PostgreSQL** database. Evidence uses the private
Supabase Storage bucket, so uploaded files survive Render redeploys.

The Blueprint selects paid `0.5c-512mb` instances in Singapore for both services.
Review the current price in Render before creating the Blueprint. A free web
instance can sleep, and this setup needs a continuously running worker.
See [Render Blueprint reference](https://render.com/docs/blueprint-spec) and
[background workers](https://render.com/docs/background-workers).

## 1. Prepare Supabase from your local machine

Use the existing `.env` containing your restricted runtime connection and the
administrator connection. Do not commit this file or paste its contents into logs.

```sh
cd /Users/sohampatil/G-02
set -a
source .env
set +a
uv sync --locked
uv run govfix init-db
```

`init-db` uses `GOVFIX_MIGRATION_DATABASE_URL` to apply Alembic migrations and load
the configured demo policy. The current schema head is `0010`. Keep the migration
connection on your trusted administration machine. The running services receive
only `GOVFIX_DATABASE_URL` with the restricted `govfix_runtime` login. If this role
has not been provisioned, follow [authentication hardening](./backend.md#phase-6-authentication-hardening)
first; do not reprovision an existing role.

Create the accounts you need before deployment using the existing administrator
CLI. Passwords are entered interactively:

```sh
uv run govfix create-user pilot-citizen --name "Pilot Citizen" --role CITIZEN --verified
uv run govfix create-user pilot-auditor --name "Pilot Auditor" --role AUDITOR --ward WARD-A
```

Run each command separately. At each password prompt, enter a password of 12–128
characters and press Enter; the terminal does not display the characters you type.
Ward codes are case-sensitive: the demo policy configures `WARD-A` and `WARD-B`.
Run these commands only for accounts that do not already exist. `--verified`
records an identity check performed by the administrator. The default policy is
fictional; approve and import a new policy version before a real municipal launch.

In Supabase Storage, confirm the `evidence` bucket exists and is **private**.

## 2. Make the deployment files available on GitHub

Commit the deployment files and push the branch you want Render to deploy to your
existing GitHub repository. Never push `.env`, runtime data, or service keys.
Render builds the React frontend and installs Python dependencies from the lockfiles.
No frontend environment variables are needed: the UI calls the API on the same origin.

## 3. Create the Render Blueprint

1. Open [Render Dashboard](https://dashboard.render.com/), choose **New → Blueprint**,
   and connect `Sohampatil00/Vertexa-3.0-G-02`.
2. Select your pushed branch and the repository's `render.yaml` file.
3. Review `govfix-web`, `govfix-worker`, their region and paid plans.
4. Enter the three requested secrets below, then create the Blueprint.

| Requested variable | Value |
|---|---|
| `GOVFIX_DATABASE_URL` | Existing restricted Supabase PostgreSQL runtime URI; include `sslmode=require` |
| `SUPABASE_URL` | Supabase project's HTTPS URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service role key, used for private Storage access |

For example, the URI structure is:

```text
postgresql://govfix_runtime:PERCENT_ENCODED_PASSWORD@YOUR_HOST:5432/postgres?sslmode=require
```

If the URI already has query parameters, append `&sslmode=require` instead.
Use your working URI from `.env`; percent-encode reserved password characters.
If direct Supabase networking is unavailable, use the Supabase **session pooler**
connection appropriate to your provisioned runtime login. See
[Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).

Render generates `GOVFIX_LOGIN_RATE_SECRET`. The worker obtains that secret and
the runtime database URI through service references. Both services enforce the
restricted database role at runtime. Do **not** add `GOVFIX_MIGRATION_DATABASE_URL`
to either service: the launcher rejects administrator migration credentials.

The default auth provider is `local`: GovFix accounts and sessions are stored in
Supabase PostgreSQL. To enable native Supabase Auth instead, follow
[backend setup](./backend.md), add `SUPABASE_ANON_KEY` to the web service and change
`GOVFIX_AUTH_PROVIDER` to `supabase` after linking identities and roles.

## 4. Verify the deployment

Use the actual hostname assigned to `govfix-web`:

| Path | Expected result |
|---|---|
| `/health` | HTTP 200: the API process is running |
| `/ready` | HTTP 200: database, schema, policy and runtime role pass checks |
| `/app/` | Login page and React interface |
| `/docs` | API documentation |

Render uses `/ready` as its web health check. In worker logs, confirm successful
processing cycles. Log in as an auditor and check `/v1/operations/status` through
the interface/API: the worker should become healthy after its first cycle.
Run the full citizen submission, staff assignment, resolution and citizen
verification flow described in [backend setup](./backend.md).

If deployment fails, check logs for configuration errors. Database connection
failure usually means an incorrect runtime URI, password encoding, networking or
TLS setting. A readiness failure can mean migrations/policy are missing or the
database role still has administrator permissions. Evidence upload failure can
mean a missing private bucket or incorrect Storage credentials. Never print URI
or key values while investigating.

### Startup says the restricted backend login is required

The URI authenticated successfully, but its PostgreSQL role failed the runtime
permission check. A Supabase dashboard connection string commonly uses the
administrator login `postgres` (or `postgres.PROJECT_REF` through the pooler).
That login belongs in the local `GOVFIX_MIGRATION_DATABASE_URL`, not Render's
`GOVFIX_DATABASE_URL`.

For a provisioned runtime role, keep the same host, port and database, but use
`govfix_runtime` for direct connections or `govfix_runtime.PROJECT_REF` for the
Supabase pooler. Use **that role's database password**: changing the username while
keeping the administrator password will not authenticate. Keep `sslmode=require`.
Save the corrected URI as `GOVFIX_DATABASE_URL` in Render, retain
`GOVFIX_REQUIRE_RESTRICTED_ROLE=true`, and redeploy.

If `govfix_runtime` already exists, do not rerun the provisioning script. Restore
its saved connection string/password. If the password has been lost, an
administrator must rotate that role's password, update the runtime URI in local
and hosted environments, and restart every runtime using the previous password.
Account login passwords such as the pilot citizen's password are separate from
this database-role password.

## 5. Optional ElevenLabs voice

Set these variables on **govfix-web** if enabling live voice:

- `ELEVENLABS_API_KEY`
- `GOVFIX_ELEVENLABS_AGENT_EN`, `GOVFIX_ELEVENLABS_AGENT_HI`, `GOVFIX_ELEVENLABS_AGENT_MR`
- `GOVFIX_ELEVENLABS_WEBHOOK_SECRET` for post-call transcripts (optional for starting voice)

Configure the signed ElevenLabs webhook to
`https://YOUR-WEB-HOST/v1/webhooks/elevenlabs`. Use private agents with signed-URL
authentication. Follow [voice access](./voice-access.md) for
agent provisioning, consent and verification. Text intake remains available when
voice credentials are absent. Voice credentials are never frontend build variables.

## Updates, monitoring and proxy configuration

Automatic deploys are disabled so migrations can run before a new release. For an
update: push the reviewed change, apply migrations locally with the administrator
connection, then manually deploy both services from the same commit. Use additive
migrations compatible with the previous release; a Render code rollback does not
roll back Supabase data/schema. When a referenced secret changes, sync the Blueprint
and redeploy both services so the worker receives the updated value. New secret
variables added later must be entered manually: `sync: false` only prompts during
initial Blueprint creation.

The web launcher disables native access logs and ignores forwarded headers by
default. Application request logs still contain safe request IDs, route templates,
status and duration. Until trusted Render proxy IP ranges are explicitly configured,
the login IP budget applies to the proxy address and is set to 300 attempts per
15 minutes; the per-account budget stays at 5. This can still throttle unrelated
users sharing the proxy. If configuring `FORWARDED_ALLOW_IPS`, use verified proxy
IPs/CIDRs, then restore your intended `GOVFIX_LOGIN_IP_LIMIT` (normally 30).
Wildcard proxy trust is rejected. See [Uvicorn proxy guidance](https://uvicorn.dev/deployment/).

Set external uptime checks for `/ready` and review the auditor operations status
for worker failures and notification backlogs. Process request counters reset on
restart; worker status is persisted in Supabase. See [observability](./observability.md).

## Local container smoke check

With Docker installed, build and run without loading your local administrator URI:

```sh
docker build -t govfix-render .
```

Pass only the web service's runtime variables to `docker run`, publish port 10000,
and check `/ready` and `/app/`. Use `python scripts/render_start.py worker` as the
container command to smoke-test the worker. Do not use your full local `.env` as
the container env file: it includes an administrator connection.
