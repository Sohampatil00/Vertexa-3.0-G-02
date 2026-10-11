"""Load and validate versioned pilot policies without external dependencies."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


STATES = frozenset({
    "NEW", "SUBMITTED", "VALIDATED", "REJECTED", "ASSIGNED", "IN_PROGRESS",
    "RESOLUTION_SUBMITTED", "CITIZEN_VERIFICATION", "CLOSED", "DISPUTED",
    "SUPERVISOR_REVIEW",
})
REQUIRED_EDGES = frozenset({
    ("NEW", "SUBMITTED"), ("SUBMITTED", "VALIDATED"),
    ("SUBMITTED", "REJECTED"), ("VALIDATED", "ASSIGNED"),
    ("ASSIGNED", "IN_PROGRESS"), ("IN_PROGRESS", "RESOLUTION_SUBMITTED"),
    ("RESOLUTION_SUBMITTED", "CITIZEN_VERIFICATION"),
    ("CITIZEN_VERIFICATION", "CLOSED"),
    ("CITIZEN_VERIFICATION", "DISPUTED"),
    ("DISPUTED", "SUPERVISOR_REVIEW"),
    ("SUPERVISOR_REVIEW", "ASSIGNED"),
    ("SUPERVISOR_REVIEW", "IN_PROGRESS"),
})
REQUIRED_ROLES = frozenset({
    "CITIZEN", "INTAKE_OFFICER", "DISPATCHER", "OFFICER", "SUPERVISOR",
    "WARD_HEAD", "WORKFLOW_ENGINE", "AUDITOR",
})
EDGE_ROLES = {
    ("NEW", "SUBMITTED"): {"CITIZEN"},
    ("SUBMITTED", "VALIDATED"): {"INTAKE_OFFICER"},
    ("SUBMITTED", "REJECTED"): {"INTAKE_OFFICER"},
    ("VALIDATED", "ASSIGNED"): {"DISPATCHER", "SUPERVISOR"},
    ("ASSIGNED", "IN_PROGRESS"): {"OFFICER"},
    ("IN_PROGRESS", "RESOLUTION_SUBMITTED"): {"OFFICER"},
    ("RESOLUTION_SUBMITTED", "CITIZEN_VERIFICATION"): {"WORKFLOW_ENGINE"},
    ("CITIZEN_VERIFICATION", "CLOSED"): {"CITIZEN"},
    ("CITIZEN_VERIFICATION", "DISPUTED"): {"CITIZEN"},
    ("DISPUTED", "SUPERVISOR_REVIEW"): {"WORKFLOW_ENGINE"},
    ("SUPERVISOR_REVIEW", "ASSIGNED"): {"SUPERVISOR"},
    ("SUPERVISOR_REVIEW", "IN_PROGRESS"): {"SUPERVISOR"},
}


class PolicyError(ValueError):
    """The policy definition is incomplete or violates a workflow invariant."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise PolicyError(message)


def _unique_nonempty_strings(values: object, name: str) -> set[str]:
    _require(isinstance(values, list) and bool(values), f"{name} must be a nonempty list")
    _require(all(isinstance(value, str) and value.strip() == value and value for value in values),
             f"{name} must contain nonempty strings")
    _require(len(values) == len(set(values)), f"{name} contains duplicates")
    return set(values)


def _positive_number(value: object, name: str) -> None:
    _require(type(value) in (int, float) and value > 0, f"{name} must be positive")


def validate_policy(policy: object) -> dict:
    """Return a valid policy or raise PolicyError with the first invalid field."""
    _require(isinstance(policy, dict), "policy must be a JSON object")
    for name in ("version", "status", "municipality", "timezone", "calendar",
                 "wards", "departments", "roles", "categories", "thresholds",
                 "transitions", "rejection_reason_codes", "verification_review_after_hours"):
        _require(name in policy, f"missing {name}")
    _require(isinstance(policy["version"], str) and policy["version"].strip(), "version is required")
    _require(policy["status"] == "DEMO_ONLY", "unapproved policy must be DEMO_ONLY")
    _require(isinstance(policy["municipality"], str) and policy["municipality"].strip(),
             "municipality is required")
    try:
        ZoneInfo(policy["timezone"])
    except (TypeError, KeyError, ZoneInfoNotFoundError) as exc:
        raise PolicyError("timezone must be a valid IANA time zone") from exc
    _require(isinstance(policy["calendar"], dict) and
             policy["calendar"].get("basis") == "ELAPSED_HOURS",
             "demo calendar basis must be ELAPSED_HOURS")
    wards = _unique_nonempty_strings(policy["wards"], "wards")
    departments = _unique_nonempty_strings(policy["departments"], "departments")
    roles = _unique_nonempty_strings(policy["roles"], "roles")
    _require(roles == REQUIRED_ROLES, "roles must match the P0 workflow roles")
    _unique_nonempty_strings(policy["rejection_reason_codes"], "rejection_reason_codes")
    _positive_number(policy["verification_review_after_hours"], "verification_review_after_hours")
    _require(isinstance(policy["categories"], list) and bool(policy["categories"]),
             "categories must be a nonempty list")
    category_codes = set()
    for category in policy["categories"]:
        _require(isinstance(category, dict), "category must be an object")
        code = category.get("code")
        _require(isinstance(code, str) and bool(code), "category code is required")
        _require(code not in category_codes, f"duplicate category {code}")
        category_codes.add(code)
        _require(category.get("department") in departments,
                 f"category {code} refers to an unknown department")
        _positive_number(category.get("sla_hours"), f"category {code} sla_hours")
        _unique_nonempty_strings(category.get("resolution_evidence"),
                                 f"category {code} resolution_evidence")
    _require(isinstance(policy["thresholds"], list) and bool(policy["thresholds"]),
             "thresholds must be a nonempty list")
    threshold_keys = set()
    previous_percent = 0
    for threshold in policy["thresholds"]:
        _require(isinstance(threshold, dict), "threshold must be an object")
        key = threshold.get("key")
        _require(isinstance(key, str) and key and key not in threshold_keys,
                 "threshold keys must be unique nonempty strings")
        threshold_keys.add(key)
        percent = threshold.get("percent_of_sla")
        _positive_number(percent, f"threshold {key} percent_of_sla")
        _require(percent > previous_percent, "threshold percentages must increase")
        previous_percent = percent
        _require(threshold.get("recipient_role") in roles,
                 f"threshold {key} has an unknown recipient role")
    _require(threshold_keys == {"WARNING", "SUPERVISOR_ESCALATION", "WARD_HEAD_ESCALATION"},
             "required warning and escalation thresholds are missing")
    _require(isinstance(policy["transitions"], list), "transitions must be a list")
    edges = set()
    for transition in policy["transitions"]:
        _require(isinstance(transition, dict), "transition must be an object")
        edge = (transition.get("from"), transition.get("to"))
        _require(all(isinstance(state, str) and state in STATES for state in edge),
                 "transition contains an unknown state")
        _require(edge not in edges, f"duplicate transition {edge}")
        edges.add(edge)
        _require(edge in EDGE_ROLES, f"transition {edge} is not in the P0 graph")
        actual_roles = _unique_nonempty_strings(transition.get("roles"), f"transition {edge} roles")
        _require(actual_roles == EDGE_ROLES[edge], f"transition {edge} has incorrect roles")
    _require(edges == REQUIRED_EDGES, "transitions must contain the complete P0 graph")
    _require(bool(wards), "at least one ward is required")
    return policy


def load_policy(path: str | Path) -> tuple[dict, str]:
    """Validate a JSON policy and return it with a canonical SHA-256 checksum."""
    try:
        policy = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PolicyError(f"cannot read policy: {exc}") from exc
    validate_policy(policy)
    canonical = json.dumps(policy, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return policy, hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate a GovFix pilot policy")
    parser.add_argument("path", type=Path)
    args = parser.parse_args()
    try:
        policy, checksum = load_policy(args.path)
    except PolicyError as exc:
        parser.exit(1, f"Invalid policy: {exc}\n")
    print(f"Valid {policy['status']} policy {policy['version']}\nSHA-256: {checksum}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
