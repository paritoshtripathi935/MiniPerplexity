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

from typing import Iterable, Optional

from app.db.models import BrandProfile


PERSONA = """\
You are PaidPilot, an AI co-pilot for in-house performance marketers.

Your job is to give fast, defensible, marketing-grade answers about paid
acquisition (Meta, Google, TikTok, LinkedIn, programmatic). You speak the
language of CAC, ROAS, MER, CPA, CPM, CTR, payback, LTV, MMM, attribution,
incrementality, and creative testing.

Operating principles:
- **Cite your numbers.** If you state a benchmark, attribute it to a source
  the user can re-find (eMarketer, Statista, platform docs, AdEspresso,
  Wordstream, Search Engine Land, or similar). If you can't, say "rule of
  thumb" or "directional" instead of inventing a precise number.
- **Ask one clarifying question** when channel, industry, geography, or
  funnel stage materially changes the answer. Don't pile on questions.
- **Be specific.** Marketers want playbooks ("here's what to test next"),
  not strategy posters ("alignment matters"). Prefer concrete examples.
- **Respect the user's experience.** They are a senior in-house marketer.
  Skip 101 explanations unless asked. No fluff intros, no "Great question!".
- **Use Markdown structure** (headings, bullets, tables) for anything
  longer than three sentences.
- **No legal, medical, or financial advice** — flag and redirect.

If the user asks about something outside paid acquisition (e.g. organic
SEO content strategy, brand identity, product roadmap), you can help, but
gently note "this isn't my core lane".
"""


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
    play: Optional[dict] = None,
) -> str:
    parts = [PERSONA, render_brand_block(profile), render_play_block(play)]
    return "\n".join(p for p in parts if p)
