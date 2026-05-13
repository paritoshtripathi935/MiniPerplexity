"""Project + Campaign + per-project brand-profile endpoints.

The hierarchy (after migration 007) is:

    user → projects → campaigns → sessions

This router owns the CRUD surface that the frontend top-nav switcher,
Settings projects page, and onboarding wizard talk to. All endpoints are
owner-scoped: routes 404 if `project_id` / `campaign_id` doesn't belong to
the authenticated user.
"""
from __future__ import annotations

import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.db.models import AdAccountLink, BrandProfile, Campaign, Project, User
from app.db.repository import (
    ConflictError,
    InvariantError,
    archive_campaign,
    archive_project,
    create_campaign,
    create_project,
    delete_ad_account_link,
    get_brand_profile,
    get_campaign_for_user,
    get_project_for_user,
    get_provider_connection,
    list_ad_account_links_for_project,
    list_campaigns_for_project,
    list_projects_for_user,
    list_projects_with_counts,
    rename_project,
    unarchive_campaign,
    unarchive_project,
    update_campaign,
    upsert_ad_account_link,
    upsert_brand_profile,
)
from app.services.meta_api import (
    MetaNotConfiguredError,
    decrypt_token,
    is_configured as meta_is_configured,
    list_ad_accounts,
)

router = APIRouter()


# ===========================================================================
# Schemas
# ===========================================================================
class ProjectIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)


class ProjectOut(BaseModel):
    id: str
    name: str
    created_at: str
    updated_at: str
    archived_at: Optional[str] = None
    # Operational metrics. Populated by GET /projects (one SQL round-trip
    # via list_projects_with_counts); zero on POST/PATCH/GET-by-id which
    # don't carry the aggregation. The frontend treats absent counts as 0.
    campaign_count: int = 0
    session_count: int = 0
    last_session_at: Optional[str] = None


def _serialize_project(
    p: Project,
    *,
    campaign_count: int = 0,
    session_count: int = 0,
    last_session_at: Optional[str] = None,
) -> ProjectOut:
    return ProjectOut(
        id=str(p.id),
        name=p.name,
        created_at=p.created_at.isoformat(),
        updated_at=p.updated_at.isoformat(),
        archived_at=p.archived_at.isoformat() if p.archived_at else None,
        campaign_count=campaign_count,
        session_count=session_count,
        last_session_at=last_session_at,
    )


class CampaignIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    objective: Optional[str] = Field(default=None, max_length=500)
    starts_on: Optional[date] = None
    ends_on: Optional[date] = None

    @model_validator(mode="after")
    def _date_window(self) -> "CampaignIn":
        if self.starts_on and self.ends_on and self.starts_on > self.ends_on:
            raise ValueError("starts_on must be on or before ends_on")
        return self


class CampaignPatch(BaseModel):
    """PATCH semantics: any field omitted is "leave alone". Pass `null`
    explicitly on `starts_on` / `ends_on` to clear a date."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    objective: Optional[str] = Field(default=None, max_length=500)
    starts_on: Optional[date] = None
    ends_on: Optional[date] = None
    # Tracks which date fields the client explicitly sent (incl. null).
    # Pydantic v2 helper.
    model_config = {"extra": "forbid"}


class CampaignOut(BaseModel):
    id: str
    project_id: str
    name: str
    objective: Optional[str] = None
    starts_on: Optional[str] = None
    ends_on: Optional[str] = None
    created_at: str
    updated_at: str
    archived_at: Optional[str] = None


def _serialize_campaign(c: Campaign) -> CampaignOut:
    return CampaignOut(
        id=str(c.id),
        project_id=str(c.project_id),
        name=c.name,
        objective=c.objective,
        starts_on=c.starts_on.isoformat() if c.starts_on else None,
        ends_on=c.ends_on.isoformat() if c.ends_on else None,
        created_at=c.created_at.isoformat(),
        updated_at=c.updated_at.isoformat(),
        archived_at=c.archived_at.isoformat() if c.archived_at else None,
    )


class BrandProfileIn(BaseModel):
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
    project_id: str
    company_name: Optional[str] = None
    website: Optional[str] = None
    icp_description: Optional[str] = None
    primary_channels: list[str] = Field(default_factory=list)
    target_cac: Optional[float] = None
    target_roas: Optional[float] = None
    voice_guidelines: Optional[str] = None
    current_campaigns_summary: Optional[str] = None
    onboarding_completed: bool = False


def _serialize_brand(profile: Optional[BrandProfile], project_id: uuid.UUID) -> BrandProfileOut:
    if profile is None:
        return BrandProfileOut(project_id=str(project_id))
    return BrandProfileOut(
        project_id=str(profile.project_id),
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


# ===========================================================================
# Dependencies (owner-scoped lookups)
# ===========================================================================
async def _require_project(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    project = await get_project_for_user(db, project_id, user.id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def _require_campaign(
    project_id: uuid.UUID,
    campaign_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Campaign:
    campaign = await get_campaign_for_user(db, campaign_id, user.id)
    if campaign is None or campaign.project_id != project_id:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign


# ===========================================================================
# Projects
# ===========================================================================
@router.get("/projects", response_model=list[ProjectOut])
async def list_projects(
    include_archived: bool = False,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Owned projects, ordered oldest-first (matches default-project
    resolution). Each row includes live-campaign + live-session counts
    so the Settings projects page can render its operational-metrics
    columns without an N+1 fan-out."""
    rows = await list_projects_with_counts(
        db, user.id, include_archived=include_archived
    )
    return [
        _serialize_project(
            r["project"],
            campaign_count=r["campaign_count"],
            session_count=r["session_count"],
            last_session_at=r["last_session_at"],
        )
        for r in rows
    ]


@router.post("/projects", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project_endpoint(
    payload: ProjectIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new project for this user."""
    try:
        project = await create_project(db, user.id, payload.name)
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    await db.commit()
    return _serialize_project(project)


@router.get("/projects/{project_id}", response_model=ProjectOut)
async def get_project(project: Project = Depends(_require_project)):
    return _serialize_project(project)


@router.patch("/projects/{project_id}", response_model=ProjectOut)
async def patch_project(
    payload: ProjectIn,
    project: Project = Depends(_require_project),
    db: AsyncSession = Depends(get_db),
):
    try:
        project = await rename_project(db, project.id, payload.name)
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    await db.commit()
    return _serialize_project(project)


@router.post("/projects/{project_id}/archive", response_model=ProjectOut)
async def archive_project_endpoint(
    project: Project = Depends(_require_project),
    db: AsyncSession = Depends(get_db),
):
    """Soft-archive. Refuses to archive the user's only live project so the
    active-campaign localStorage pointer can't dangle."""
    try:
        project = await archive_project(db, project)
    except InvariantError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    await db.commit()
    return _serialize_project(project)


@router.post("/projects/{project_id}/unarchive", response_model=ProjectOut)
async def unarchive_project_endpoint(
    project: Project = Depends(_require_project),
    db: AsyncSession = Depends(get_db),
):
    try:
        project = await unarchive_project(db, project)
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    await db.commit()
    return _serialize_project(project)


# ===========================================================================
# Campaigns (nested under projects)
# ===========================================================================
@router.get("/projects/{project_id}/campaigns", response_model=list[CampaignOut])
async def list_campaigns(
    include_archived: bool = False,
    project: Project = Depends(_require_project),
    db: AsyncSession = Depends(get_db),
):
    rows = await list_campaigns_for_project(db, project.id, include_archived=include_archived)
    return [_serialize_campaign(c) for c in rows]


@router.post(
    "/projects/{project_id}/campaigns",
    response_model=CampaignOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_campaign_endpoint(
    payload: CampaignIn,
    project: Project = Depends(_require_project),
    db: AsyncSession = Depends(get_db),
):
    try:
        campaign = await create_campaign(
            db,
            project.id,
            payload.name,
            objective=payload.objective,
            starts_on=payload.starts_on,
            ends_on=payload.ends_on,
        )
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    await db.commit()
    return _serialize_campaign(campaign)


@router.get("/projects/{project_id}/campaigns/{campaign_id}", response_model=CampaignOut)
async def get_campaign(campaign: Campaign = Depends(_require_campaign)):
    return _serialize_campaign(campaign)


@router.patch("/projects/{project_id}/campaigns/{campaign_id}", response_model=CampaignOut)
async def patch_campaign(
    payload: CampaignPatch,
    campaign: Campaign = Depends(_require_campaign),
    db: AsyncSession = Depends(get_db),
):
    # "null" on a date is a deliberate clear; "field omitted" is leave-alone.
    # FastAPI gives us a model with None for both cases — distinguish by
    # checking the raw set of fields the client sent.
    sent = payload.model_dump(exclude_unset=True)
    try:
        campaign = await update_campaign(
            db,
            campaign,
            name=payload.name if "name" in sent else None,
            objective=payload.objective if "objective" in sent else None,
            starts_on=payload.starts_on if "starts_on" in sent and payload.starts_on is not None else None,
            ends_on=payload.ends_on if "ends_on" in sent and payload.ends_on is not None else None,
            clear_starts_on=("starts_on" in sent and payload.starts_on is None),
            clear_ends_on=("ends_on" in sent and payload.ends_on is None),
        )
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    await db.commit()
    return _serialize_campaign(campaign)


@router.post(
    "/projects/{project_id}/campaigns/{campaign_id}/archive", response_model=CampaignOut
)
async def archive_campaign_endpoint(
    campaign: Campaign = Depends(_require_campaign),
    db: AsyncSession = Depends(get_db),
):
    """Soft-archive. Refuses to archive the project's only live campaign."""
    try:
        campaign = await archive_campaign(db, campaign)
    except InvariantError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    await db.commit()
    return _serialize_campaign(campaign)


@router.post(
    "/projects/{project_id}/campaigns/{campaign_id}/unarchive", response_model=CampaignOut
)
async def unarchive_campaign_endpoint(
    campaign: Campaign = Depends(_require_campaign),
    db: AsyncSession = Depends(get_db),
):
    try:
        campaign = await unarchive_campaign(db, campaign)
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    await db.commit()
    return _serialize_campaign(campaign)


# ===========================================================================
# Per-project brand profile
# ===========================================================================
@router.get("/projects/{project_id}/brand-profile", response_model=BrandProfileOut)
async def read_project_brand_profile(
    project: Project = Depends(_require_project),
    db: AsyncSession = Depends(get_db),
):
    profile = await get_brand_profile(db, project.id)
    return _serialize_brand(profile, project.id)


@router.put("/projects/{project_id}/brand-profile", response_model=BrandProfileOut)
async def write_project_brand_profile(
    payload: BrandProfileIn,
    project: Project = Depends(_require_project),
    db: AsyncSession = Depends(get_db),
):
    channels: Optional[list[str]] = None
    if payload.primary_channels is not None:
        channels = [c.strip().lower() for c in payload.primary_channels if c and c.strip()]
    profile = await upsert_brand_profile(
        db,
        project.id,
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
    return _serialize_brand(profile, project.id)


# ===========================================================================
# Per-project ad-account links (Meta integration, STATUS A5)
# ===========================================================================

class AdAccountLinkIn(BaseModel):
    external_account_id: str = Field(..., min_length=1, max_length=64)


class AdAccountLinkOut(BaseModel):
    id: str
    project_id: str
    provider: str
    external_account_id: str
    account_name: str
    account_currency: str
    account_timezone: str
    linked_at: str
    last_synced_at: Optional[str] = None
    sync_status: str
    sync_error: Optional[str] = None


def _serialize_ad_account_link(link: AdAccountLink) -> AdAccountLinkOut:
    return AdAccountLinkOut(
        id=str(link.id),
        project_id=str(link.project_id),
        # Phase 1: only Meta. When Google Ads ships we'll join through
        # provider_connections.provider here.
        provider="meta",
        external_account_id=link.external_account_id,
        account_name=link.account_name,
        account_currency=link.account_currency,
        account_timezone=link.account_timezone,
        linked_at=link.linked_at.isoformat(),
        last_synced_at=link.last_synced_at.isoformat() if link.last_synced_at else None,
        sync_status=link.sync_status,
        sync_error=link.sync_error,
    )


@router.get(
    "/projects/{project_id}/ad-accounts", response_model=list[AdAccountLinkOut]
)
async def list_project_ad_accounts(
    project: Project = Depends(_require_project),
    db: AsyncSession = Depends(get_db),
):
    rows = await list_ad_account_links_for_project(db, project.id)
    return [_serialize_ad_account_link(r) for r in rows]


@router.post(
    "/projects/{project_id}/ad-accounts",
    response_model=AdAccountLinkOut,
    status_code=status.HTTP_201_CREATED,
)
async def link_project_ad_account(
    payload: AdAccountLinkIn,
    project: Project = Depends(_require_project),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Link a Meta ad account to this project. The frontend already
    knows which accounts the user has access to (via
    /integrations/meta/ad-accounts); we re-query Meta here to snapshot
    the live account name + currency + tz at link-time, so the picker's
    "stale display name" risk goes away."""
    if not meta_is_configured():
        raise HTTPException(
            status_code=503,
            detail="Meta integration not configured on this deploy.",
        )

    conn = await get_provider_connection(db, user_id=user.id, provider="meta")
    if not conn:
        raise HTTPException(status_code=400, detail="meta not connected")

    try:
        access_token = decrypt_token(conn.access_token_ciphertext)
        accounts = await list_ad_accounts(access_token)
    except MetaNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    match = next(
        (a for a in accounts if a.id == payload.external_account_id), None
    )
    if not match:
        # Either the user lost access since the picker rendered, or the
        # frontend sent a junk id. Either way, can't proceed.
        raise HTTPException(
            status_code=404, detail="ad account not visible to this user"
        )

    link = await upsert_ad_account_link(
        db,
        project_id=project.id,
        provider_connection_id=conn.id,
        external_account_id=match.id,
        account_name=match.name,
        account_currency=match.currency,
        account_timezone=match.timezone_name,
    )
    await db.commit()
    return _serialize_ad_account_link(link)


@router.delete(
    "/projects/{project_id}/ad-accounts/{link_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def unlink_project_ad_account(
    link_id: str,
    project: Project = Depends(_require_project),
    db: AsyncSession = Depends(get_db),
):
    try:
        link_uuid = uuid.UUID(link_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid link id")
    removed = await delete_ad_account_link(
        db, project_id=project.id, link_id=link_uuid
    )
    if not removed:
        raise HTTPException(status_code=404, detail="ad account link not found")
    await db.commit()
