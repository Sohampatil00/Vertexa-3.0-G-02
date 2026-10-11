"""Bounded image validation and private local storage for the demo deployment."""

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

    def path(self, key):
        # Object names are server-generated UUIDs. Never accept client paths.
        from uuid import UUID

        try:
            if str(UUID(key)) != key:
                raise ValueError()
        except (ValueError, TypeError) as exc:
            raise Refusal("EVIDENCE_UNAVAILABLE", "Evidence storage is unavailable.", 503) from exc
        return self.root / key

    def save(self, key, data):
        path = self.path(key)
        try:
            self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
        except OSError as exc:
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


def project_evidence(item):
    return {
        "id": item.id,
        "kind": item.kind,
        "sha256": item.sha256,
        "content_type": item.content_type,
        "size_bytes": item.size_bytes,
        "complete": item.complete,
    }
