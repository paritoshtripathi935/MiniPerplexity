# Stitch prompts — /docs redesign

Stitch generation prompt for the `/docs` documentation surface. Pairs
with the existing `frontend/src/pages/DocsPage.tsx` (single-page guide
covering every feature in PaidPilot with a sticky right-rail TOC).

See:
- [STATUS.md](./STATUS.md) for broader roadmap context
- [STITCH_PROMPTS_STUDIO.md](./STITCH_PROMPTS_STUDIO.md) for the Studio
  prompt — same brand language and restraint rules apply here
- [STITCH_PROMPTS_H.md](./STITCH_PROMPTS_H.md) for the original
  project + campaign prompts
- `frontend/src/pages/DocsPage.tsx` for the current implementation
  that this redesign supersedes once a mock is approved

The current docs is a single-column scrolling page with section
eyebrows + h2 + body and a sticky right-rail TOC at `lg+`. It works
but reads "blog post", not "developer reference". The redesign
direction encoded below is **developer-docs three-column** — left
sidebar with category-grouped navigation, center content, right rail
with mini-TOC for the current section. Pick a different DIRECTION
block if a different shape fits better.

---

## Prompt 1 — Docs surface (three-column dev-docs direction)

```
Design a single screen called "Docs" for an AI co-pilot SaaS aimed at
in-house performance marketers. The product is called PaidPilot.

WHAT THE SCREEN DOES
This is the in-product documentation surface. Visitors land here from
the sidebar's "docs" row or from external links. The audience is
operators who just signed up — they need to learn what every feature
does in their first ten minutes. The page is single-page (not multi-
page) — all sections live on one URL, linkable via anchor.

EVERY SECTION THAT MUST APPEAR (in this order, anchor ids in parens)
1. getting started (#getting-started) — three-step quick-start
2. projects + campaigns (#projects-campaigns) — the data hierarchy
3. brand profile (#brand-profile) — what's in it, why it matters
4. investigations (#investigations) — chat surface, streaming,
   citations, every per-turn affordance
5. improve prompt (#improve-prompt) — the brand-tinted button that
   rewrites a rough draft using brand + campaign context
6. model selection (#models) — the BIGGEST in-page asset; carries a
   5-card grid comparing gpt-oss-120b (default), gpt-oss-20b,
   qwq-32b (reasoning), qwen3-30b (structured), mistral-small. The
   default card gets a brand-tinted border to stand out.
7. citation drawer (#citations) — inline [N] pills, prev/next, the
   exact quoted excerpt the model was conditioned on
8. videos drawer (#videos) — youtube grounding, header chip
9. next-step chips (#next-steps) — three follow-up suggestions per
   turn, click to fire
10. plays (#plays) — pre-shaped prompt templates
11. slash menu + url paste (#slash-menu) — composer shortcuts
12. calculators + scenarios (#calculators) — CAC payback, ROAS,
    A/B sample size, channel mix
13. creatives (#creatives) — per-campaign asset library (PDFs +
    images, uploaded by user)
14. studio (#studio) — AI image generation surface (Flux, save/discard
    review zone, prompt suggester)
15. integrations (#integrations) — Slack live, Meta dormant, others
    coming-soon
16. navigation (#navigation) — sidebar / command palette / sessions
17. keyboard shortcuts (#shortcuts) — a clean two-column grid of
    kbd-chip + label pairs
18. settings + theme (#settings) — account-level prefs
19. account + sign-out (#account) — Clerk auth surface
20. help (#help) — bottom mailto

LAYOUT (this is what's different from the current single-column page)
THREE-COLUMN at lg+, single column on smaller screens.

  LEFT column (256px, sticky, full-height under the top nav):
    - eyebrow "guide"
    - grouped section index. Groups (with their member sections):
        START HERE        getting started
        BUILDING BLOCKS   projects + campaigns · brand profile
        CONVERSATIONS     investigations · improve prompt · model
                          selection · citation drawer · videos drawer
                          · next-step chips
        TOOLS             plays · slash menu · calculators · creatives
                          · studio
        CONNECTIONS       integrations
        NAVIGATION        sidebar / palette / sessions · keyboard
                          shortcuts
        SETTINGS          settings + theme · account · help
    - each group title in monospace eyebrow style
    - each section row 28px tall, 13px body type, left-bar highlight
      (2px solid brand) on the active section as the user scrolls
    - the column is scrollable independently of the main content
      when it overflows

  CENTER column (max 720px wide, generously gutter-spaced):
    - top hero block:
        - eyebrow "documentation"
        - h1 "how paidpilot works."
        - subtitle (single sentence describing the surface)
        - a search input ("search the docs…") with a cmd-K kbd hint
          — search is local-page text-match, no backend needed
        - quick-link chips: "model selection", "keyboard shortcuts",
          "studio" (3 most-likely-clicked deep links)
    - long-form content: each section uses
        - icon + monospace eyebrow + h2 lowercase title
        - body paragraphs (Inter, 15px, line-height 1.7)
        - bullet lists with brand-muted markers
        - in-content kbd chips, code chips, inline Link chips
        - section spacing 64-80px
    - the "model selection" section renders a 2x3 (or 5-up at lg+)
      card grid where each card carries: model id, characteristic
      pill (default / fast / reasoning / structured / generalist),
      one-line pitch, "when to pick" body line, and an optional tip
      for reasoning models
    - the "keyboard shortcuts" section is a 2-column grid of label +
      kbd-chip pairs
    - the "integrations" section can show a small grid of the brand
      marks (Slack, Meta, Google, Notion, Linear, Discord) — square
      tile per brand, all dimmed except Slack (live) and Meta (live
      pending env config)

  RIGHT column (240px, sticky, full-height under the top nav):
    - eyebrow "on this page" (mini-TOC for the section the user is
      currently reading — populated by IntersectionObserver
      scroll-spy; not the global TOC which lives on the left)
    - 4-8 sub-section anchors max (typically just the current
      section's subsections; the left rail handles cross-section nav)
    - if there's nothing meaningful for the current section (e.g.
      single-paragraph sections like help), the right rail collapses
      to a "share feedback" mini-card with a mailto:
      hello@paidpilot.app link

  TOP NAV (preserves the existing app shell):
    - same 64px-tall nav bar with the PaidPilot logo, the campaign
      switcher pill, and the user avatar. Same one rendered across
      every authed surface.

BRAND IDENTITY (unchanged from STITCH_PROMPTS_STUDIO.md — same tokens)
- Operator-tool aesthetic. Dark-first. Linear / Vercel / Stripe-docs
  visual register: dense, monospace eyebrows, very high contrast.
- Palette (dark mode):
    background:  #0B0C10
    surface:     #131419
    surface raised (cards):  #1A1B22 at 40% opacity
    border:      #2A2C36 at 60%
    fg:          #F0F1F3   fg-muted: #9B9DA8   fg-subtle: #5C5E6B
    brand violet: #7C5CFF   brand blue: #3B82F6
    emerald: #34D399   rose: #F87171
- Headings: Inter Display, lowercase, periods on full sentences.
- Eyebrows: 11px JetBrains Mono, uppercase, letter-spacing 0.18em,
  brand-violet at 80% opacity.
- Body: Inter Variable, 15px, line-height 1.7 in long-form sections.
- Code / kbd: JetBrains Mono.
- Border radius: 16px on cards, 6px on chips/buttons, 4px on the
  small code chips inside paragraphs.

RESTRAINT RULES (HARD, same as everywhere else)
- The brand violet→blue gradient is the ONLY gradient on the page.
  Use it sparingly — at most one decorative-gradient accent in the
  hero, and on any primary CTA. No per-section washes.
- No AI-sparkle iconography (no twinkles, no stars).
- Status colors (emerald success, rose destructive, amber warning)
  are used ONLY for state, never decoration.
- No emoji in headings or labels.
- No project / brand colors on this surface.

OUTPUT
- A single 1440×1100 desktop screen, dark mode. Render the full
  three-column layout with the page scrolled to the top so the hero
  is visible and the left rail's "CONVERSATIONS" group is expanded
  with "model selection" highlighted as the active section (which
  means the right rail shows the model-selection sub-TOC + the
  center area shows the model card grid in view).
- Include realistic placeholder copy for the visible sections — at
  least the hero, "getting started", and "model selection" should
  render in full. Subsequent sections can be visibly stubbed (eyebrow
  + h2 + 1-2 lines of body) since the page is too long to fully render
  in one screen.
- Show the model-card grid populated with all 5 model cards.

DO NOT
- Don't render a hero / landing-style splash. This is in-app docs.
- Don't add icons that don't carry information.
- Don't include sign-up / pricing / legal CTAs.
- Don't replace the eyebrow + h2 + body pattern with a different
  structure. The vertical rhythm is part of the brand.
```

---

## Alternate directions (swap into the `LAYOUT` block to explore other
## shapes against Stitch in parallel)

### Direction B — Two-column with hero search + tabs

```
TWO-COLUMN at lg+, single column on smaller screens.

  Above-the-fold hero (full-width, ~280px tall):
    - large search input centered, ~480px wide
    - 6-8 quick-link tabs below the search ("getting started",
      "investigations", "models", "shortcuts", "studio", "integrations")
    - tabbed scroll: clicking a tab smooth-scrolls to that section

  LEFT column (220px, sticky): full grouped TOC, same as direction 1's
  left rail.

  RIGHT column (no third column): center content extends to the right
  page margin.

Pick this if the search hero needs to be the primary discovery surface
and a per-section mini-TOC is less important than a global TOC.
```

### Direction C — Card-grid landing → drill into section

```
SINGLE column. The /docs landing is a 3x3 grid of feature cards (one
per section group). Each card carries an icon, the group title, and
a one-line description. Clicking a card navigates to a sub-route
(/docs/conversations, /docs/tools, etc.) where the actual content
lives — broken across pages instead of one long scroll.

Pick this if discoverability beats single-page completeness — easier
for first-time users to know "where to look" but loses the
Cmd+F-everywhere benefit of single-page docs.
```

### Direction D — Vertical timeline / linear story

```
SINGLE column. Reframes the docs as a guided tour rather than a
reference: each section flows into the next vertically with strong
visual separators ("step 1 of 7" / "step 2 of 7" mono labels),
inline screenshots, and a "back to top" affordance at every break.
The TOC moves into a thin floating pill in the bottom-right.

Pick this if the audience is first-time-only users and the docs
should read more like an onboarding walkthrough than a manual.
```

---

## Sections that grew since the last revision

These are present in `DocsPage.tsx` but were NOT in earlier Stitch
prompts — flag them so the output mock includes them:

- **improve prompt** (#improve-prompt) — added with the chat composer
  improve-button feature
- **studio** (#studio) — entire new section covering creative
  generation, preview-then-save, brand-context toggle, prompt
  suggester. This is a substantial section; allocate vertical space.
- **plays history** in the home section — minor mention only.
