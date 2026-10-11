"""Local account authentication with Argon2 hashes and revocable opaque sessions."""

import hashlib
import secrets
from dataclasses import dataclass
from datetime import timedelta

from pwdlib import PasswordHash
from sqlalchemy import select

from govfix.database import as_utc, utcnow, write_transaction
from govfix.errors import Refusal
from govfix.models import AuthSession, RoleGrant, User

password_hasher = PasswordHash.recommended()
DUMMY_HASH = password_hasher.hash(secrets.token_urlsafe(24))


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@dataclass(frozen=True)
class Grant:
    role: str
    ward: str | None
    department: str | None


@dataclass(frozen=True)
class Actor:
    id: str
    username: str
    display_name: str
    identity_verified: bool
    grants: tuple[Grant, ...]

    @property
    def recorded_role(self) -> str:
        if len(self.grants) == 1:
            return self.grants[0].role
        return "MULTIPLE_ROLES" if self.grants else "NO_ROLE"

    def has_role(self, role: str, case=None) -> bool:
        return any(
            grant.role == role
            and (
                role == "CITIZEN"
                or case is None
                or (
                    grant.ward == case.ward
                    and (grant.department is None or grant.department == case.department)
                )
            )
            for grant in self.grants
        )


def load_actor(session, user_id: str, *, lock: bool = False) -> Actor:
    query = select(User).where(User.id == user_id)
    if lock:
        # Serialize commands without blocking foreign-key KEY SHARE checks during delivery.
        query = query.with_for_update(key_share=True)
    user = session.scalar(query)
    if user is None or not user.active:
        raise Refusal("UNAUTHENTICATED", "Authentication is required.", 401)
    grants = session.scalars(select(RoleGrant).where(RoleGrant.user_id == user.id)).all()
    return Actor(
        user.id,
        user.username,
        user.display_name,
        user.identity_verified,
        tuple(Grant(grant.role, grant.ward, grant.department) for grant in grants),
    )


def authenticate(session, token: str | None) -> Actor:
    auth_session = session.get(AuthSession, token_hash(token)) if token else None
    if auth_session is None or auth_session.revoked or as_utc(auth_session.expires_at) <= utcnow():
        raise Refusal("UNAUTHENTICATED", "Authentication is required.", 401)
    return load_actor(session, auth_session.user_id)


def login(sessions, username: str, password: str, duration_minutes: int) -> dict:
    with sessions() as session:
        user = session.scalar(select(User).where(User.username == username))
        user_id = user.id if user else None
        stored_hash = user.password_hash if user else DUMMY_HASH
    valid = password_hasher.verify(password, stored_hash)
    if not valid or user_id is None:
        raise Refusal("INVALID_CREDENTIALS", "Username or password is incorrect.", 401)
    with write_transaction(sessions) as session:
        user = session.scalar(select(User).where(User.id == user_id).with_for_update())
        if user is None or not user.active or user.password_hash != stored_hash:
            raise Refusal("INVALID_CREDENTIALS", "Username or password is incorrect.", 401)
        token = secrets.token_urlsafe(32)
        expires_at = utcnow() + timedelta(minutes=duration_minutes)
        session.add(
            AuthSession(token_hash=token_hash(token), user_id=user.id, expires_at=expires_at)
        )
    return {"access_token": token, "token_type": "bearer", "expires_at": expires_at.isoformat()}


def login_supabase(sessions, settings, email: str, password: str) -> dict:
    """Exchange a verified provider identity for a revocable GovFix session.

    Provider metadata never creates roles or marks municipal identity as verified.
    Each login has its own stateless provider client.
    """
    from supabase import ClientOptions, create_client
    from supabase_auth.errors import AuthApiError

    try:
        client = create_client(
            settings.supabase_url,
            settings.supabase_anon_key,
            options=ClientOptions(persist_session=False, auto_refresh_token=False),
        )
        response = client.auth.sign_in_with_password({"email": email, "password": password})
        if not response.session:
            raise Refusal("INVALID_CREDENTIALS", "Username or password is incorrect.", 401)
        verified = client.auth.get_user(response.session.access_token)
        user_id = verified.user.id if verified.user else None
    except AuthApiError as exc:
        if exc.status in (400, 401, 403, 422):
            raise Refusal("INVALID_CREDENTIALS", "Username or password is incorrect.", 401) from exc
        raise Refusal("AUTH_UNAVAILABLE", "Sign-in is temporarily unavailable.", 503) from exc
    except Refusal:
        raise
    except Exception as exc:
        raise Refusal("AUTH_UNAVAILABLE", "Sign-in is temporarily unavailable.", 503) from exc
    with write_transaction(sessions) as session:
        if not user_id:
            raise Refusal("INVALID_CREDENTIALS", "Username or password is incorrect.", 401)
        load_actor(session, user_id, lock=True)
        token = secrets.token_urlsafe(32)
        expires_at = utcnow() + timedelta(minutes=settings.session_minutes)
        session.add(
            AuthSession(token_hash=token_hash(token), user_id=user_id, expires_at=expires_at)
        )
    return {"access_token": token, "token_type": "bearer", "expires_at": expires_at.isoformat()}
