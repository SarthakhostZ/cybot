"""
core/pagination.py

Supabase-compatible offset pagination for all list endpoints.
Supabase uses .range(from, to) — this wrapper translates page/per_page params.
"""

from django.conf import settings


class SupabasePagination:
    """Offset-based pagination for Supabase PostgREST queries.

    Query params:
        page     – 1-based page number (default 1)
        per_page – items per page (default 20, max 100)

    Usage:
        pag = SupabasePagination(request)
        query = pag.apply(client.table("threat_alerts").select("*"))
        result = query.execute()
        return Response(pag.wrap(result.data, count=result.count))
    """

    DEFAULT_LIMIT = 20
    MAX_LIMIT     = 100

    def __init__(self, request):
        try:
            self.page = max(1, int(request.query_params.get("page", 1)))
        except (ValueError, TypeError):
            self.page = 1

        try:
            self.limit = min(
                max(1, int(request.query_params.get("per_page", self.DEFAULT_LIMIT))),
                self.MAX_LIMIT,
            )
        except (ValueError, TypeError):
            self.limit = self.DEFAULT_LIMIT

        self.offset = (self.page - 1) * self.limit

    def apply(self, query):
        """Apply range() to a Supabase query builder."""
        return query.range(self.offset, self.offset + self.limit - 1)

    def wrap(self, data: list, count: int | None = None) -> dict:
        """Wrap a list result in a paginated envelope."""
        return {
            "data": data,
            "meta": {
                "page":     self.page,
                "per_page": self.limit,
                "total":    count,
                "has_next": len(data) == self.limit,
                "offset":   self.offset,
            },
        }
