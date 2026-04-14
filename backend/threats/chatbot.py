"""
threats/chatbot.py

CybotChatbot — wraps OpenAI GPT-4o with:
  - Cybersecurity-focused system prompt
  - Conversation history (last 5 exchanges from chat_logs)
  - Persists every exchange back to Supabase chat_logs
"""

import logging
from openai import OpenAI
from django.conf import settings
from core.supabase_client import get_supabase_admin

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are Cybot, an expert AI assistant specialising in cybersecurity, "
    "privacy, and ethical technology. You help users understand threats, analyse risks, "
    "recommend mitigations, and explain technical concepts clearly. "
    "Be concise, accurate, and prioritise actionable advice. "
    "Cite CVE numbers, MITRE ATT&CK tactics, and OWASP references where applicable. "
    "When you are unsure, say so — do not fabricate CVEs, attack details, or statistics."
)

MAX_HISTORY_PAIRS = 5  # 5 user + 5 assistant turns = 10 history messages


class CybotChatbot:
    def __init__(self):
        try:
            self.client = OpenAI(api_key=settings.OPENAI_API_KEY)
        except Exception as exc:
            logger.error("OpenAI client init failed: %s", exc)
            self.client = None

    # ------------------------------------------------------------------ #
    #  Public API                                                          #
    # ------------------------------------------------------------------ #

    def chat(self, user_id: str | None, message: str) -> str:
        """Send *message* for *user_id*, return assistant reply.

        Fetches recent history from DB, calls GPT-4o, persists both turns.
        """
        if not self.client:
            return "AI service is temporarily unavailable. Please try again later."

        history = self._load_history(user_id) if user_id else []
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        messages.extend(history)
        messages.append({"role": "user", "content": message})

        reply = self._call_gpt(messages)

        if user_id:
            self._persist(user_id, message, reply)

        return reply

    # ------------------------------------------------------------------ #
    #  Private helpers                                                     #
    # ------------------------------------------------------------------ #

    def _load_history(self, user_id: str) -> list[dict]:
        """Return last MAX_HISTORY_PAIRS exchanges as OpenAI message dicts."""
        client = get_supabase_admin()
        result = (
            client.table("chat_logs")
            .select("role, content")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(MAX_HISTORY_PAIRS * 2)
            .execute()
        )
        rows = result.data or []
        rows.reverse()  # newest-first → chronological
        return [{"role": r["role"], "content": r["content"]} for r in rows]

    def _call_gpt(self, messages: list[dict]) -> str:
        try:
            completion = self.client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                max_tokens=1024,
                temperature=0.3,
            )
            return (completion.choices[0].message.content or "").strip()
        except Exception as exc:
            logger.error("OpenAI API error: %s", exc)
            return "I'm experiencing technical difficulties. Please try again shortly."

    def _persist(self, user_id: str, user_message: str, assistant_reply: str) -> None:
        client = get_supabase_admin()
        rows = [
            {"user_id": user_id, "role": "user",      "content": user_message},
            {"user_id": user_id, "role": "assistant",  "content": assistant_reply},
        ]
        try:
            client.table("chat_logs").insert(rows).execute()
        except Exception as exc:
            logger.error("Failed to persist chat_logs for user %s: %s", user_id, exc)
