"""Compose the marketing-tuned system prompt for the LLM.

The system prompt is the difference between PaidPilot and a generic chatbot.
Every chat turn gets:

1. A persona block — who the assistant is, what it values, what it refuses.
2. The user's brand profile, if onboarded — so the assistant knows the
   company, ICP, channels, and KPI targets without being asked.
3. A play block, if the user invoked one — the structured playbook for
   *this specific* task (creative brief, channel plan, etc).
"""
from __future__ import annotations

from datetime import date
from typing import Iterable, Optional

from app.core.config import config as _cfg
from app.db.models import BrandProfile, Campaign


PERSONA: str = _cfg.prompts.persona


def _format_money(v: Optional[float]) -> str:
    if v is None:
        return "—"
    return f"${v:,.2f}"


def _format_ratio(v: Optional[float]) -> str:
    if v is None:
        return "—"
    return f"{v:.2f}×"


def _channels_phrase(channels: Iterable[str]) -> str:
    cs = [c for c in channels if c]
    if not cs:
        return "(channels not specified)"
    pretty = {
        "meta": "Meta",
        "google": "Google Ads",
        "tiktok": "TikTok",
        "linkedin": "LinkedIn",
        "programmatic": "programmatic",
        "youtube": "YouTube",
        "reddit": "Reddit",
        "snap": "Snap",
        "pinterest": "Pinterest",
        "email": "email/lifecycle",
        "seo": "SEO",
        "other": "other",
    }
    return ", ".join(pretty.get(c.lower(), c) for c in cs)


def render_brand_block(profile: Optional[BrandProfile]) -> str:
    """The brand-profile section of the system prompt. '' if no profile."""
    if profile is None:
        return ""

    lines: list[str] = ["", "## User's brand context", ""]
    if profile.company_name:
        line = f"- **Company:** {profile.company_name}"
        if profile.website:
            line += f" ({profile.website})"
        lines.append(line)
    if profile.icp_description:
        lines.append(f"- **ICP:** {profile.icp_description}")
    lines.append(f"- **Active channels:** {_channels_phrase(profile.primary_channels or [])}")
    if profile.target_cac is not None or profile.target_roas is not None:
        lines.append(
            f"- **Targets:** CAC {_format_money(float(profile.target_cac) if profile.target_cac is not None else None)} · "
            f"ROAS {_format_ratio(float(profile.target_roas) if profile.target_roas is not None else None)}"
        )
    if profile.voice_guidelines:
        lines.append(f"- **Brand voice:** {profile.voice_guidelines}")
    if profile.current_campaigns_summary:
        lines.append(f"- **Current campaigns:** {profile.current_campaigns_summary}")

    lines.append("")
    lines.append(
        "Use this context to make recommendations specific to this brand. "
        "If a question is generic, still personalise the example to their channels and ICP."
    )
    return "\n".join(lines)


def _date_window_phrase(starts_on, ends_on, today: Optional[date] = None) -> str:
    """Human-friendly date window phrase the LLM can quote. Returns '' when
    no dates are set."""
    if not starts_on and not ends_on:
        return ""
    today = today or date.today()
    starts_on_d = starts_on if isinstance(starts_on, date) else None
    ends_on_d = ends_on if isinstance(ends_on, date) else None
    fmt = lambda d: d.strftime("%b %d, %Y")
    if starts_on_d and ends_on_d:
        if today < starts_on_d:
            return f"runs {fmt(starts_on_d)} – {fmt(ends_on_d)} (starts in {(starts_on_d - today).days} days)"
        if today > ends_on_d:
            return f"ran {fmt(starts_on_d)} – {fmt(ends_on_d)} (ended {(today - ends_on_d).days} days ago)"
        days_in = (today - starts_on_d).days
        days_left = (ends_on_d - today).days
        return f"running {fmt(starts_on_d)} – {fmt(ends_on_d)} ({days_in} days in, {days_left} days left)"
    if starts_on_d:
        return f"started {fmt(starts_on_d)} (ongoing)"
    if ends_on_d:
        return f"ends {fmt(ends_on_d)}"
    return ""


def render_campaign_block(campaign: Optional[Campaign]) -> str:
    """The active-campaign section of the system prompt. '' if no campaign
    or a generic 'General' campaign with no objective and no dates (in
    which case there's nothing useful to add and we save tokens)."""
    if campaign is None:
        return ""

    has_objective = bool((campaign.objective or "").strip())
    has_window = bool(campaign.starts_on or campaign.ends_on)
    is_generic_general = (
        campaign.name.strip().lower() == "general"
        and not has_objective
        and not has_window
    )
    if is_generic_general:
        return ""

    lines: list[str] = ["", "## Active campaign", ""]
    lines.append(f"- **Name:** {campaign.name}")
    if has_objective:
        lines.append(f"- **Objective:** {campaign.objective.strip()}")
    if has_window:
        phrase = _date_window_phrase(campaign.starts_on, campaign.ends_on)
        if phrase:
            lines.append(f"- **Schedule:** {phrase}")

    lines.append("")
    lines.append(
        "Tune recommendations to this campaign — its objective, schedule, "
        "and stage of life. When a question is generic, ground the example "
        "in this campaign's context."
    )
    return "\n".join(lines)


def render_play_block(play: Optional[dict]) -> str:
    """Inject a Play's instructions and output schema. '' if no play."""
    if not play:
        return ""

    lines: list[str] = ["", f"## Active play: {play.get('title', 'Unnamed')}", ""]
    if desc := play.get("description"):
        lines.append(desc)
        lines.append("")

    if instructions := play.get("instructions"):
        lines.append("**Instructions for this play:**")
        lines.append(instructions)
        lines.append("")

    if output_format := play.get("output_format"):
        lines.append("**Required output format:**")
        lines.append(output_format)
        lines.append("")

    return "\n".join(lines)


def compose_system_prompt(
    profile: Optional[BrandProfile] = None,
    campaign: Optional[Campaign] = None,
    play: Optional[dict] = None,
) -> str:
    parts = [
        PERSONA,
        render_brand_block(profile),
        render_campaign_block(campaign),
        render_play_block(play),
    ]
    return "\n".join(p for p in parts if p)
