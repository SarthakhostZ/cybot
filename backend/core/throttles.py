"""
core/throttles.py

Custom DRF throttle classes for the Cybot API.
"""

from rest_framework.throttling import UserRateThrottle


class ChatMinuteThrottle(UserRateThrottle):
    """Max 20 chat messages per minute per user — prevents burst abuse."""
    scope = "chat"

    def get_cache_key(self, request, view):
        user_id = getattr(request, "supabase_user_id", None)
        if not user_id:
            return None
        return self.cache_format % {
            "scope": self.scope,
            "ident": user_id,
        }


class ChatDayThrottle(UserRateThrottle):
    """Max 200 chat messages per day per user — hard daily cost cap."""
    scope = "chat_day"

    def get_cache_key(self, request, view):
        user_id = getattr(request, "supabase_user_id", None)
        if not user_id:
            return None
        return self.cache_format % {
            "scope": self.scope,
            "ident": user_id,
        }
