# PAI-13 — Operator Design System Adoption

> Stacked-PR plan to adopt the Stitch-designed "operational workspace" identity.
> Created: 2026-05-11 · branch: TBD per slice · status: planning

## Why

PAI-13 reframes the product from "AI marketing assistant" to "AI-powered
operating system for growth teams". Today's UI feels like a generic AI-SaaS
dashboard (passive homepage, equal card weighting, "Good afternoon, Paritosh",
chatbot-centric copy). The Linear ticket calls for a durable UX philosophy
that makes PaidPilot feel operational, intelligent, calm, and trustworthy —
reference products are Linear, Stripe Dashboard, Vercel, Ramp, Notion.

## Source material

Stitch-generated designs + spec live outside the repo at:

```
~/iCloud Drive (Archive) - 1/Documents/stitch_paidpilot_operational_workspace/
```

Contents:

- `paidpilot/DESIGN.md` — full design system spec (colors, typography, spacing, components)
- `paidpilot_homepage_{dark,light}/screen.png` — operational hub
- `command_palette_{dark,light}/{screen.png,code.html}` — ⌘K palette
- `investigation_workspace_{dark,light}/{screen.png,code.html}` — chat reframed as investigation
- `investigation_workspace_empty_state_dark/screen.png` — empty state with suggestion chips
- `cac_payback_calculator_{dark,light}/screen.png` — scenarios primary, inputs secondary
- `cac_payback_calculator_empty_{dark,light}/{screen.png,code.html}` — calc empty state

## Locked decisions (2026-05-11)

| Decision | Choice | Notes |
|---|---|---|
| Color palette | **Full Material 3 purple scheme from DESIGN.md YAML** — see [palette table below](#color-palette-canonical--embed-verbatim-in-tailwindconfigjs) | DESIGN.md prose mentions `#0052FF` blue — that's a doc artifact, ignored. Tokens are canonical. Accent is `primary=#4f378a` / `primary-container=#6750a4`. |
| Navigation structure | **Keep current 5-page nav** (Home / Investigations / Plays / Calculators / Settings) | Stitch's sidebars each invented different decorative nav labels — those are not real. |
| Icon library | **Lucide** stays | Material Symbols would give 1:1 match to Stitch HTML but adds a font + migration cost. Lucide is close enough and already tree-shaken. |
| Theme default | **Dark-first** | Switch the default; light still works via class toggle. Gate behind localStorage so existing light-mode users keep their preference. |
| Data strategy | **Stub now, integrate later** | Operational feed runs on data we already have (sessions, scenarios, plays history). Meta CAC / campaign cards stub to "Connect Meta" rows pointing at a future onramp. |
| PR strategy | **Stacked** | One foundation PR, six dependent slices. Merge in order. |

## Design tokens (from DESIGN.md)

### Color palette (canonical — embed verbatim in `tailwind.config.js`)

This is the full palette from the Stitch `DESIGN.md` YAML frontmatter.
**Ignore the `#0052FF` blue mentioned in the DESIGN.md prose** — it's a
documentation-tool artifact. The YAML tokens (and every rendered screen)
ship the Material 3 purple scheme below.

**Light theme (canonical, defined in DESIGN.md):**

| Token | Value | Role |
|---|---|---|
| `surface` / `background` / `surface-bright` | `#fdf7ff` | base canvas |
| `surface-container-lowest` | `#ffffff` | lowest tonal layer |
| `surface-container-low` | `#f8f2fa` | level 1 (slight elevation) |
| `surface-container` | `#f2ecf4` | cards, sidebars |
| `surface-container-high` | `#ece6ee` | modals, popovers |
| `surface-container-highest` | `#e6e0e9` | highest tonal layer |
| `surface-dim` | `#ded8e0` | de-emphasised surface |
| `surface-variant` | `#e6e0e9` | secondary surface tint |
| `on-surface` / `on-background` | `#1d1b20` | primary text |
| `on-surface-variant` | `#494551` | secondary/metadata text |
| `outline` | `#7a7582` | strong borders, dividers |
| `outline-variant` | `#cbc4d2` | subtle borders, dividers |
| `inverse-surface` | `#322f35` | inverted surface (toasts, snackbars) |
| `inverse-on-surface` | `#f5eff7` | text on inverted surface |
| `primary` | `#4f378a` | primary actions, active states |
| `primary-container` | `#6750a4` | filled accent (buttons, brand chip) |
| `on-primary` | `#ffffff` | text on `primary` |
| `on-primary-container` | `#e0d2ff` | text on `primary-container` |
| `inverse-primary` | `#cfbcff` | primary on dark surfaces |
| `surface-tint` | `#6750a4` | accent tint for elevated surfaces |
| `secondary` | `#63597c` | secondary action |
| `secondary-container` | `#e1d4fd` | secondary chip background |
| `on-secondary` | `#ffffff` | text on `secondary` |
| `on-secondary-container` | `#645a7d` | text on `secondary-container` |
| `tertiary` | `#765b00` | tertiary semantic (amber/warning lean) |
| `tertiary-container` | `#c9a74d` | filled tertiary |
| `on-tertiary` | `#ffffff` | text on `tertiary` |
| `on-tertiary-container` | `#503d00` | text on `tertiary-container` |
| `error` | `#ba1a1a` | error semantic |
| `error-container` | `#ffdad6` | filled error chip background |
| `on-error` | `#ffffff` | text on `error` |
| `on-error-container` | `#93000a` | text on `error-container` |
| `primary-fixed` | `#e9ddff` | high-emphasis fixed accent surface |
| `primary-fixed-dim` | `#cfbcff` | dimmed fixed accent surface |
| `on-primary-fixed` | `#22005d` | text on `primary-fixed` |
| `on-primary-fixed-variant` | `#4f378a` | secondary text on `primary-fixed` |
| `secondary-fixed` | `#e9ddff` | fixed secondary surface |
| `secondary-fixed-dim` | `#cdc0e9` | dimmed fixed secondary surface |
| `on-secondary-fixed` | `#1f1635` | text on `secondary-fixed` |
| `on-secondary-fixed-variant` | `#4b4263` | secondary text on `secondary-fixed` |
| `tertiary-fixed` | `#ffdf93` | fixed tertiary surface |
| `tertiary-fixed-dim` | `#e7c365` | dimmed fixed tertiary surface |
| `on-tertiary-fixed` | `#241a00` | text on `tertiary-fixed` |
| `on-tertiary-fixed-variant` | `#594400` | secondary text on `tertiary-fixed` |

**Dark theme (PR A derives this — DESIGN.md does not ship a dark palette
explicitly):** Stitch's exported HTML inverts roles (uses `on-background`
as body bg, `surface-bright` as foreground) — a hack, not a proper scheme.
For PR A we'll generate a proper Material 3 dark scheme keyed to the same
purple primary, using:

- `surface` ≈ `#141218` (M3 dark base)
- `surface-container-low/high/highest` shifted lighter in steps
- `on-surface` → near-white, `on-surface-variant` → light grey
- `primary` → `inverse-primary` (`#cfbcff`) for accent on dark
- `outline` / `outline-variant` shifted to remain ~1.5:1 against base

Exact values lock during PR A implementation.

### Other tokens

```
Spacing       4px grid · xs/sm/md/lg/xl = 4/8/16/24/48
Card radius   10–12px primary surfaces · 6–8px small elements · no pill buttons
Typography    Inter Variable · tabular-nums on metrics · 12–16px operational range
Type scale    h1 24/600/-0.02em · h2 18/600/-0.01em · body-base 14/400 ·
              body-sm 13/400 · metric-lg 32/500/-0.03em · label-caps 11/600/0.05em
Layering      Tonal (no shadows). Border 1px instead of large gaps.
Elevation     Modals/popovers: optional 0 4px 12px rgba(0,0,0,.05) or 1px border.
              No blur, no glassmorphism.
Accent use    Reserved for: primary CTA per screen, active nav, citation chips,
              selected-row left bar in palette, brand chip. Nowhere else.
Semantic use  Green/amber/red only for low-saturation status (≤16px deployments).
```

## Stacked PRs

Seven PRs, each branched off the previous. Land them in order; each builds on the design tokens established in PR A.

### PR A — `feat(design): adopt operator design tokens + dark-first`

Foundation. Highest blast radius — touches every page.

- Replace `tailwind.config.js` color scale with DESIGN.md tokens. Keep `dark:` variants.
- Add Material 3 surface scale: `surface`, `surface-container-low`, `surface-container`, `surface-container-high`, `surface-container-highest`, `surface-bright`, `surface-dim`, `outline`, `outline-variant`, `on-surface`, `on-surface-variant`.
- Add font-size variants from the type scale.
- Add `tabular-nums` Tailwind utility (`font-variant-numeric: tabular-nums`).
- Add the Inter Variable load if not already global.
- Flip default theme to `dark`. Gate behind a localStorage check so existing users keep their preference.
- **No page rewrites.** Every existing page should still render and just look more restrained.
- Visual QA across Home / Chat / Plays / Calc / Settings — accept that some surfaces will look "off" until later PRs refit them.

**Test plan:**
- All five pages load without console errors
- Light↔dark toggle still works
- Existing localStorage theme preference is respected
- Calculator inputs still align (tabular-nums applied selectively)
- `tsc --noEmit` + `vite build` pass

### PR B — `feat(copy): "investigation" rename + strip AI buzzwords`

- Rename "Chat" → "Investigation" across nav, sidebar, route params (`/chat/:id` → `/investigations/:id` with 301-style client redirect for old links).
- "New chat" → "New investigation". "Recent chats" → "Recent investigations". Sessions sidebar header → "Investigations".
- Strip "Ask me anything", "AI assistant", "✨", "💡", emoji greetings.
- Rewrite empty states with operational copy:
  - Homepage empty: "No investigations yet. Start by asking what changed, what to test, or what to scale."
  - Investigation empty: "Start by asking what changed, what to test, or what to scale." + 3 suggestion chips drawn from brand profile / last play
  - Plays empty: existing copy probably fine, audit
  - Calculator empty: "No scenarios yet. Calculate once and save it to track changes over time."
- Composer placeholder: "Continue the investigation…"

### PR C — `feat(nav): command palette (⌘K)`

- Add `cmdk` (already pattern-leading for command palettes in React).
- Implement Stitch's command-palette design — 520×440px modal, grouped results, label-caps group headers, shortcut chips, footer help row.
- Groups: **Investigations** (last N sessions), **Plays** (catalog), **Calculators** (4 fixed), **Jump to** (Dashboard, Plays, Calculators, Settings).
- Hotkeys: ⌘K opens, ⌘N → new investigation, ⌘P → run a play, ⌘E → open calculators, G+D → dashboard, G+S → settings.
- Selected row gets the 2px primary-left bar from the Stitch design.
- Fuzzy filter on input.

### PR D — `feat(home): operational hub`

Rebuild `HomePage.tsx` per `paidpilot_homepage_dark`.

- **Header** (replaces "Good afternoon, Paritosh"): single line of operational state — `N open investigations · M scenarios pending · last active <relative>`. Tabular nums. Derived from real data.
- **Primary surface (left, ~60%): Operational feed.** Stacked rows separated by 1px dividers (no per-row borders). Each row: small leading icon + one-line label + right-aligned metadata. Real rows we can build:
  - `N investigations open · last activity <time>`
  - `ROAS calculator → M scenarios saved`
  - `CAC payback → M scenarios saved`
  - **Stub:** `Meta CAC trend — Connect Meta` (links to a future settings/integrations page; for now show "Coming soon" or open a Linear-style placeholder modal)
- **Secondary (right top, ~40%): Continue investigation.** Top 3 recent sessions — title + 1-line snippet of last assistant turn + timestamp. Lighter metadata.
- **Tertiary (right bottom): Quick actions.** Three text-only links with right-aligned kbd chips: "New investigation ⌘N", "Run a play ⌘P", "Open calculators ⌘E".
- No big CTAs, no card grid, no brand chip on top.

### PR E — `feat(investigation): document-style turn + Evidence rail`

Rebuild ChatPage per `investigation_workspace_dark`.

- **Sticky top bar:** Investigation title (editable inline), small chips for status (`Active` / `Archived`), turn count, last-activity timestamp. ⋯ overflow for rename / archive / export. (Most of this already exists; restyle to match.)
- **Main column:** Document-style turns. Flush-left "you" / "PaidPilot" 11px labels. No bubbles, no avatars. Per-turn actions row: Copy · Regenerate · Cite · Open source. Inline `[N]` chips on the only-accent color.
- **Right rail relabel:** Header "**Evidence**", subsections **Sources** / **Videos** / **Active play**. Each section title in `label-caps`. Empty states per section (no faux cards).
- **Empty state:** "Start by asking what changed, what to test, or what to scale." + 3 suggestion chips from brand profile / last play. Composer placeholder "Continue the investigation…".
- Sticky composer at the bottom; submit is a small monochrome arrow with ⌘↵ hint on hover.

### PR F — `feat(calculators): scenarios as primary surface`

Rebuild CAC Payback per `cac_payback_calculator_dark`. Apply same shape to ROAS→Margin, A/B sample, Channel efficiency. Split per-calculator if the diff gets too big.

- **Primary (~55%): Scenarios stack.** Rows: name + headline metric in `metric-lg` tabular nums + chip-line of input metadata + delta vs. last (e.g. `↓ 1.2 mo vs. last week`). One row visually dominant (active scenario, subtle highlight bar).
- **Secondary (~45%): Active Model Variables.** Compact input form, labels in `label-caps`, inputs in mono-ish style, inline drift indicators (`-4.5% drift` / `stable` / `+0.5% drift`) when values differ from the active scenario.
- **Tertiary:** Top-right breadcrumb chip: "Calculators / CAC Payback".
- "Save scenario" is the only purple button on the screen.
- **Empty state:** "No scenarios yet. Calculate once and save it to track changes over time." Dashed-border `surface-container` placeholder per the Stitch empty design — minus the centered icon if we're avoiding decorative iconography.

### PR G — `feat(polish): plays, settings, remaining empty states, dead-code sweep`

- Plays page: apply tokens, audit empty state, surface "recently used" as a secondary feed.
- Settings page: audit. The "preferred chat model" surface is fine; tighten typography per the new scale.
- Remaining empty states across the app.
- Dead-code sweep: any Tailwind classes / colors / animations no longer referenced after the system swap.
- Bundle pass — see if `React.lazy`-splitting the investigation route helps now that we have more code in the operational feed.

## Risks / open questions

1. **Backwards-compat for `/chat/:id` URLs.** Existing users have bookmarks. PR B should client-redirect `/chat/:id` → `/investigations/:id` (or just keep both routes pointing at the same component).
2. **PR A blast radius.** Token swap may make some current surfaces look temporarily worse before later PRs refit them. Worth landing PR A and PR B back-to-back so the visual rough patch is brief.
3. **Material Symbols vs. Lucide.** Locked Lucide for now. If we discover specific Stitch icons have no near-equivalent in Lucide, can revisit per-icon.
4. **The new homepage replaces "Recent chats" — make sure history is still discoverable.** The "Continue investigation" rail covers the top 3; full history should be reachable via the sessions sidebar (already exists) and the command palette (PR C).
5. **Slice F is biggest.** If 4 calculators in one PR gets unwieldy, split into F1 (CAC Payback as the prototype) and F2 (port the pattern to the other 3).

## What's next-up after PAI-13

PAI-13 is independent of the other STATUS.md queued items. After PAI-13 lands:

- Delete JSON `/answer` endpoint (5 min, queued)
- GitHub repo rename (5 min)
- Mobile right rail fallback
- `darkMode` prop-drilling cleanup
- Bundle size pass (partly addressed in PR G)
- V2 Meta Ad Library — naturally feeds the operational feed's stubbed rows

## Resume notes

When picking this up:

1. Re-read this file + `STATUS.md`.
2. Confirm the locked decisions still hold (especially accent + dark-first defaults).
3. Start with PR A. Land it on its own branch, merge to main, then start PR B branched off main (or stack literally with `git branch B A`).
4. Each PR updates this file with the merged PR link and any decision deltas surfaced during implementation.
