"""
linkguard/ai_analyzer.py

GPT-4o URL threat analyzer.
Reuses the OpenAI client pattern from threats/chatbot.py.
Results are cached in Redis for 6 hours.
"""

import hashlib
import json
import logging

from django.conf import settings
from django.core.cache import cache
from openai import OpenAI

logger = logging.getLogger(__name__)

CACHE_TTL = 21_600  # 6 hours

SYSTEM_PROMPT = (
    "You are a cybersecurity URL analyst. Analyze the given URL and context "
    "for phishing, malware, or social engineering indicators. "
    "Consider: brand impersonation, typosquatting, suspicious path patterns, "
    "and known attack vectors. "
    "Respond with valid JSON only — no markdown, no extra text."
)

USER_PROMPT_TEMPLATE = """Analyze this URL for security threats:
URL: {url}
Domain Age: {domain_age} days
SSL Valid: {ssl_valid}
Redirect Count: {redirect_count}
Google Safe Browsing: {gsb_result}

Return JSON only with exactly these keys:
{{"risk": "Safe|Suspicious|Dangerous", "confidence": <0-100 integer>, "reason": "<one sentence explanation>"}}"""


def analyze(
    url: str,
    *,
    domain_age: int | None = None,
    ssl_valid: bool | None = None,
    redirect_count: int = 0,
    gsb_result: str = "not_checked",
) -> dict:
    """Run GPT-4o analysis for *url* with supporting context.

    Returns a dict with:
        risk        (str)  – Safe | Suspicious | Dangerous
        confidence  (int)  – 0-100
        reason      (str)  – one-sentence explanation
        ai_score    (int)  – mapped score (0-100)
        cached      (bool)
    """
    url_hash = hashlib.sha256(url.encode()).hexdigest()
    cache_key = f"ai:{url_hash}"

    cached_result = cache.get(cache_key)
    if cached_result is not None:
        cached_result["cached"] = True
        return cached_result

    result = _call_gpt(
        url,
        domain_age=domain_age,
        ssl_valid=ssl_valid,
        redirect_count=redirect_count,
        gsb_result=gsb_result,
    )
    cache.set(cache_key, result, timeout=CACHE_TTL)
    return result


def _call_gpt(url: str, **context) -> dict:
    """Make the OpenAI API call and parse the JSON response."""
    api_key = getattr(settings, "OPENAI_API_KEY", "")
    ai_enabled = getattr(settings, "LINKGUARD_AI_ENABLED", True)

    if not api_key or not ai_enabled:
        logger.debug("AI analysis disabled or no OPENAI_API_KEY")
        return _fallback()

    client = OpenAI(api_key=api_key)

    prompt = USER_PROMPT_TEMPLATE.format(
        url=url,
        domain_age=context.get("domain_age") or "unknown",
        ssl_valid=context.get("ssl_valid"),
        redirect_count=context.get("redirect_count", 0),
        gsb_result=context.get("gsb_result", "not_checked"),
    )

    try:
        completion = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            max_tokens=256,
            temperature=0.1,
            response_format={"type": "json_object"},
        )
        raw = (completion.choices[0].message.content or "{}").strip()
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.warning("AI response parse error: %s", exc)
        return _fallback()
    except Exception as exc:
        logger.error("OpenAI API error in ai_analyzer: %s", exc)
        return _fallback()

    risk = data.get("risk", "Suspicious")
    confidence = int(data.get("confidence", 50))

    # Map confidence to ai_score
    if risk.lower() == "safe":
        ai_score = confidence
    else:
        ai_score = 100 - confidence

    return {
        "risk": risk,
        "confidence": confidence,
        "reason": data.get("reason", ""),
        "ai_score": max(0, min(100, ai_score)),
        "cached": False,
    }


def _fallback() -> dict:
    """Return a neutral result when AI is unavailable."""
    return {
        "risk": "Unknown",
        "confidence": 50,
        "reason": "AI analysis unavailable.",
        "ai_score": 50,
        "cached": False,
        "skipped": True,
    }
