"""
core/supabase_client.py

Provides a reusable Supabase admin client (service_role).
Use get_supabase_admin() everywhere you need server-side Supabase access
(bypasses Row Level Security for trusted server operations).
"""

from functools import lru_cache
from django.conf import settings
from supabase import create_client, Client


@lru_cache(maxsize=1)
def get_supabase_admin() -> Client:
    """Return a singleton Supabase client using the service_role key.

    The service_role key bypasses RLS — only use this in trusted server code,
    never expose it to clients.
    """
    return create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_SERVICE_ROLE_KEY,
    )


@lru_cache(maxsize=1)
def get_supabase_anon() -> Client:
    """Return a singleton Supabase client using the anon key.

    Use for operations that should respect RLS as an anonymous user.
    """
    return create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_ANON_KEY,
    )
