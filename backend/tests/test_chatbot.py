"""
tests/test_chatbot.py — Unit tests for CybotChatbot and ChatbotView

OpenAI API and Supabase calls are fully mocked.
"""

import uuid
import pytest
from unittest.mock import MagicMock, patch, call
from rest_framework.test import APIRequestFactory

from threats.views import ChatbotView
from threats.chatbot import CybotChatbot


USER_ID = str(uuid.uuid4())


def _make_request(factory, method, path, data=None, user_id=USER_ID):
    fn = getattr(factory, method)
    req = fn(path, data=data, format="json") if data is not None else fn(path)
    req.supabase_user_id = user_id
    req.user = MagicMock(is_authenticated=True)
    return req


def _mock_openai_client(reply_text="Test reply"):
    """Build a mock OpenAI client that returns *reply_text*."""
    msg    = MagicMock()
    msg.content = reply_text

    choice = MagicMock()
    choice.message = msg

    completion = MagicMock()
    completion.choices = [choice]

    client = MagicMock()
    client.chat.completions.create.return_value = completion
    return client


def _mock_supabase(history_rows=None):
    mock_result = MagicMock()
    mock_result.data = history_rows or []

    chain = MagicMock()
    chain.execute.return_value = mock_result
    for m in ("select", "eq", "order", "limit", "insert"):
        getattr(chain, m).return_value = chain

    mock_client = MagicMock()
    mock_client.table.return_value = chain
    return mock_client


# ─── CybotChatbot unit tests ─────────────────────────────────────────────────

class TestCybotChatbot:

    def test_chat_returns_reply(self):
        bot = CybotChatbot()
        bot.client = _mock_openai_client("Here is cybersecurity advice.")

        with patch("threats.chatbot.get_supabase_admin", return_value=_mock_supabase()):
            reply = bot.chat(user_id=USER_ID, message="What is a phishing attack?")

        assert reply == "Here is cybersecurity advice."

    def test_history_prepended_to_messages(self):
        history_rows = [
            {"role": "user",      "content": "Previous question"},
            {"role": "assistant", "content": "Previous answer"},
        ]
        bot = CybotChatbot()
        mock_client = _mock_openai_client("New reply")
        bot.client = mock_client

        with patch("threats.chatbot.get_supabase_admin", return_value=_mock_supabase(history_rows)):
            bot.chat(user_id=USER_ID, message="New question")

        call_args   = mock_client.chat.completions.create.call_args
        messages    = call_args.kwargs["messages"]
        roles       = [m["role"] for m in messages]
        # system + 2 history + new user
        assert roles == ["system", "user", "assistant", "user"]
        assert messages[-1]["content"] == "New question"

    def test_persists_both_turns(self):
        bot = CybotChatbot()
        bot.client = _mock_openai_client("reply")
        mock_sb = _mock_supabase()

        with patch("threats.chatbot.get_supabase_admin", return_value=mock_sb):
            bot.chat(user_id=USER_ID, message="hi")

        # insert should have been called with 2 rows
        insert_call = mock_sb.table.return_value.insert.call_args
        rows = insert_call.args[0]
        assert len(rows) == 2
        assert rows[0]["role"] == "user"
        assert rows[1]["role"] == "assistant"

    def test_openai_error_returns_fallback_message(self):
        bot = CybotChatbot()
        bot.client = MagicMock()
        bot.client.chat.completions.create.side_effect = Exception("API down")

        with patch("threats.chatbot.get_supabase_admin", return_value=_mock_supabase()):
            reply = bot.chat(user_id=USER_ID, message="help")

        assert "technical difficulties" in reply.lower()

    def test_no_client_returns_unavailable_message(self):
        bot = CybotChatbot()
        bot.client = None
        reply = bot.chat(user_id=USER_ID, message="hello")
        assert "unavailable" in reply.lower()


# ─── ChatbotView tests ────────────────────────────────────────────────────────

class TestChatbotView:
    factory = APIRequestFactory()
    view    = ChatbotView.as_view()

    def test_missing_message_returns_400(self):
        req  = _make_request(self.factory, "post", "/api/v1/threats/chat/", data={})
        resp = self.view(req)
        assert resp.status_code == 400

    def test_empty_message_returns_400(self):
        req  = _make_request(self.factory, "post", "/api/v1/threats/chat/", data={"message": "  "})
        resp = self.view(req)
        assert resp.status_code == 400

    def test_valid_message_returns_reply(self):
        mock_bot = MagicMock()
        mock_bot.chat.return_value = "Stay safe!"

        with patch("threats.views.CybotChatbot", return_value=mock_bot):
            req  = _make_request(
                self.factory, "post", "/api/v1/threats/chat/",
                data={"message": "How do I protect my accounts?"},
            )
            resp = self.view(req)

        assert resp.status_code == 200
        assert resp.data["reply"] == "Stay safe!"
        mock_bot.chat.assert_called_once_with(user_id=USER_ID, message="How do I protect my accounts?")
