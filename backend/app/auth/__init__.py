"""Auth package — Clerk JWT verification and FastAPI dependencies."""

from app.auth.dependencies import get_current_user, get_optional_user

__all__ = ["get_current_user", "get_optional_user"]
