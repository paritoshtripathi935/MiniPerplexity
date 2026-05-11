"""Read-only Plays catalog endpoint.

Plays are templated prompts (creative briefs, channel plans, etc.) that
pre-load the LLM with marketing-domain instructions and an output schema.
The catalog is hand-curated in `app/plays/catalog.py` for V1.
"""
from fastapi import APIRouter, HTTPException, Response

from app.plays import get_play, public_plays

router = APIRouter()

# Catalog ships with the deploy and only changes on redeploy. 1h of
# browser cache eliminates ~all repeat fetches within a session;
# `must-revalidate` makes the browser ask after expiry rather than
# serving stale forever if the server is unreachable.
_CATALOG_CACHE_HEADER = "public, max-age=3600, must-revalidate"


@router.get("/plays")
async def list_plays(response: Response):
    response.headers["Cache-Control"] = _CATALOG_CACHE_HEADER
    return {"plays": public_plays()}


@router.get("/plays/{play_id}")
async def read_play(play_id: str, response: Response):
    play = get_play(play_id)
    if play is None:
        raise HTTPException(status_code=404, detail="Play not found")
    response.headers["Cache-Control"] = _CATALOG_CACHE_HEADER
    # Public-shape only (no backend instructions/output_format).
    return {
        "id": play["id"],
        "title": play["title"],
        "category": play["category"],
        "description": play["description"],
        "icon": play.get("icon"),
        "inputs": play["inputs"],
    }
