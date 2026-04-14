"""
users/permissions.py

Custom DRF permission classes for Supabase-JWT-authenticated requests.

Usage:
    from users.permissions import IsAdmin, IsAnalyst, IsOwner

    class SomeView(APIView):
        permission_classes = [IsAdmin]
"""

import logging
from functools import lru_cache
from rest_framework.permissions import BasePermission
from core.supabase_client import get_supabase_admin

logger = logging.getLogger(__name__)

_ROLE_CACHE_ATTR = "_cached_cybot_role"


def _get_user_role(user_id: str) -> str:
    """Fetch the user's role from profiles. Result cached on the request object."""
    try:
        result = (
            get_supabase_admin()
            .table("profiles")
            .select("role")
            .eq("id", user_id)
            .single()
            .execute()
        )
        return result.data.get("role", "user") if result.data else "user"
    except Exception as exc:
        logger.error("Could not fetch role for user %s: %s", user_id, exc)
        return "user"


def get_cached_role(request) -> str:
    """Return the user's role, fetching from Supabase at most once per request."""
    if hasattr(request, _ROLE_CACHE_ATTR):
        return getattr(request, _ROLE_CACHE_ATTR)

    user_id = getattr(request, "supabase_user_id", None)
    if not user_id:
        return "anon"

    role = _get_user_role(user_id)
    setattr(request, _ROLE_CACHE_ATTR, role)
    return role


# ─── Permission classes ───────────────────────────────────────────────────────

class IsAuthenticated(BasePermission):
    """User must have a valid Supabase JWT (any role)."""

    message = "Authentication credentials were not provided or are invalid."

    def has_permission(self, request, view):
        return bool(getattr(request, "supabase_user_id", None))


class IsAdmin(BasePermission):
    """User must have the 'admin' role in the profiles table."""

    message = "Admin access required."

    def has_permission(self, request, view):
        if not getattr(request, "supabase_user_id", None):
            return False
        return get_cached_role(request) == "admin"


class IsAnalyst(BasePermission):
    """User must have 'analyst' or 'admin' role."""

    message = "Analyst or admin access required."

    def has_permission(self, request, view):
        if not getattr(request, "supabase_user_id", None):
            return False
        return get_cached_role(request) in ("analyst", "admin")


class IsOwner(BasePermission):
    """Object-level permission: user may only access resources they own.

    The view's object must expose a `user_id` or `submitter` attribute.
    """

    message = "You do not have permission to access this resource."

    def has_permission(self, request, view):
        return bool(getattr(request, "supabase_user_id", None))

    def has_object_permission(self, request, view, obj):
        user_id = getattr(request, "supabase_user_id", None)
        if not user_id:
            return False
        # Support dict (Supabase response) or object attribute
        if isinstance(obj, dict):
            return obj.get("user_id") == user_id or obj.get("submitter") == user_id
        return (
            getattr(obj, "user_id", None) == user_id
            or getattr(obj, "submitter", None) == user_id
        )


class IsServiceRole(BasePermission):
    """Request came from an internal Edge Function via the service key."""

    message = "Service role access required."

    def has_permission(self, request, view):
        return getattr(request, "supabase_role", "") == "service_role"
