"""Shared command header requirements for case changes and evidence uploads."""

import re

from govfix.errors import Refusal


def require_key(key: str | None):
    if not key or not key.strip() or len(key) > 200:
        raise Refusal("IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key is required.", 400)


def require_version(value: str | None, version: int):
    if value is None or not re.fullmatch(r'(?:[1-9][0-9]{0,18}|"[1-9][0-9]{0,18}")', value):
        raise Refusal("CASE_VERSION_REQUIRED", "If-Match must contain the case version.", 400)
    if int(value.strip('"')) != version:
        raise Refusal("STALE_CASE_VERSION", "The case has changed. Reload and try again.", 409)
