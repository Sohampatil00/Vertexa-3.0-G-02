# GovFix documentation

The [root README](../README.md) introduces the project. The [PRD](../prd.md) is the product scope and acceptance baseline. The original [concept memo](../info.md) is supporting research and an idea backlog. If these documents conflict, follow the PRD, then the detailed specifications here; record any scope change in [decisions.md](./decisions.md).

## Reading order

1. [Product requirements](../prd.md) — why and what to build.
2. [Roadmap](./roadmap.md) and [implementation tracker](./implemented.md) — sequence and actual progress.
   [Backend setup](./backend.md) — run the current implementation and execute its tests.
3. [Workflow](./workflow.md) — states, permissions, SLA, and escalation.
4. [Architecture](./architecture.md), [database](./database.md), and [API](./api.md) — proposed design contracts.
5. [Security and privacy](./security-privacy.md) and [validation](./validation.md) — safeguards and release checks.
6. [Decisions](./decisions.md) — accepted choices, proposals, and questions needing an owner.

## Document rules

- **Planned** means specified but not implemented. The [implementation tracker](./implemented.md) is the only source for what has been built and verified.
- Architecture and schemas are **proposals**, not claims about existing code.
- Product policy values such as category SLAs, calendars, identity proof, retention, and appeal windows need municipal approval before production use.
- Keep acceptance criteria, API contracts, and tests aligned when a workflow rule changes. Version policy changes so existing cases retain their effective rules.
- Source statistics and vendor capabilities are cited in the [PRD](../prd.md). The broken Swachhata FAQ link does not establish an official SLA.

[SLA operations](./sla-operations.md) explains the Phase 3 worker, extensions, in-app delivery, and failure recovery.

[Citizen verification](./citizen-verification.md) explains Phase 4 acceptance, disputes, supervised rework, and unanswered verification alerts.

Phase 5 setup and safeguards: [Voice access](./voice-access.md).

[Render deployment](./render-deployment.md) covers the Docker image, web/worker
Blueprint, Supabase secrets and deployment verification.

[Four role dashboards](./dashboards.md) covers navigation, queue scopes, read-only
auditing, demo accounts and deployment of the dashboard update.
