"""Shared, atomic login budgets. Never store passwords, account names, or addresses."""

import hashlib
import hmac
import math
from datetime import timedelta

from sqlalchemy import case
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from govfix.database import as_utc, utcnow, write_transaction
from govfix.errors import Refusal
from govfix.models import LoginBudget


def reserve_login(sessions, settings, address, username, *, now=None):
    now = as_utc(now or utcnow())
    deadline = now + timedelta(seconds=settings.login_window_seconds)
    budgets = (
        ("ip", address, settings.login_ip_limit),
        ("account", username.strip().casefold(), settings.login_account_limit),
    )
    blocked_until = None
    with write_transaction(sessions) as session:
        insert = pg_insert if session.get_bind().dialect.name == "postgresql" else sqlite_insert
        for kind, value, limit in budgets:
            key = hmac.new(
                settings.login_rate_secret.encode(), f"{kind}:{value}".encode(), hashlib.sha256
            ).hexdigest()
            expired = LoginBudget.expires_at <= now
            statement = insert(LoginBudget).values(key=key, attempts=1, expires_at=deadline)
            statement = statement.on_conflict_do_update(
                index_elements=[LoginBudget.key],
                set_={
                    "attempts": case(
                        (expired, 1),
                        (LoginBudget.attempts <= limit, LoginBudget.attempts + 1),
                        else_=limit + 1,
                    ),
                    "expires_at": case((expired, deadline), else_=LoginBudget.expires_at),
                },
            ).returning(LoginBudget.attempts, LoginBudget.expires_at)
            count, expires = session.execute(statement).one()
            if count > limit:
                blocked_until = as_utc(expires)
                # Do not allocate unbounded account buckets after an IP is blocked.
                break
    if blocked_until:
        raise Refusal(
            "LOGIN_RATE_LIMITED",
            "Too many sign-in attempts. Try again later.",
            429,
            retry_after=max(1, math.ceil((blocked_until - now).total_seconds())),
        )
