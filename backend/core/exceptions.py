"""
core/exceptions.py

Custom DRF exception handler — normalises all error responses to:
  { "error": "<message>", "code": "<drf_code>", "detail": <original> }
"""

from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status


def cybot_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is None:
        # Unhandled exception — return 500
        return Response(
            {"error": "Internal server error", "code": "server_error"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # Normalise DRF error shape
    data = response.data

    if isinstance(data, dict) and "detail" in data:
        message = str(data["detail"])
        code = getattr(data["detail"], "code", "error")
        response.data = {"error": message, "code": code}
    elif isinstance(data, list):
        response.data = {"error": data[0] if data else "Validation error", "code": "invalid"}
    elif isinstance(data, dict):
        # Serializer field errors — flatten first error per field
        first_field = next(iter(data))
        first_msg = data[first_field]
        if isinstance(first_msg, list):
            first_msg = first_msg[0]
        response.data = {
            "error": f"{first_field}: {first_msg}",
            "code": "invalid",
            "fields": data,
        }

    return response
