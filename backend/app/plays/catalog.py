"""Play catalog — loaded from plays/*.yaml at startup via app.core.config.

To add a play: drop a new YAML file in backend/plays/ and restart.
The shape is validated by PlayConfig in app/core/config.py.
"""
from __future__ import annotations
from typing import Any

from app.core.config import config

PLAYS: list[dict[str, Any]] = [p.to_dict() for p in config.plays]


def get_play(play_id: str) -> dict | None:
    p = config.get_play(play_id)
    return p.to_dict() if p else None


def public_plays() -> list[dict]:
    """Strip backend-only fields (instructions, output_format) for the catalog API."""
    return [p.public_dict() for p in config.plays]
