# Stitch prompts — Studio redesign

Stitch generation prompt for the `/projects/:p/c/:c/studio` creative-
generation surface. Pairs with the existing studio scaffolding shipped
on `feat/anakin-search-spike` (composer + preview-then-save flow +
Cloudflare Flux backend).

See:
- [STATUS.md](./STATUS.md) for the broader roadmap context.
- `frontend/src/pages/StudioPage.tsx` for the current implementation
  that this redesign supersedes once a mock is approved.
- [STITCH_PROMPTS_H.md](./STITCH_PROMPTS_H.md) for the original
  project + campaign Stitch prompts — same brand language, same
  restraint rules apply here.

The current Studio surface ships every functional piece this prompt
names (composer / aspect / style / context-bake toggle / preview tiles
with save / discard / recent generations grid). The redesign direction
encoded below is **split timeline** — turning Studio from a flat
gallery into a chronological generation history where saved and
unsaved tiles live together by batch. If a different direction is
preferred, swap the `DIRECTION FOR THE REDESIGN` block and keep the
rest intact.

---

## Prompt 1 — Studio surface (split-timeline direction)

```
Design a single screen called "Studio" for an AI co-pilot SaaS aimed at
in-house performance marketers. The product is called PaidPilot.

WHAT THE SCREEN DOES
The user describes a creative concept ("a hero shot of our holiday gift
bundle on a warm cream background"), picks an aspect ratio and a
visual style, then generates 3 AI-rendered ad creative variants. They
review the variants, save the ones they want to keep to the campaign's
creative library, and discard the rest. They can iterate — generate
again with a tweaked prompt, get 3 more variants, save the best.

EVERY AFFORDANCE THAT MUST APPEAR
1. A prompt composer (rows from top to bottom):
   - eyebrow label "brief" with a brand-tinted "suggest from campaign"
     button on the same row — clicking it calls an LLM that drafts a
     starting prompt based on the user's brand profile + campaign
   - a large multi-line textarea (4-5 visible rows). placeholder copy
     reads "describe the creative — concept, subject, mood…"
   - inline char counter "147/1000" and a keyboard hint "⌘ + ↵ to
     generate" right-aligned under the textarea
   - two chip rows side-by-side:
     - aspect ratio chips: "1:1 meta feed", "9:16 stories · reels ·
       tiktok", "1.91:1 meta link preview", "4:5 instagram portrait".
       each chip has a small visual glyph (a rounded rectangle in the
       actual proportions) before the label so portrait vs landscape
       reads at a glance
     - style chips: "photo", "illustration", "minimal", "3d"
   - a single context-bake toggle chip: when active reads "brand +
     campaign on" with a target icon, brand-tinted; when off reads
     "brand + campaign off", neutral. an explainer line next to it
     says what each state does in plain language
   - a primary CTA "generate" — brand violet→blue gradient (#7C5CFF →
     #3B82F6), the only gradient on the page. shows wall-clock elapsed
     time when in progress ("rendering · 7s")

2. A "sent to flux" disclosure that appears after each generation —
   collapsed by default. when expanded it shows the fully-composed
   prompt that hit the model + a small "context baked" pill if the
   bake-context toggle was on + a "copy" button. font is monospace
   inside the disclosure body.

3. A "review · pick what to keep" section that only appears when a
   batch is in flight or freshly returned:
   - eyebrow header with count ("3 previews"), and on hover/focus,
     "save all" and "discard all" bulk actions on the right
   - 3-up grid of preview tiles, each tile:
       - square aspect crop of the generated image
       - a small chip overlaid top-left: "preview · unsaved"
       - on hover: 3 small icon buttons top-right (copy prompt, re-use
         prompt, download)
       - the prompt text below the image (2-line clamp)
       - a persistent action row: green "save" button (fills 80% of
         the row) + a small "✕" discard button (square, 40px)
   - while generating: 3 shimmer placeholder tiles instead of images

4. A "recent generations" section below — flat 3-up grid of saved
   creatives in this campaign, scoped to AI-generated rows only. each
   tile renders the image with prompt text below. hover overlay shows
   copy prompt, re-use, download. the most recent batch gets a tiny
   "just now" chip overlaid top-left.

5. A page-level header with:
   - eyebrow "studio" in mono-uppercase brand tint
   - h1 title "generate creative."
   - subtitle explaining the surface in one sentence
   - a top-right action "full library →" linking to the campaign's
     uploaded-and-generated creatives library

DIRECTION FOR THE REDESIGN (THIS IS WHAT'S DIFFERENT)
The current Studio stacks composer → review → recents vertically. It
works but feels flat. Redesign as a SPLIT TIMELINE:

- TOP: sticky composer (always visible, max-height ~280px) — collapses
  smoothly to a single thin bar with just the textarea + generate
  button when the user scrolls past it. clicking the bar re-expands.
- BELOW: a chronological timeline of generations, newest on top. each
  generation is a horizontal row containing:
    - left rail (~120px): timestamp ("just now", "2m ago"), the prompt
      excerpt, a small "context baked" chip if applicable, a discreet
      "re-run with this prompt" link
    - right area: the 3 tiles inline (or shimmer if in-flight). when
      a preview, tiles carry the save/discard footer; once a tile is
      saved it gets a small green "saved" chip on it and the
      save/discard buttons hide.
- this turns Studio into a generation HISTORY, not a flat gallery —
  matches how marketers actually work (try, save the keeper, try
  again). no separate "review" vs "recents" sections; saved and
  unsaved live together in the timeline with different chip
  treatments.

BRAND IDENTITY
- Operator-tool aesthetic. Dark-first. Linear, Ramp, and Vercel-style
  visual register: dense, monospace eyebrows, very high contrast
  text, no decorative chrome.
- Palette (dark mode):
    background:  #0B0C10
    surface:     #131419
    surface raised (cards):  #1A1B22 at 40% opacity (so the dark bg
                             shows through as backdrop blur)
    border:      #2A2C36 at 60%
    fg (primary text):  #F0F1F3
    fg-muted:    #9B9DA8
    fg-subtle:   #5C5E6B
    brand violet: #7C5CFF
    brand blue:   #3B82F6
    emerald (success): #34D399
    rose (destructive): #F87171
- Typography:
    headings: a modern display sans (think Söhne / Inter Display)
    body: Inter Variable
    monospace: JetBrains Mono / IBM Plex Mono
    headings + section labels are all lowercase, ending in periods
    when they're full sentences (e.g. "generate creative.")
- Section eyebrows are 11px monospace, uppercase, letter-spacing
  0.18em, color is brand-violet at 80% opacity
- Border radius:
    cards: 16px (1rem)
    chips: 6px
    buttons: 6px
    pills (status): 6px
- Spacing: 4/8/12/16 base scale. Section gaps 32-40px.

RESTRAINT RULES (HARD)
- The brand violet→blue gradient is the ONLY gradient on the page.
  Reach for it solely on the single primary CTA ("generate"). No
  decorative gradients, no per-card washes, no glow backgrounds.
- No AI-sparkle iconography. No twinkles, no stars, no
  shimmer/twinkle motion. Magic-wand or target icons are fine; cosmic
  sparkles are not.
- One primary CTA per surface — "generate" is it.
- No emoji in headings or labels.
- Status colors are emerald (success), rose (destructive), amber
  (warning) — used ONLY for state, never for decoration.
- Project / brand colors don't appear here at all.

OUTPUT
- A single 1440×900 desktop screen, dark mode.
- Render the whole timeline including:
  - composer in expanded state
  - one in-flight generation (3 shimmer tiles)
  - one freshly-returned generation (3 preview tiles, prompt
    "minimalist holiday gift bundle on warm cream background, soft
    morning light", one already marked saved)
  - one older saved generation from 2 minutes ago (3 saved tiles,
    prompt "outdoor product still life — fall leaves, hiking boots
    in soft afternoon light")
- Include the page header + a left sidebar nav (just stub the
  sidebar: home, investigations, plays, calculators, studio active,
  creatives, projects, integrations, settings).

DO NOT
- Don't render a hero / landing-style splash. This is a working tool,
  not a marketing page.
- Don't add icons that don't carry information.
- Don't render text inside the AI-generated example images (image
  models render text poorly and ad-creative best practice says no
  text-on-image anyway).
- Don't include legal / pricing / sign-up CTAs. This is a logged-in
  surface only.
```

---

## Alternate directions (swap into the `DIRECTION FOR THE REDESIGN`
## block if split-timeline isn't a fit)

### Direction B — Sidebar-driven composer (Midjourney-style)

```
The composer lives in a right-rail drawer (~360px wide) that slides
open from the right edge when the user clicks a floating "new
generation" pill bottom-right. The main column is a large gallery
grid (4-up at lg+) of every generation the user has produced for this
campaign, newest first. Previews and saved creatives share the grid
but carry different chip treatments — `preview · unsaved` (brand
violet) vs `saved · 2m ago` (emerald). Bulk save/discard appears
inline at the top of the grid when previews exist.

This direction maximises gallery surface area at the cost of a
slightly less linear write→see flow. Pick it if discovery /
re-browsing dominates the workflow over iteration.
```

### Direction C — Canvas board (Figma-style)

```
The page is a freeform canvas where each generation lands as a card
the user can drag around. Composer is a docked sheet at the bottom.
Saved creatives stay on the canvas with a green ring; discarded ones
fade out. The user can group related variants by dragging them
together; export a group as a "concept set" to the campaign library.

This direction supports an "iterate and arrange" mental model that's
closer to how creatives actually get presented to stakeholders. Pick
it if the spike's value prop becomes "collaborative concept
exploration" rather than "fast variant generation".
```

### Direction D — Split-pane (Linear/Notion-style)

```
50/50 split: composer on the left (sticky, full-height), gallery on
the right with infinite scroll. The composer doesn't collapse — it's
always available for the next iteration without scrolling. The right
pane is a chronological feed of generation batches, each batch
rendered as a row of 3 tiles plus a header with the prompt + chips.

This direction is the most "operator-tool" of the four — closest to
Linear's split-pane pattern. Pick it if the dominant workflow is
"type a prompt, see what came back, type another prompt" with zero
scroll friction.
```
