"""Load and validate all YAML config files at startup.

Each config domain lives in its own file under backend/config/.
Plays are one YAML file each under backend/plays/.

Pydantic validates every file at import time so a bad config surfaces
immediately at boot, not at the first request that touches it.
"""
from __future__ import annotations

import pathlib
from typing import Optional

import yaml
from pydantic import BaseModel

_BACKEND_DIR = pathlib.Path(__file__).parent.parent.parent
CONFIG_DIR = _BACKEND_DIR / "config"
PLAYS_DIR = _BACKEND_DIR / "plays"


# ---------- Models ----------------------------------------------------------

class ModelEntry(BaseModel):
    id: str
    label: str
    description: str
    recommended: bool = False


class ModelDefaults(BaseModel):
    chat: str
    rerank: str
    next_steps: str


class ModelsConfig(BaseModel):
    models: list[ModelEntry]
    defaults: ModelDefaults
    legacy_slugs: list[str] = []


# ---------- Domain authority ------------------------------------------------

class DomainAuthorityDefaults(BaseModel):
    authority: int = 50
    floor: int = 30
    authoritative_threshold: int = 80


class DomainAuthorityConfig(BaseModel):
    scores: dict[str, int]
    defaults: DomainAuthorityDefaults


# ---------- Search engines --------------------------------------------------

class SearchEngineEntry(BaseModel):
    id: str
    enabled: bool = True
    max_results: int = 10
    timeout: int = 5
    overfetch: Optional[int] = None
    shorts_min_seconds: Optional[int] = None


class SearchConfig(BaseModel):
    engines: list[SearchEngineEntry]

    def get(self, engine_id: str) -> Optional[SearchEngineEntry]:
        return next((e for e in self.engines if e.id == engine_id), None)

    @property
    def enabled(self) -> list[SearchEngineEntry]:
        return [e for e in self.engines if e.enabled]


# ---------- App settings ----------------------------------------------------

class CorsConfig(BaseModel):
    origins: list[str]


class RateLimitsConfig(BaseModel):
    search_calls_per_minute: int = 30


class HttpConfig(BaseModel):
    request_timeout: int = 5
    max_content_length: int = 5000
    max_paragraphs: int = 5


class CleanupConfig(BaseModel):
    interval_seconds: int = 300


class AppSettings(BaseModel):
    cors: CorsConfig
    rate_limits: RateLimitsConfig
    http: HttpConfig
    cleanup: CleanupConfig


# ---------- Prompts ---------------------------------------------------------

class PromptsConfig(BaseModel):
    persona: str
    generic_assistant: str
    search_context: str
    next_steps: str
    next_steps_user: str


# ---------- Plays -----------------------------------------------------------

class PlayInput(BaseModel):
    key: str
    label: str
    type: str
    required: bool = False
    placeholder: Optional[str] = None
    options: Optional[list[str]] = None


class PlayConfig(BaseModel):
    id: str
    title: str
    category: str
    description: str
    icon: Optional[str] = None
    inputs: list[PlayInput]
    instructions: str
    output_format: str

    def to_dict(self) -> dict:
        return self.model_dump()

    def public_dict(self) -> dict:
        """Strip backend-only fields for the catalog API."""
        return {
            "id": self.id,
            "title": self.title,
            "category": self.category,
            "description": self.description,
            "icon": self.icon,
            "inputs": [i.model_dump(exclude_none=True) for i in self.inputs],
        }


# ---------- Top-level container ---------------------------------------------

class AppConfig(BaseModel):
    models: ModelsConfig
    domain_authority: DomainAuthorityConfig
    search: SearchConfig
    settings: AppSettings
    prompts: PromptsConfig
    plays: list[PlayConfig]

    def get_play(self, play_id: str) -> Optional[PlayConfig]:
        return next((p for p in self.plays if p.id == play_id), None)


# ---------- Loader ----------------------------------------------------------

def _load_yaml(path: pathlib.Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _load_plays(plays_dir: pathlib.Path) -> list[PlayConfig]:
    return [
        PlayConfig(**_load_yaml(f))
        for f in sorted(plays_dir.glob("*.yaml"))
    ]


def load_config() -> AppConfig:
    return AppConfig(
        models=ModelsConfig(**_load_yaml(CONFIG_DIR / "models.yaml")),
        domain_authority=DomainAuthorityConfig(**_load_yaml(CONFIG_DIR / "domain_authority.yaml")),
        search=SearchConfig(**_load_yaml(CONFIG_DIR / "search_engines.yaml")),
        settings=AppSettings(**_load_yaml(CONFIG_DIR / "settings.yaml")),
        prompts=PromptsConfig(**_load_yaml(CONFIG_DIR / "prompts.yaml")),
        plays=_load_plays(PLAYS_DIR),
    )


# Module-level singleton — loaded once at import time (i.e. at server startup).
config: AppConfig = load_config()
