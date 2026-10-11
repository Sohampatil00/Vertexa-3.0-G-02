# Four role dashboards

The application selects a dedicated dashboard after login using the role grants
returned by `/v1/me`. Accounts with multiple dashboard roles have a **Switch
dashboard** selector. All dashboards use the existing authenticated API and share
the proven case detail/forms; navigation and landing summaries are role-specific.

| Dashboard | Roles | Navigation and summaries |
|---|---|---|
| Citizen | `CITIZEN` | Personal reports, open cases, resolutions ready for review and closed grievances; submission, voice and notifications |
| Officer | `OFFICER` | Owned assignments by default, acceptance queue, work in progress, overdue assignments and citizen verification |
| Supervisor / Operations | `INTAKE_OFFICER`, `DISPATCHER`, `SUPERVISOR`, `WARD_HEAD` | Scoped case oversight; validation/assignment queues appropriate to grants, overdue cases, disputes and unanswered verification |
| Auditor | `AUDITOR` | Read-only case audit register, SLA exceptions, closed case audits, policy reference and deployment readiness |

## Permission and data boundaries

- Dashboard selection does not grant roles. Case commands still use server-issued
  allowed actions and the existing transactional role/ownership checks.
- Citizen queues and summary counts use `mine=true`, even for an account that also
  has staff roles, so the personal dashboard excludes other citizens' reports.
- Officer summary and queue filters use `owned=true` by default. Turning off **My
  assignments only** shows the officer's existing readable scope and adjusts counts.
- `overdue=true` filters active cases by their current deadline before pagination.
  Terminal cases are excluded. All filters retain the API's visibility constraints.
- The auditor view hides mutation forms, uploads and delivery-retry actions,
  including when the account also has a supervisory role. Backend grants remain
  authoritative; this view does not revoke the account's other roles.
- Policy reference describes the current intake policy; individual cases retain
  their pinned policy and show its version in their details.
- System readiness is restricted to auditors. It reports deployment-wide worker,
  database and delivery status, clearly separate from scoped case audit counts.
- The interface displays actual API data; no synthetic charts or mock totals.

## Accounts for the demonstration

Existing `pilot-citizen` and `pilot-auditor` accounts open their corresponding
dashboards automatically. Provision officer and supervisor accounts from your
trusted administrator machine if they do not exist:

```sh
set -a
source .env
set +a
uv run govfix create-user pilot-officer --name "Pilot Officer" --role OFFICER --ward WARD-A --department PUBLIC_WORKS
uv run govfix create-user pilot-supervisor --name "Pilot Supervisor" --role SUPERVISOR --ward WARD-A
```

Enter passwords interactively, 12–128 characters. The local migration/administrator
URI is required for account provisioning; do not add it to Render. A supervisor can
assign and review cases but cannot validate an intake case without an intake grant.
Provision an `INTAKE_OFFICER` account for the validation step of a full workflow demo.

## Deploy and verify

No schema migration is required for this dashboard update. Commit/push the frontend
and API changes together, then manually deploy the latest commit in Render. Its
Docker build creates the frontend assets automatically. Login with each role and
check queues, summaries, notifications and case details. Keep the local worker
running for SLA and notification processing on the free deployment.

Verification commands:

```sh
npm run build --prefix web
uv run pytest -q
uv run python scripts/test_browser.py
```

The browser exercise covers all four dashboard headings/navigation, owned queues,
unanswered verification, switching a multi-role account, read-only auditing,
policy/system views, mobile overflow and the full case workflow. It runs against an
isolated temporary database and does not modify production accounts or cases.
