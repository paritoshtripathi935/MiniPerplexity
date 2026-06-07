from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.core.config import config as _cfg
from app.db import get_db
from app.db.models import BrandProfile, User
from app.db.repository import (
    get_brand_profile,
    get_default_project_id,
    upsert_brand_profile,
)

router = APIRouter()

SUPPORTED_CHANNELS: set[str] = set(_cfg.settings.channels.keys())


class BrandProfileIn(BaseModel):
    """Wizard payload. Every field is optional so we can save partial drafts."""
    company_name: Optional[str] = Field(default=None, max_length=200)
    website: Optional[str] = Field(default=None, max_length=400)
    icp_description: Optional[str] = Field(default=None, max_length=2000)
    primary_channels: Optional[list[str]] = None
    target_cac: Optional[float] = Field(default=None, ge=0)
    target_roas: Optional[float] = Field(default=None, ge=0)
    voice_guidelines: Optional[str] = Field(default=None, max_length=2000)
    current_campaigns_summary: Optional[str] = Field(default=None, max_length=2000)
    mark_completed: bool = False


class BrandProfileOut(BaseModel):
    user_id: str
    company_name: Optional[str] = None
    website: Optional[str] = None
    icp_description: Optional[str] = None
    primary_channels: list[str] = Field(default_factory=list)
    target_cac: Optional[float] = None
    target_roas: Optional[float] = None
    voice_guidelines: Optional[str] = None
    current_campaigns_summary: Optional[str] = None
    onboarding_completed: bool = False


def _serialize(profile: Optional[BrandProfile], user_id) -> BrandProfileOut:
    if profile is None:
        return BrandProfileOut(user_id=str(user_id))
    return BrandProfileOut(
        user_id=str(user_id),
        company_name=profile.company_name,
        website=profile.website,
        icp_description=profile.icp_description,
        primary_channels=list(profile.primary_channels or []),
        target_cac=float(profile.target_cac) if profile.target_cac is not None else None,
        target_roas=float(profile.target_roas) if profile.target_roas is not None else None,
        voice_guidelines=profile.voice_guidelines,
        current_campaigns_summary=profile.current_campaigns_summary,
        onboarding_completed=profile.onboarding_completed_at is not None,
    )


@router.get("/brand-profile", response_model=BrandProfileOut)
async def read_brand_profile(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project_id = await get_default_project_id(db, user.id)
    profile = await get_brand_profile(db, project_id)
    return _serialize(profile, user.id)


@router.put("/brand-profile", response_model=BrandProfileOut)
async def write_brand_profile(
    payload: BrandProfileIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    channels: Optional[list[str]] = None
    if payload.primary_channels is not None:
        channels = [c.strip().lower() for c in payload.primary_channels if c and c.strip()]

    project_id = await get_default_project_id(db, user.id)
    profile = await upsert_brand_profile(
        db,
        project_id,
        company_name=payload.company_name,
        website=payload.website,
        icp_description=payload.icp_description,
        primary_channels=channels,
        target_cac=payload.target_cac,
        target_roas=payload.target_roas,
        voice_guidelines=payload.voice_guidelines,
        current_campaigns_summary=payload.current_campaigns_summary,
        mark_completed=payload.mark_completed,
    )
    await db.commit()
    return _serialize(profile, user.id)
