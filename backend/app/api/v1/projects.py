"""Project + Campaign + per-project brand-profile endpoints.

The hierarchy (after migration 007) is:

    user → projects → campaigns → sessions

This router owns the CRUD surface that the frontend top-nav switcher,
Settings projects page, and onboarding wizard talk to. All endpoints are
owner-scoped: routes 404 if `project_id` / `campaign_id` doesn't belong to
the authenticated user.
"""
from __future__ import annotations

import logging
import uuid
from datetime import date
from typing import Optional

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.db.models import (
    AdAccountLink,
    BrandProfile,
    Campaign,
    CampaignCreative,
    Project,
    User,
)
from app.db.repository import (
    ConflictError,
    InvariantError,
    archive_campaign,
    archive_project,
    create_campaign,
    create_project,
    delete_ad_account_link,
    delete_campaign_creative,
    get_brand_profile,
    get_campaign_for_user,
    get_project_for_user,
    get_provider_connection,
    insert_campaign_creative,
    list_ad_account_links_for_project,
    list_campaign_creatives,
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
from app.services.storage import (
    StorageNotConfiguredError,
    get_storage,
    is_storage_configured,
)
from app.constants.constants import CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_KEY
from app.services.image_gen import (
    FluxImageGenerator,
    ImageGenError,
    ImageGenNotConfiguredError,
    compose_prompt as compose_image_prompt,
    distill_brand_context,
)
from app.services.language_model import CloudflareAPIError, CloudflareChat
from app.services.system_prompt import render_brand_block, render_campaign_block
import httpx

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


# ===========================================================================
# Per-campaign creative assets (PDF / image upload to object storage)
# ===========================================================================

# Max upload size — 25 MB covers ad-sized PDFs (full brief decks) and any
# reasonable PNG/JPG. Larger files probably belong in a different tool.
_CREATIVE_MAX_BYTES = 25 * 1024 * 1024

# Whitelist of mime types the upload endpoint will sign URLs for. Server-
# side gate so a malicious client can't get a presigned URL for an
# executable / arbitrary binary.
_CREATIVE_ALLOWED_MIME = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/svg+xml",
}

# Mapping from mime type → file extension; used in the storage key so the
# bucket browser shows recognisable files when humans peek inside.
_EXTENSION_FOR_MIME = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
}


class CreativeUploadRequest(BaseModel):
    """Payload for POST /creatives/upload-url. The browser tells us the
    filename + mime + size up-front so we can validate before signing."""
    filename: str = Field(..., min_length=1, max_length=255)
    mime_type: str = Field(..., min_length=1, max_length=128)
    size_bytes: int = Field(..., ge=0, le=_CREATIVE_MAX_BYTES)


class CreativeUploadOut(BaseModel):
    upload_url: str
    storage_key: str
    method: str
    expires_in: int
    # The application's view of which provider this key lives in.
    # Echoed so the confirm-upload payload doesn't need to re-derive it.
    provider: str
    # When set: the multipart field name the file goes under.
    # When null: raw-body upload (PUT with the file's Content-Type).
    body_field: Optional[str] = None
    # Extra form fields to include in the multipart body BEFORE the
    # file. Empty for providers that don't gate via policy fields.
    fields: dict[str, str] = Field(default_factory=dict)


class CreativeConfirmRequest(BaseModel):
    storage_key: str
    filename: str = Field(..., min_length=1, max_length=255)
    mime_type: str = Field(..., min_length=1, max_length=128)
    size_bytes: int = Field(..., ge=0, le=_CREATIVE_MAX_BYTES)
    provider: str = Field(..., min_length=1, max_length=16)


class CreativeOut(BaseModel):
    id: str
    campaign_id: str
    filename: str
    mime_type: str
    size_bytes: int
    provider: str
    uploaded_at: str
    uploaded_by: Optional[str] = None
    # Studio metadata — populated when the row was AI-generated, NULL on
    # user uploads. Lets the library UI render a "generated" badge and
    # the studio surface re-show the prompt that produced an asset.
    prompt: Optional[str] = None
    ai_model: Optional[str] = None


class CreativeDownloadOut(BaseModel):
    download_url: str
    expires_in: int
    filename: str


def _serialize_creative(c: CampaignCreative) -> CreativeOut:
    return CreativeOut(
        id=str(c.id),
        campaign_id=str(c.campaign_id),
        filename=c.filename,
        mime_type=c.mime_type,
        size_bytes=c.size_bytes,
        provider=c.provider,
        uploaded_at=c.uploaded_at.isoformat(),
        uploaded_by=str(c.uploaded_by) if c.uploaded_by else None,
        prompt=c.prompt,
        ai_model=c.ai_model,
    )


@router.get(
    "/projects/{project_id}/campaigns/{campaign_id}/creatives",
    response_model=list[CreativeOut],
)
async def list_campaign_creative_assets(
    campaign: Campaign = Depends(_require_campaign),
    db: AsyncSession = Depends(get_db),
):
    rows = await list_campaign_creatives(db, campaign.id)
    return [_serialize_creative(r) for r in rows]


@router.post(
    "/projects/{project_id}/campaigns/{campaign_id}/creatives/upload-url",
    response_model=CreativeUploadOut,
)
async def create_creative_upload_url(
    payload: CreativeUploadRequest,
    campaign: Campaign = Depends(_require_campaign),
):
    """Generate a presigned URL the browser can PUT a creative to.

    Server gates: max size + allowed mime types. The provider also
    binds the content-type into the signature, so the browser can't
    upload under a different mime than we signed for.
    """
    if not is_storage_configured():
        raise HTTPException(
            status_code=503,
            detail="object storage not configured on this deploy.",
        )
    if payload.mime_type not in _CREATIVE_ALLOWED_MIME:
        raise HTTPException(
            status_code=415,
            detail=f"mime '{payload.mime_type}' not allowed; "
            "supported: pdf, png, jpeg, webp, gif, svg.",
        )

    ext = _EXTENSION_FOR_MIME.get(payload.mime_type, "bin")
    # Unguessable key. We don't include the filename — that would leak
    # PII / brand names into the storage layer. Original filename is
    # persisted in the DB row + restored via Content-Disposition on
    # download.
    key = f"campaigns/{campaign.id}/{uuid.uuid4()}.{ext}"

    try:
        storage = get_storage()
        presigned = storage.presigned_upload(
            key=key,
            content_type=payload.mime_type,
            max_size_bytes=_CREATIVE_MAX_BYTES,
            expires_in=300,
        )
    except StorageNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return CreativeUploadOut(
        upload_url=presigned.upload_url,
        storage_key=presigned.storage_key,
        method=presigned.method,
        expires_in=300,
        provider=storage.name,
        body_field=presigned.body_field,
        fields=dict(presigned.fields or {}),
    )


@router.post(
    "/projects/{project_id}/campaigns/{campaign_id}/creatives",
    response_model=CreativeOut,
    status_code=status.HTTP_201_CREATED,
)
async def confirm_creative_upload(
    payload: CreativeConfirmRequest,
    campaign: Campaign = Depends(_require_campaign),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The browser calls this after the PUT to R2 succeeds. We persist
    the metadata row. Re-confirms (retries) are idempotent thanks to
    ON CONFLICT on (campaign_id, storage_key).

    We trust the client's reported `size_bytes` here — the server
    didn't see the bytes. A future v2 could HEAD the object via the
    storage client to verify, but the threat model is low: a misreport
    only affects the UI's size display, not access control.
    """
    if payload.mime_type not in _CREATIVE_ALLOWED_MIME:
        raise HTTPException(
            status_code=415, detail=f"mime '{payload.mime_type}' not allowed."
        )
    # Provider-specific key-shape check. R2 keys are server-generated
    # with a campaign prefix; an attacker can't smuggle a key from a
    # different campaign past the prefix guard. UploadThing assigns
    # opaque keys we don't control, so the same guard would reject every
    # legitimate UT confirm — the campaign auth gate (_require_campaign)
    # is the only real protection there, and that's enough: the worst a
    # malicious client could do is associate one of their own uploads
    # with one of their own campaigns under a wrong key (no escalation).
    if payload.provider == "r2":
        expected_prefix = f"campaigns/{campaign.id}/"
        if not payload.storage_key.startswith(expected_prefix):
            raise HTTPException(
                status_code=400,
                detail="storage_key does not belong to this campaign.",
            )

    creative = await insert_campaign_creative(
        db,
        campaign_id=campaign.id,
        uploaded_by=user.id,
        storage_key=payload.storage_key,
        filename=payload.filename,
        mime_type=payload.mime_type,
        size_bytes=payload.size_bytes,
        provider=payload.provider,
    )
    await db.commit()
    return _serialize_creative(creative)


@router.get(
    "/projects/{project_id}/campaigns/{campaign_id}/creatives/{creative_id}/download-url",
    response_model=CreativeDownloadOut,
)
async def get_creative_download_url(
    creative_id: str,
    campaign: Campaign = Depends(_require_campaign),
    db: AsyncSession = Depends(get_db),
):
    """Presigned GET URL. 1-hour expiry — long enough for a slow page
    + a download click without being so long that a leaked URL stays
    useful indefinitely."""
    try:
        cid = uuid.UUID(creative_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid creative id")
    from app.db.repository import get_campaign_creative

    row = await get_campaign_creative(
        db, campaign_id=campaign.id, creative_id=cid
    )
    if row is None:
        raise HTTPException(status_code=404, detail="creative not found")

    try:
        storage = get_storage()
    except StorageNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    # The row's `provider` records which backend wrote it. If the
    # active STORAGE_PROVIDER has since been swapped, this row's bytes
    # live in the old backend — we'd need to instantiate that backend
    # to sign. For v1 we only handle the happy path (provider matches);
    # a future migration would either backfill the data into the new
    # backend or keep both backends instantiable.
    if row.provider != storage.name:
        raise HTTPException(
            status_code=501,
            detail=(
                f"creative is stored on '{row.provider}' but the active "
                f"storage backend is '{storage.name}'. Re-migrate or swap "
                "STORAGE_PROVIDER back."
            ),
        )
    try:
        url = storage.presigned_download(
            key=row.storage_key,
            filename=row.filename,
            expires_in=3600,
        )
    except StorageNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return CreativeDownloadOut(
        download_url=url, expires_in=3600, filename=row.filename
    )


@router.delete(
    "/projects/{project_id}/campaigns/{campaign_id}/creatives/{creative_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_campaign_creative_endpoint(
    creative_id: str,
    campaign: Campaign = Depends(_require_campaign),
    db: AsyncSession = Depends(get_db),
):
    """Hard-delete: DB row + storage object. We delete the row first
    because losing the row but keeping the object means orphaned
    storage; losing the object but keeping the row means a broken
    download. The former is recoverable (a cleanup job can list bucket
    keys without a matching row), the latter isn't from the user's
    perspective."""
    try:
        cid = uuid.UUID(creative_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid creative id")

    removed = await delete_campaign_creative(
        db, campaign_id=campaign.id, creative_id=cid
    )
    if removed is None:
        raise HTTPException(status_code=404, detail="creative not found")
    await db.commit()

    # Best-effort storage delete after the DB commit. If this fails
    # we log + 200 — the user's view of "deleted" matches the DB, and
    # an orphaned object is a low-priority cleanup item (separate from
    # the user-facing flow). If the row was written by a different
    # provider than what's currently active (post-migration), skip
    # the storage hit and log; a sweep job can reconcile.
    if is_storage_configured():
        try:
            active = get_storage()
            if active.name == removed.provider:
                active.delete(key=removed.storage_key)
            else:
                logger.info(
                    "Skipping storage delete: row provider=%s, active=%s, "
                    "key=%s — orphan left for sweep.",
                    removed.provider,
                    active.name,
                    removed.storage_key,
                )
        except Exception:
            logger.exception(
                "Storage delete failed for creative key=%s; row removed.",
                removed.storage_key,
            )


# ===========================================================================
# /studio — AI image generation
# ===========================================================================
#
# Renders ad creatives via Cloudflare Workers AI (Flux) and persists each
# to the campaign's creatives library, side-by-side with user uploads.
# Server-side flow: generate → grab a presigned URL through the existing
# storage abstraction → PUT bytes from the backend → insert row with
# prompt+ai_model metadata. The library then renders the new tiles via
# the same GET endpoint the uploaded library uses.
#
# Defaults match the product decisions:
#   - 3 variants per click (covers the "pick the best of three" workflow)
#   - aspect-ratio is a prompt-level hint (Cloudflare's hosted Flux
#     renders at the model's native ~1024×1024 — actual cropping for
#     platform specs happens downstream in the user's design tool)
#   - 4 styles (photo / illustration / minimal / 3d)


# Hard cap on variants per request — generous but bounded so a runaway
# client can't fan out into a 50-image generation.
_STUDIO_MAX_VARIANTS = 4
_STUDIO_DEFAULT_VARIANTS = 3

_STUDIO_ALLOWED_ASPECT_RATIOS = {"1:1", "9:16", "1.91:1", "4:5"}
_STUDIO_ALLOWED_STYLES = {"photo", "illustration", "minimal", "3d"}


class StudioGenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=4, max_length=1000)
    aspect_ratio: Optional[str] = None
    style: Optional[str] = None
    variants: int = Field(default=_STUDIO_DEFAULT_VARIANTS, ge=1, le=_STUDIO_MAX_VARIANTS)
    # When true: server loads brand profile + campaign and appends a
    # distilled one-line context phrase to the Flux prompt. Default
    # true — generations look more on-brand and the user can opt out
    # via the toggle when they want a "bare" prompt.
    bake_context: bool = True

    @model_validator(mode="after")
    def _validate_enums(self) -> "StudioGenerateRequest":
        if self.aspect_ratio and self.aspect_ratio not in _STUDIO_ALLOWED_ASPECT_RATIOS:
            raise ValueError(
                f"aspect_ratio must be one of {sorted(_STUDIO_ALLOWED_ASPECT_RATIOS)}"
            )
        if self.style and self.style not in _STUDIO_ALLOWED_STYLES:
            raise ValueError(
                f"style must be one of {sorted(_STUDIO_ALLOWED_STYLES)}"
            )
        return self


class StudioPreview(BaseModel):
    """An ephemeral generated image — uploaded to storage but NOT yet
    persisted to campaign_creatives. The UI shows previews in a review
    zone; the user picks the ones worth keeping (save endpoint) and the
    rest get deleted (discard endpoint). Avoids the "library fills with
    rejects" problem from auto-persisting every variant."""
    storage_key: str
    download_url: str
    mime_type: str
    size_bytes: int
    filename: str
    # Echoed for the save flow — the client passes these back so the
    # backend doesn't have to re-derive what model / prompt / batch
    # produced this preview.
    prompt: str
    ai_model: str


class StudioGenerateOut(BaseModel):
    # Renamed from `creatives` — these aren't persisted creatives yet.
    # Frontend renders them in a "review previews" zone; save / discard
    # is the next user action.
    previews: list[StudioPreview]
    # The fully-composed prompt that was sent to Flux for this batch.
    # Returned so the UI can show "what we sent" and the user can
    # debug surprises ("why does this look like the wrong product?").
    composed_prompt: str
    # True when bake_context was honored for this batch (some calls
    # request it but skip when no brand profile exists for the campaign).
    context_baked: bool


async def _upload_bytes_to_storage(
    *,
    storage_key: str,
    body_bytes: bytes,
    content_type: str,
    presigned_url: str,
    method: str,
    body_field: Optional[str],
    fields: dict[str, str],
) -> None:
    """Server-side mirror of what the browser does on the upload flow.
    Handles both the raw-PUT (R2) and multipart-PUT (UploadThing) shapes
    via the same `PresignedUpload`-shaped inputs."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        if body_field:
            # multipart/form-data — UploadThing path. httpx builds the
            # boundary; do NOT set Content-Type manually.
            files = {body_field: (storage_key.rsplit("/", 1)[-1], body_bytes, content_type)}
            data = dict(fields or {})
            resp = await client.request(method, presigned_url, files=files, data=data)
        else:
            # raw body — R2 path. Content-Type must match what was signed.
            resp = await client.request(
                method,
                presigned_url,
                content=body_bytes,
                headers={"Content-Type": content_type},
            )
    if resp.status_code >= 400:
        raise ImageGenError(
            f"storage upload failed ({resp.status_code}): {resp.text[:300]}"
        )


@router.post(
    "/projects/{project_id}/campaigns/{campaign_id}/creatives/generate",
    response_model=StudioGenerateOut,
    status_code=status.HTTP_201_CREATED,
)
async def generate_campaign_creatives(
    payload: StudioGenerateRequest,
    campaign: Campaign = Depends(_require_campaign),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Render N image variants for the active campaign and write each
    to the creatives library.

    Errors:
      - 503 if Cloudflare env or storage env is missing on this deploy
      - 502 if Cloudflare returns an error (rate limit, content policy)
      - 400 on validation failures (prompt empty, bad enum)
    """
    if not is_storage_configured():
        raise HTTPException(
            status_code=503,
            detail="object storage not configured on this deploy.",
        )

    # Load + distil brand context only when the user opted to bake it
    # in. Skipping the brand-profile query when bake_context=False saves
    # a round-trip on every generate.
    brand_context_phrase: Optional[str] = None
    if payload.bake_context:
        brand = await get_brand_profile(db, campaign.project_id)
        brand_context_phrase = distill_brand_context(brand, campaign) or None

    composed = compose_image_prompt(
        user_prompt=payload.prompt,
        aspect_ratio=payload.aspect_ratio,
        style=payload.style,
        brand_context=brand_context_phrase,
    )
    context_baked = bool(brand_context_phrase)
    logger.info(
        "studio generate: campaign=%s variants=%d aspect=%s style=%s "
        "context_baked=%s prompt_len=%d",
        campaign.id, payload.variants, payload.aspect_ratio, payload.style,
        context_baked, len(composed),
    )

    generator = FluxImageGenerator()
    storage = get_storage()
    previews: list[StudioPreview] = []

    for i in range(payload.variants):
        try:
            image = await generator.generate(composed)
        except ImageGenNotConfiguredError as e:
            raise HTTPException(status_code=503, detail=str(e))
        except ImageGenError as e:
            # Partial-success: return whatever previews already uploaded
            # so the user sees them in the review zone, plus a soft 200
            # with the error attached. Frontend handles partial state.
            if previews:
                logger.warning(
                    "studio partial success: %d/%d variants uploaded before error: %s",
                    len(previews), payload.variants, e,
                )
                return StudioGenerateOut(
                    previews=previews,
                    composed_prompt=composed,
                    context_baked=context_baked,
                )
            raise HTTPException(status_code=502, detail=str(e))

        # Upload through the same storage abstraction the browser flow uses.
        try:
            presigned = storage.presigned_upload(
                key=f"campaigns/{campaign.id}/studio/{uuid.uuid4()}.png",
                content_type=image.mime_type,
                max_size_bytes=_CREATIVE_MAX_BYTES,
                expires_in=300,
            )
        except StorageNotConfiguredError as exc:
            raise HTTPException(status_code=503, detail=str(exc))

        try:
            await _upload_bytes_to_storage(
                storage_key=presigned.storage_key,
                body_bytes=image.bytes_,
                content_type=image.mime_type,
                presigned_url=presigned.upload_url,
                method=presigned.method,
                body_field=presigned.body_field,
                fields=dict(presigned.fields or {}),
            )
        except ImageGenError as e:
            if previews:
                logger.warning(
                    "studio partial success after storage error: %d/%d (%s)",
                    len(previews), payload.variants, e,
                )
                return StudioGenerateOut(
                    previews=previews,
                    composed_prompt=composed,
                    context_baked=context_baked,
                )
            raise HTTPException(status_code=502, detail=str(e))

        # Display filename — used as a fallback in the library tile when
        # the user doesn't supply one on save. Truncate the prompt +
        # suffix the variant index so a 3-variant batch reads as e.g.
        # "holiday hero · 1.png".
        prompt_slug = payload.prompt.strip()[:60].rstrip()
        display_filename = (
            f"{prompt_slug} · {i + 1}.png" if prompt_slug else f"generated-{i + 1}.png"
        )

        # Eagerly mint a download URL so the UI can show the preview
        # without a second round-trip. 1 hour TTL is plenty for a
        # review-then-save flow.
        download_url = storage.presigned_download(
            key=presigned.storage_key,
            filename=display_filename,
            expires_in=3600,
        )

        previews.append(
            StudioPreview(
                storage_key=presigned.storage_key,
                download_url=download_url,
                mime_type=image.mime_type,
                size_bytes=len(image.bytes_),
                filename=display_filename,
                prompt=payload.prompt.strip(),
                ai_model=image.model,
            )
        )

    # IMPORTANT: no db.commit() — generate intentionally does not
    # persist. Unsaved previews stay in storage until the user clicks
    # save (DB row gets written) or discard (storage object gets
    # deleted). Orphan sweep is a future cron — for now we accept
    # ephemeral storage costs on rejected variants.
    return StudioGenerateOut(
        previews=previews,
        composed_prompt=composed,
        context_baked=context_baked,
    )


# -------- Save / discard previews --------------------------------------


class StudioSaveItem(BaseModel):
    """One preview the user wants to keep. The client echoes back the
    storage_key + metadata from the original generate response — the
    backend verifies the key belongs to this campaign before writing
    the DB row."""
    storage_key: str
    filename: str = Field(..., min_length=1, max_length=255)
    mime_type: str = Field(..., min_length=1, max_length=128)
    size_bytes: int = Field(..., ge=0, le=_CREATIVE_MAX_BYTES)
    prompt: str = Field(..., min_length=1, max_length=2000)
    ai_model: str = Field(..., min_length=1, max_length=128)


class StudioSaveIn(BaseModel):
    items: list[StudioSaveItem] = Field(..., min_length=1, max_length=4)


class StudioSaveOut(BaseModel):
    creatives: list[CreativeOut]


@router.post(
    "/projects/{project_id}/campaigns/{campaign_id}/creatives/save-from-studio",
    response_model=StudioSaveOut,
    status_code=status.HTTP_201_CREATED,
)
async def save_studio_previews(
    payload: StudioSaveIn,
    campaign: Campaign = Depends(_require_campaign),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Persist one or more Studio previews as campaign_creatives rows.
    The client passes back the storage_key + metadata it received from
    /creatives/generate — server validates the key belongs to this
    campaign's studio prefix (so a malicious client can't smuggle in a
    different campaign's key) and writes the rows."""
    storage = get_storage()
    expected_prefix = f"campaigns/{campaign.id}/studio/"

    saved: list[CampaignCreative] = []
    for item in payload.items:
        if not item.storage_key.startswith(expected_prefix):
            raise HTTPException(
                status_code=400,
                detail=f"storage_key {item.storage_key!r} does not belong to this campaign's studio.",
            )
        if item.mime_type not in _CREATIVE_ALLOWED_MIME:
            raise HTTPException(
                status_code=415, detail=f"mime '{item.mime_type}' not allowed."
            )
        row = await insert_campaign_creative(
            db,
            campaign_id=campaign.id,
            uploaded_by=user.id,
            storage_key=item.storage_key,
            filename=item.filename,
            mime_type=item.mime_type,
            size_bytes=item.size_bytes,
            provider=storage.name,
            prompt=item.prompt,
            ai_model=item.ai_model,
        )
        saved.append(row)

    await db.commit()
    return StudioSaveOut(creatives=[_serialize_creative(c) for c in saved])


class StudioDiscardIn(BaseModel):
    """Storage keys to delete (best-effort) without persisting a DB
    row. Used when the user rejects preview tiles."""
    storage_keys: list[str] = Field(..., min_length=1, max_length=8)


@router.post(
    "/projects/{project_id}/campaigns/{campaign_id}/creatives/discard-studio",
    status_code=204,
)
async def discard_studio_previews(
    payload: StudioDiscardIn,
    campaign: Campaign = Depends(_require_campaign),
):
    """Best-effort delete of un-saved Studio previews. The route gates
    on _require_campaign for auth; key-prefix check below blocks cross-
    campaign deletion attempts. Failures are logged but don't 5xx —
    the unsaved object becomes orphan storage that a future cron sweeps."""
    storage = get_storage()
    expected_prefix = f"campaigns/{campaign.id}/studio/"
    for key in payload.storage_keys:
        if not key.startswith(expected_prefix):
            # Don't error — silently skip; a malicious client gets a
            # 204 either way and learns nothing about other campaigns.
            logger.warning(
                "discard skipped: key %r outside campaign %s studio prefix",
                key, campaign.id,
            )
            continue
        try:
            storage.delete(key=key)
        except Exception:
            logger.exception("storage delete failed for studio preview key=%s", key)
    return Response(status_code=204)


class StudioPromptSuggestIn(BaseModel):
    """`hint` is the text the user has already typed in the Studio
    composer when they click "suggest from campaign". When empty, the
    LLM drafts from brand+campaign context alone; when present, it
    refines toward the user's intent."""
    hint: Optional[str] = Field(default=None, max_length=600)


class StudioPromptSuggestOut(BaseModel):
    prompt: str


@router.post(
    "/projects/{project_id}/campaigns/{campaign_id}/creatives/suggest-prompt",
    response_model=StudioPromptSuggestOut,
)
async def suggest_studio_prompt(
    payload: StudioPromptSuggestIn,
    project_id: str,
    campaign: Campaign = Depends(_require_campaign),
    db: AsyncSession = Depends(get_db),
):
    """Compose an image-gen prompt from the campaign's brand profile +
    objective + date window.

    Same fast model that powers next-step chips (llama-3.2-3b) — short
    output, low latency. Falls back to a generic prompt if Cloudflare
    is unreachable so the UI never lands on a hard error for a
    nice-to-have feature.
    """
    # Pull the brand profile (per-project, keyed via Campaign's project).
    try:
        proj_uuid = uuid.UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="project not found")
    brand = await get_brand_profile(db, proj_uuid)

    brand_block = render_brand_block(brand) if brand else ""
    campaign_block = render_campaign_block(campaign) or f"Active campaign: {campaign.name}"

    chat = CloudflareChat(
        api_key=CLOUDFLARE_API_KEY,
        account_id=CLOUDFLARE_ACCOUNT_ID,
    )
    try:
        prompt = chat.suggest_image_prompt(
            brand_block=brand_block,
            campaign_block=campaign_block,
            hint=payload.hint,
        )
    except CloudflareAPIError as e:
        # Non-fatal: surface the message but the frontend treats this
        # as "try again" rather than blocking the user from typing
        # their own prompt.
        raise HTTPException(status_code=502, detail=f"prompt suggestion failed: {e}")

    if not prompt or len(prompt) < 8:
        raise HTTPException(
            status_code=502,
            detail="empty suggestion — retry or write your own prompt",
        )
    return StudioPromptSuggestOut(prompt=prompt)
