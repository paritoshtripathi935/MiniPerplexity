"""Read-only Plays catalog endpoint.

Plays are templated prompts (creative briefs, channel plans, etc.) that
pre-load the LLM with marketing-domain instructions and an output schema.
The catalog is hand-curated in `app/plays/catalog.py` for V1.
"""
from fastapi import APIRouter, HTTPException

from app.plays import get_play, public_plays

router = APIRouter()


@router.get("/plays")
async def list_plays():
    return {"plays": public_plays()}


@router.get("/plays/{play_id}")
async def read_play(play_id: str):
    play = get_play(play_id)
    if play is None:
        raise HTTPException(status_code=404, detail="Play not found")
    # Public-shape only (no backend instructions/output_format).
    return {
        "id": play["id"],
        "title": play["title"],
        "category": play["category"],
        "description": play["description"],
        "icon": play.get("icon"),
        "inputs": play["inputs"],
    }
