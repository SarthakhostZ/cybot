"""
core/storage_utils.py

Server-side Supabase Storage helpers.
Used by Django views that need to generate signed URLs or validate uploads
without exposing the service-role key to the client.
"""

import logging
from django.conf import settings
from core.supabase_client import get_supabase_admin

logger = logging.getLogger(__name__)

ALLOWED_REPORT_MIME = {
    "application/pdf",
    "application/json",
    "text/plain",
}

ALLOWED_AVATAR_MIME = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
}

MAX_AVATAR_BYTES  = 5   * 1024 * 1024   #  5 MB
MAX_REPORT_BYTES  = 50  * 1024 * 1024   # 50 MB
MAX_MODEL_BYTES   = 500 * 1024 * 1024   # 500 MB


def signed_report_url(path: str, expires_in: int = 3600) -> str:
    """Generate a signed URL for a private threat report.

    Args:
        path:       Storage path, e.g. "{user_id}/1234567890_report.pdf"
        expires_in: Seconds until the URL expires (default 1 hour)

    Returns:
        Signed URL string.
    """
    client = get_supabase_admin()
    result = client.storage.from_("threat-reports").create_signed_url(path, expires_in)
    # storage3 >=0.7.0 returns a CreateSignedURLResponse dataclass; older versions
    # returned a plain dict with "signedURL". Handle both shapes.
    if hasattr(result, "signed_url"):
        return result.signed_url
    if isinstance(result, dict):
        if result.get("error"):
            raise RuntimeError(f"Failed to generate signed URL: {result['error']}")
        return result.get("signedURL") or result.get("signed_url", "")
    raise RuntimeError("Unexpected response from create_signed_url")


def list_user_reports(user_id: str) -> list[dict]:
    """Return a list of threat report objects for a user.

    Each dict has: name, id, updated_at, created_at, last_accessed_at,
    metadata (includes size, mimetype).
    """
    import dataclasses

    client = get_supabase_admin()
    result = client.storage.from_("threat-reports").list(
        path=user_id,
        options={"sortBy": {"column": "created_at", "order": "desc"}},
    )
    if isinstance(result, list):
        # storage3 >=0.7.0 returns List[FileObject] dataclasses; convert to dicts
        # so DRF's JSONRenderer can serialise them.
        converted = []
        for item in result:
            if dataclasses.is_dataclass(item) and not isinstance(item, type):
                converted.append(dataclasses.asdict(item))
            elif isinstance(item, dict):
                converted.append(item)
            else:
                converted.append(vars(item))
        return converted
    if isinstance(result, dict):
        if result.get("error"):
            raise RuntimeError(f"Failed to list reports: {result['error']}")
        return result.get("data", [])
    return []


def delete_report(path: str) -> None:
    """Delete a specific threat report from storage."""
    client = get_supabase_admin()
    result = client.storage.from_("threat-reports").remove([path])
    if isinstance(result, dict) and result.get("error"):
        raise RuntimeError(f"Failed to delete report: {result['error']}")


def upload_ml_model(file_bytes: bytes, model_name: str, mime_type: str = "application/octet-stream") -> str:
    """Upload a trained ML model to the ml-models bucket.

    Returns the storage path of the uploaded model.
    Only callable with service_role (admin context on Django side).
    """
    if len(file_bytes) > MAX_MODEL_BYTES:
        raise ValueError(f"Model file exceeds 500 MB limit ({len(file_bytes) / 1e6:.1f} MB)")

    path = f"models/{model_name}"
    client = get_supabase_admin()
    result = client.storage.from_("ml-models").upload(
        path=path,
        file=file_bytes,
        file_options={"content-type": mime_type, "upsert": "true"},
    )
    if isinstance(result, dict) and result.get("error"):
        raise RuntimeError(f"Failed to upload model: {result['error']}")
    return path


def signed_model_url(model_name: str, expires_in: int = 300) -> str:
    """Generate a short-lived signed URL for an ML model download.

    Used by AWS Lambda to pull the latest model from Supabase Storage.
    """
    path = f"models/{model_name}"
    client = get_supabase_admin()
    result = client.storage.from_("ml-models").create_signed_url(path, expires_in)
    # storage3 >=0.7.0 returns a CreateSignedURLResponse dataclass.
    if hasattr(result, "signed_url"):
        return result.signed_url
    if isinstance(result, dict):
        if result.get("error"):
            raise RuntimeError(f"Failed to generate model URL: {result['error']}")
        return result.get("signedURL") or result.get("signed_url", "")
    raise RuntimeError("Unexpected response from create_signed_url")
