"""Bounded image validation and private evidence storage."""

import hashlib
import io
import os
import warnings
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from govfix.errors import Refusal

CONTENT_TYPES = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}


def validate_image(data: bytes, content_type: str, expected_hash: str):
    if not data or hashlib.sha256(data).hexdigest() != expected_hash:
        raise Refusal("CHECKSUM_MISMATCH", "The uploaded bytes do not match the checksum.", 422)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                if CONTENT_TYPES.get(image.format) != content_type:
                    raise Refusal("INVALID_IMAGE", "Choose a PNG, JPEG, or WebP image.", 422)
                if image.width * image.height > 20_000_000 or image.n_frames != 1:
                    raise Refusal(
                        "INVALID_IMAGE", "Use a still image of at most 20 megapixels.", 422
                    )
                image.verify()
            with Image.open(io.BytesIO(data)) as image:
                image.load()  # Reject truncated files that only have a valid header.
    except (
        UnidentifiedImageError,
        OSError,
        SyntaxError,
        ValueError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as exc:
        raise Refusal("INVALID_IMAGE", "The image is invalid or too large to decode.", 422) from exc


class EvidenceStore:
    def __init__(self, settings):
        self.root = Path(settings.evidence_directory).resolve()
        self.max_bytes = settings.evidence_max_bytes
        if self.root.is_relative_to((Path(__file__).parent / "static").resolve()):
            raise ValueError("Evidence storage must be outside the public static directory")

    def path(self, key):
        # Object names are server-generated UUIDs. Never accept client paths.
        from uuid import UUID

        try:
            if str(UUID(key)) != key:
                raise ValueError()
        except (ValueError, TypeError) as exc:
            raise Refusal("EVIDENCE_UNAVAILABLE", "Evidence storage is unavailable.", 503) from exc
        return self.root / key

    def save(self, key, data, content_type=None):
        path = self.path(key)
        created = False
        try:
            self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            created = True
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
        except OSError as exc:
            if created:
                path.unlink(missing_ok=True)
            raise Refusal("EVIDENCE_UNAVAILABLE", "Evidence storage is unavailable.", 503) from exc

    def read(self, evidence):
        try:
            with self.path(evidence.object_key).open("rb") as stream:
                data = stream.read(self.max_bytes + 1)
        except OSError as exc:
            raise Refusal("EVIDENCE_UNAVAILABLE", "Evidence storage is unavailable.", 503) from exc
        if len(data) != evidence.size_bytes or hashlib.sha256(data).hexdigest() != evidence.sha256:
            raise Refusal("EVIDENCE_UNAVAILABLE", "Evidence integrity verification failed.", 503)
        return data

    def delete(self, key):
        self.path(key).unlink(missing_ok=True)


class SupabaseEvidenceStore:
    """Private Supabase Storage adapter using the server-only service role key."""

    def __init__(self, settings):
        if not settings.supabase_url or not settings.supabase_service_role_key:
            raise ValueError("Supabase URL and service role key are required for Supabase Storage")
        try:
            from supabase import create_client
        except ImportError as exc:
            raise RuntimeError("Install the supabase package to use Supabase Storage") from exc
        self.client = create_client(settings.supabase_url, settings.supabase_service_role_key)
        self.bucket = settings.supabase_storage_bucket
        self.max_bytes = settings.evidence_max_bytes

    def save(self, key, data, content_type=None):
        options = {"upsert": False}
        if content_type:
            options["content-type"] = content_type
        try:
            self.client.storage.from_(self.bucket).upload(key, data, options)
        except Exception as exc:
            raise Refusal("EVIDENCE_UNAVAILABLE", "Evidence storage is unavailable.", 503) from exc

    def read(self, evidence):
        try:
            data = self.client.storage.from_(self.bucket).download(evidence.object_key)
        except Exception as exc:
            raise Refusal("EVIDENCE_UNAVAILABLE", "Evidence storage is unavailable.", 503) from exc
        if (
            len(data) != evidence.size_bytes
            or hashlib.sha256(data).hexdigest() != evidence.sha256
        ):
            raise Refusal("EVIDENCE_UNAVAILABLE", "Evidence integrity verification failed.", 503)
        return data

    def delete(self, key):
        try:
            self.client.storage.from_(self.bucket).remove([key])
        except Exception as exc:
            raise Refusal("EVIDENCE_UNAVAILABLE", "Evidence storage is unavailable.", 503) from exc


def make_evidence_store(settings):
    if settings.supabase_service_role_key:
        return SupabaseEvidenceStore(settings)
    return EvidenceStore(settings)


def project_evidence(item):
    return {
        "id": item.id,
        "kind": item.kind,
        "sha256": item.sha256,
        "content_type": item.content_type,
        "size_bytes": item.size_bytes,
        "complete": item.complete,
    }
