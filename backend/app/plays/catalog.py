"""Curated catalog of marketing Plays for PaidPilot V1.

A Play is a structured prompt that:
1. Asks the user for a small set of typed inputs.
2. Composes a templated query into the LLM.
3. (Optional) Constrains the output to a specific markdown structure.

Kept as Python literals (not YAML) so we don't add a parsing dependency.
The shape matches what the frontend renders in PlayPicker → run modal.
"""
from __future__ import annotations

from typing import Any


# Each input definition: {key, label, type, placeholder?, required?, options?}
# `type`: "text" | "textarea" | "select" | "number"
PLAYS: list[dict[str, Any]] = [
    {
        "id": "hook_ideation",
        "title": "Hook ideation",
        "category": "Creative",
        "description": "5 scroll-stopping hooks for a single product, varied by emotion.",
        "icon": "Zap",
        "inputs": [
            {"key": "product", "label": "Product or offer", "type": "text", "required": True,
             "placeholder": "e.g. AI-powered resume reviewer for new grads"},
            {"key": "audience", "label": "Audience (1 line)", "type": "text", "required": True,
             "placeholder": "e.g. job-seeking computer-science seniors"},
            {"key": "channel", "label": "Channel", "type": "select", "required": True,
             "options": ["Meta Reels", "TikTok", "YouTube Shorts", "Meta Static", "Display"]},
        ],
        "instructions": (
            "Write 5 hooks (≤12 words each) for the product and audience the user provided, "
            "tuned for the named channel. Vary the emotional register: 1 curiosity, 1 contrarian, "
            "1 fear-of-missing-out, 1 social-proof, 1 transformational. After each hook, give a "
            "one-line rationale."
        ),
        "output_format": (
            "## Hooks\n"
            "Numbered list 1–5. For each: **Hook** in bold, then a single italic line below it "
            "starting with `Why:`. No preamble, no closing summary."
        ),
    },
    {
        "id": "creative_brief",
        "title": "Creative brief",
        "category": "Creative",
        "description": "A production-ready brief for a creative team or freelancer.",
        "icon": "FileText",
        "inputs": [
            {"key": "campaign_goal", "label": "Campaign goal", "type": "text", "required": True,
             "placeholder": "e.g. drive trial sign-ups for our SMB pricing tier"},
            {"key": "format", "label": "Asset format", "type": "select", "required": True,
             "options": ["UGC video (15–30s)", "Static carousel", "Static single image",
                         "Animated motion (15s)", "Long-form (60–90s)"]},
            {"key": "kpi", "label": "Primary KPI", "type": "select", "required": True,
             "options": ["CTR", "CVR", "Hook-rate (3s view)", "Thumb-stop rate", "CPA"]},
            {"key": "constraints", "label": "Constraints / must-include / must-avoid",
             "type": "textarea", "required": False,
             "placeholder": "e.g. must say 'free 14-day trial', avoid testimonials"},
        ],
        "instructions": (
            "Write a complete creative brief using the provided campaign goal, asset format, "
            "primary KPI, and constraints. Personalise to the user's brand profile if present."
        ),
        "output_format": (
            "## Creative brief\n\n"
            "**Goal:** one sentence.\n"
            "**Audience:** 2–3 sentences (use the user's ICP if known).\n"
            "**Insight:** 1 sentence — the human truth this concept exploits.\n"
            "**Big idea:** 1 sentence.\n"
            "**Hook:** the literal first 3 seconds, scripted.\n"
            "**Body:** what happens next, beat by beat.\n"
            "**CTA:** the closing call-to-action.\n"
            "**Mandatories:** bullet list.\n"
            "**Pitfalls to avoid:** bullet list.\n"
            "**Success criteria:** what must be true for this to be considered a win, by KPI."
        ),
    },
    {
        "id": "audience_research",
        "title": "Audience research",
        "category": "Research",
        "description": "Psychographic + behavioural breakdown of a target audience.",
        "icon": "Users",
        "inputs": [
            {"key": "audience", "label": "Audience to research", "type": "textarea", "required": True,
             "placeholder": "e.g. early-career data scientists at fintech companies in the US"},
            {"key": "depth", "label": "Depth", "type": "select", "required": False,
             "options": ["Quick scan", "Full breakdown"]},
        ],
        "instructions": (
            "Research the audience with citations. Cover demographics, psychographics, "
            "watering-hole communities, jobs-to-be-done, objections, and buying triggers. "
            "Cite sources for every numeric claim."
        ),
        "output_format": (
            "## Audience: {audience}\n\n"
            "Five sections — Demographics · Psychographics · Watering holes · Jobs-to-be-done · "
            "Objections & triggers. Each ≤4 bullets. End with **Where to find them on paid:** "
            "specific Meta interests / LinkedIn job titles / TikTok hashtags / subreddits."
        ),
    },
    {
        "id": "channel_plan",
        "title": "Channel plan",
        "category": "Planning",
        "description": "Budget split, KPIs, and creative count across channels for a campaign.",
        "icon": "PieChart",
        "inputs": [
            {"key": "budget", "label": "Total monthly budget (USD)", "type": "number", "required": True,
             "placeholder": "e.g. 50000"},
            {"key": "objective", "label": "Campaign objective", "type": "select", "required": True,
             "options": ["Acquisition", "Retargeting", "Brand awareness", "Lead generation",
                         "App installs"]},
            {"key": "horizon", "label": "Horizon", "type": "select", "required": True,
             "options": ["1 month", "1 quarter", "1 year"]},
        ],
        "instructions": (
            "Propose a channel mix using the user's active channels (or recommend a mix if none). "
            "Be opinionated — pick 2–4 channels max, give a budget split with rationale, and "
            "name the KPI that proves each channel is working."
        ),
        "output_format": (
            "## Channel plan — ${budget}/mo, {horizon}, {objective}\n\n"
            "Markdown table: **Channel | % of budget | $ | KPI | Target | Creative count | "
            "Why this slice**. Then a **Risks & watchouts** section with 3 bullets. "
            "Close with **Re-plan trigger:** the metric that should make us redo this plan."
        ),
    },
    {
        "id": "ab_test_design",
        "title": "A/B test design",
        "category": "Planning",
        "description": "Hypothesis, variant spec, sample size, and decision rule.",
        "icon": "Beaker",
        "inputs": [
            {"key": "thing_to_test", "label": "What are you testing?", "type": "textarea", "required": True,
             "placeholder": "e.g. lifestyle vs. product-hero in the hero shot of our Meta ads"},
            {"key": "current_metric", "label": "Current baseline metric (CTR/CVR/CPA/etc.)",
             "type": "text", "required": True, "placeholder": "e.g. CTR = 1.2%"},
            {"key": "mde", "label": "Smallest meaningful change (MDE)", "type": "text",
             "required": True, "placeholder": "e.g. 15% relative lift"},
        ],
        "instructions": (
            "Design a clean A/B test. Be explicit about the hypothesis, the single variable, the "
            "exact variant spec, the sample size needed (compute it), and the kill/promote rule."
        ),
        "output_format": (
            "## A/B test plan\n\n"
            "**Hypothesis:** If we [change], then [metric] will [direction] by [MDE], because [why].\n"
            "**Single variable:** what's actually changing (everything else held).\n"
            "**Control:** spec.\n"
            "**Variant:** spec.\n"
            "**Sample size:** N per arm with the assumed baseline + MDE + 80% power, α=0.05. "
            "Show the math.\n"
            "**Estimated runtime:** based on typical impression rate for the channel.\n"
            "**Decision rule:** when to call it (significance threshold + minimum runtime + spend cap)."
        ),
    },
    {
        "id": "landing_page_critique",
        "title": "Landing page critique",
        "category": "Audit",
        "description": "Conversion-focused critique of a landing page URL.",
        "icon": "Eye",
        "inputs": [
            {"key": "url", "label": "Landing page URL", "type": "text", "required": True,
             "placeholder": "https://…"},
            {"key": "goal", "label": "Page goal", "type": "select", "required": True,
             "options": ["Sign-up", "Demo request", "Purchase", "App install", "Lead form"]},
        ],
        "instructions": (
            "Audit the landing page (use the search results to actually fetch it) for "
            "conversion-rate optimisation. Reference Meta/Google ad-policy compliance where relevant."
        ),
        "output_format": (
            "## Landing page audit\n\n"
            "Sections: **Above the fold** · **Hero copy & CTA** · **Social proof** · "
            "**Form / friction** · **Mobile** · **Trust & compliance**. For each section: 1 thing "
            "working, 1 thing broken, 1 specific change to test. End with a **Top 3 tests** list "
            "ranked by expected impact × effort."
        ),
    },
    {
        "id": "competitor_teardown",
        "title": "Competitor teardown",
        "category": "Research",
        "description": "Reverse-engineer a competitor's paid strategy from public signals.",
        "icon": "Search",
        "inputs": [
            {"key": "competitor", "label": "Competitor name or domain", "type": "text", "required": True,
             "placeholder": "e.g. competitor.com"},
            {"key": "channels", "label": "Channels to analyse", "type": "text", "required": False,
             "placeholder": "e.g. Meta, Google, TikTok"},
        ],
        "instructions": (
            "Synthesise everything findable about the competitor's paid strategy — Meta Ad Library "
            "creatives if mentioned in sources, Google Ads Transparency, public job postings, "
            "press, recent product launches. Don't invent specifics."
        ),
        "output_format": (
            "## {competitor} — paid teardown\n\n"
            "**Channels active on:** list with evidence.\n"
            "**Creative themes:** 3–5 with examples.\n"
            "**Audience signals:** what their targeting suggests.\n"
            "**What's working:** 3 bullets.\n"
            "**Where they're soft:** 3 bullets we could exploit.\n"
            "**Steal-worthy ideas:** 3 specific things to test on our own account."
        ),
    },
    {
        "id": "weekly_review",
        "title": "Weekly performance review",
        "category": "Audit",
        "description": "Narrative weekly review from a description of last week's numbers.",
        "icon": "TrendingUp",
        "inputs": [
            {"key": "numbers", "label": "Paste this week vs. last week's KPIs",
             "type": "textarea", "required": True,
             "placeholder": "Spend $42k → $48k\nCAC $58 → $71\nROAS 2.1 → 1.8\n…"},
            {"key": "context", "label": "Anything unusual? (launches, holidays, outages)",
             "type": "textarea", "required": False},
        ],
        "instructions": (
            "Read the numbers and write the review a smart marketer would write for their boss: "
            "what happened, why (best guess), what we'll do next week. No filler. No 'great progress!'."
        ),
        "output_format": (
            "## Weekly review\n\n"
            "**Headline:** one sentence on the week.\n"
            "**What moved:** table of metric, last week, this week, % delta.\n"
            "**Why (hypothesis):** 2–3 bullets, rank-ordered by likelihood.\n"
            "**Next week's plan:** 3 specific actions with owners (you or the team).\n"
            "**What to watch:** the leading indicator that'll tell us if hypothesis is right."
        ),
    },
    {
        "id": "ios_privacy_brief",
        "title": "iOS / privacy update brief",
        "category": "Research",
        "description": "What's the latest on signal loss, and what should we do?",
        "icon": "Shield",
        "inputs": [
            {"key": "topic", "label": "Topic / specific update", "type": "text", "required": True,
             "placeholder": "e.g. Meta CAPI changes 2026, Google enhanced conversions, EU DMA"},
        ],
        "instructions": (
            "Produce a marketer-grade brief on the privacy/measurement topic. Cite sources with "
            "dates. End with concrete actions for an in-house team."
        ),
        "output_format": (
            "## {topic}\n\n"
            "**What changed:** 2–3 bullets with dates and citations.\n"
            "**Who's affected:** specific channels and account types.\n"
            "**Direct impact on us:** in plain English, what breaks or what we lose.\n"
            "**This-week actions:** 3 specific implementation tasks, ranked.\n"
            "**Watch for:** what to monitor over the next 30/60/90 days."
        ),
    },
    {
        "id": "saturation_diagnosis",
        "title": "Saturation diagnosis",
        "category": "Audit",
        "description": "Is this campaign saturating? What do we do next?",
        "icon": "Activity",
        "inputs": [
            {"key": "campaign", "label": "Campaign / channel", "type": "text", "required": True,
             "placeholder": "e.g. Meta Advantage+ acquisition campaign"},
            {"key": "trend", "label": "What's the trend?", "type": "textarea", "required": True,
             "placeholder": "e.g. CAC up 30% over 4 weeks despite 2x more creative refresh"},
            {"key": "spend_change", "label": "Recent spend change", "type": "text", "required": False,
             "placeholder": "e.g. scaled from $1k → $4k/day over 30 days"},
        ],
        "instructions": (
            "Diagnose whether this is creative fatigue, audience saturation, frequency capping, "
            "auction-side competition, or measurement noise. Be opinionated about which is most "
            "likely given the symptoms."
        ),
        "output_format": (
            "## Saturation diagnosis\n\n"
            "**Likely cause(s):** ranked, with confidence.\n"
            "**Evidence to confirm:** what to look at in Ads Manager and how to read it.\n"
            "**Counter-moves:** ranked by expected impact × effort.\n"
            "**Stop-loss:** the metric & threshold that says 'pause and re-plan'."
        ),
    },
]


def get_play(play_id: str) -> dict | None:
    for p in PLAYS:
        if p["id"] == play_id:
            return p
    return None


def public_plays() -> list[dict]:
    """Strip backend-only fields (instructions, output_format) for the catalog API."""
    return [
        {
            "id": p["id"],
            "title": p["title"],
            "category": p["category"],
            "description": p["description"],
            "icon": p.get("icon"),
            "inputs": p["inputs"],
        }
        for p in PLAYS
    ]
