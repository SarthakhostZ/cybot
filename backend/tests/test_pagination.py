"""
tests/test_pagination.py — SupabasePagination edge-case tests
"""

import pytest
from unittest.mock import MagicMock
from rest_framework.test import APIRequestFactory

from core.pagination import SupabasePagination


def _request(factory, page=None, per_page=None):
    params = {}
    if page is not None:
        params["page"] = page
    if per_page is not None:
        params["per_page"] = per_page
    req = factory.get("/api/v1/threats/", params)
    return req


class TestSupabasePagination:
    factory = APIRequestFactory()

    def test_defaults(self):
        req = _request(self.factory)
        pag = SupabasePagination(req)
        assert pag.page    == 1
        assert pag.limit   == 20
        assert pag.offset  == 0

    def test_page_two(self):
        req = _request(self.factory, page=2)
        pag = SupabasePagination(req)
        assert pag.offset == 20

    def test_custom_per_page(self):
        req = _request(self.factory, per_page=50)
        pag = SupabasePagination(req)
        assert pag.limit  == 50
        assert pag.offset == 0

    def test_max_per_page_capped_at_100(self):
        req = _request(self.factory, per_page=500)
        pag = SupabasePagination(req)
        assert pag.limit == 100

    def test_zero_per_page_defaults_to_one(self):
        req = _request(self.factory, per_page=0)
        pag = SupabasePagination(req)
        assert pag.limit == 1

    def test_negative_page_clamped_to_one(self):
        req = _request(self.factory, page=-5)
        pag = SupabasePagination(req)
        assert pag.page   == 1
        assert pag.offset == 0

    def test_non_numeric_page_defaults_to_1(self):
        req = _request(self.factory, page="abc")
        pag = SupabasePagination(req)
        assert pag.page == 1

    def test_non_numeric_per_page_defaults_to_20(self):
        req = _request(self.factory, per_page="lots")
        pag = SupabasePagination(req)
        assert pag.limit == 20

    def test_apply_calls_range(self):
        req   = _request(self.factory, page=3, per_page=10)
        pag   = SupabasePagination(req)   # offset=20, limit=10
        chain = MagicMock()
        chain.range.return_value = chain
        pag.apply(chain)
        chain.range.assert_called_once_with(20, 29)  # [20..29]

    def test_wrap_has_next_true_when_full_page(self):
        req  = _request(self.factory, per_page=5)
        pag  = SupabasePagination(req)
        meta = pag.wrap([1, 2, 3, 4, 5], count=100)["meta"]
        assert meta["has_next"] is True

    def test_wrap_has_next_false_when_partial_page(self):
        req  = _request(self.factory, per_page=5)
        pag  = SupabasePagination(req)
        meta = pag.wrap([1, 2, 3], count=3)["meta"]
        assert meta["has_next"] is False

    def test_wrap_contains_all_meta_keys(self):
        req  = _request(self.factory)
        pag  = SupabasePagination(req)
        result = pag.wrap([], count=0)
        assert set(result.keys()) == {"data", "meta"}
        assert set(result["meta"].keys()) == {"page", "per_page", "total", "has_next", "offset"}

    def test_offset_correct_for_page_and_limit(self):
        req = _request(self.factory, page=5, per_page=15)
        pag = SupabasePagination(req)
        assert pag.offset == 60   # (5-1) * 15
