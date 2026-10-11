# Demo pilot policy

The executable [demo policy](../config/policies/demo-pilot-v1.json) is a **fictional, unapproved configuration** for development. Its categories, wards, elapsed-hour SLAs, evidence rules, verification review window, and escalation recipients are illustrative. The name deliberately does not identify a real municipality.

Validate it with:

```sh
uv run python -m govfix.policy config/policies/demo-pilot-v1.json
uv run pytest tests/test_policy.py -q
```

The validator checks required fields, references, finite positive durations, ordered thresholds, the complete P0 transition graph, and role gates. It prints a canonical checksum. Phase 1 stores immutable demo policy versions and pins each case to its effective version. Production policy publication and approval remain open. Keep this file at `DEMO_ONLY` until a named policy owner has approved a separate, versioned pilot configuration.

## Sample cases for policy review

| Case | Ward | Category | Department | Required resolution evidence | Demo SLA |
|---|---|---|---|---|---|
| Road pothole near a bus stop | WARD-A | POTHOLE | PUBLIC_WORKS | AFTER_PHOTO | 72 elapsed hours |
| Missed collection on a residential street | WARD-B | MISSED_WASTE_COLLECTION | SANITATION | AFTER_PHOTO | 48 elapsed hours |

For both cases, a citizen must explicitly confirm submission. An intake officer validates the category, ward, jurisdiction, and department. An eligible officer owns the case after assignment. Closure requires resolution evidence and explicit citizen acceptance.

## Required pilot decisions

Before using a real municipality, assign and record the policy owner and approval for the categories, wards, routing, SLA durations, business calendar, escalation recipients, evidence rules, verification wait time, identity proof, retention, and cross-jurisdiction handling. These remain open in [decisions.md](./decisions.md). The validator does not imply that those decisions have been made.
