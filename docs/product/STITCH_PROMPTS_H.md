# Stitch prompts — Category H (projects + campaigns)

Stitch generation prompts for the project/campaign hierarchy surfaces. The
first prompt produced the initial mock set in
`~/Downloads/stitch_paidpilot_projects_campaigns/` (May 2026). The second is
an addendum that adds collapsible-sidebar behavior on top of those mocks.

See [STATUS.md § Category H](./STATUS.md#h-projects--campaigns-hierarchy)
for the data model and shipping plan these designs map to.

---

## Prompt 1 — surfaces

**Product:** PaidPilot — an operational workspace for in-house performance
marketers. Operator tool, not a chatbot. Linear / Stripe / Ramp design
territory.

**Design language (established — match these exactly):**

- Dark-first. Material 3 purple scheme. Primary: `#6750A4`
  (primary-container background, used sparingly on CTAs and active
  selections).
- Surface tokens: `bg-surface` (page), `bg-surface-raised/40` (cards),
  `bg-surface-sunken/40` (insets). Border: `border-border/60`. Text:
  `text-fg` / `text-fg-muted` / `text-fg-subtle`.
- Brand gradient (one CTA per surface max): violet → blue,
  `from-#7C5CFF to-#3B82F6`, with a soft violet glow.
- Cards: `rounded-2xl border border-border/60 bg-surface-raised/40`,
  optional `shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)]`.
- Typography: `font-display` for headings (`tracking-[-0.02em]
  font-semibold`). Eyebrows: `font-mono text-[11px] uppercase
  tracking-[0.18em] text-brand/80`. Body: lowercase sentence case (proper
  nouns preserved — PaidPilot, Meta, Google).
- Logo: "P with chat-tail" silhouette in primary-container purple.
- Calm motion only. No AI-sparkle iconography. Status dots = emerald-400.

**Top-nav landmarks (existing — do not redesign):**

- Logo + product name on the left.
- Center: Home / Investigations / Plays / Calculators tabs.
- Right: ⌘K command-palette pill, model-selector (only on
  `/investigations`), avatar.
- Between logo and tabs: there's currently a **brand chip** showing the
  user's brand name. **This is being replaced by the active-campaign
  switcher below.**

### Surface 1 — Active campaign switcher (top-nav)

A pill button in the top nav between the logo and the page tabs. Replaces
the existing brand chip. Default state:

```
[ ◆ Allbirds · Q4 holiday push  ▾ ]
```

- Left: tiny project-color dot (each project assigned a hue: purple / blue
  / emerald / amber / rose — auto-cycled, immutable per project).
- Project name in `text-fg`, ` · ` separator in `text-fg-subtle`, campaign
  name in `text-fg-muted`.
- Whole pill: `rounded-xl border border-border/60 bg-surface-raised/40
  hover:bg-surface-raised/60`. Chevron `text-fg-subtle`.
- Active state: when the switcher popover is open, swap to
  `border-brand/40 bg-brand/5`.

**Popover (opens below the pill, 360px wide):**

- Search input at top — `rounded-lg bg-surface-sunken/40`, placeholder
  "search projects + campaigns…" with ⌘K-style hint. Filters across both
  projects and campaigns.
- Sectioned list:
  - First section: the **active project** expanded, showing its
    campaigns. Header is a project row (color dot + name + "current"
    eyebrow chip + chevron-down).
  - Each campaign row: name + a metric line (right-aligned, `text-fg-subtle
    text-body-sm`) showing `N investigations · last touched 2h ago`.
    Active campaign row gets a 2px violet left bar and `bg-brand/5` tint.
  - If the campaign has a date window, show a tiny `text-fg-subtle
    font-mono` chip on the right: `nov 14 – dec 24`. Past end date →
    amber chip "ended". Inside window → emerald chip "active". No window
    set → omit.
- Second section: collapsed projects (color dot + name + N campaigns
  count). Click expands inline, listing that project's campaigns. Only
  one project expanded at a time.
- Footer: two ghost buttons side-by-side — "+ new project" and "+ new
  campaign in this project" — separated by a hairline. Gradient CTAs not
  used here; this is utility navigation.
- Keyboard: arrow up/down moves selection, enter switches context, esc
  closes. Right arrow expands a project, left arrow collapses.

**Empty inner state** (only the default project + General campaign
exists): the popover shows the single project expanded, single "General"
campaign with a "0 investigations" subline, and a soft hint card at the
bottom: "create your first campaign to organize work by goal."

### Surface 2 — `/settings/projects` (project list)

Page header in the settings shell:

- Eyebrow: `settings`
- H1: `projects + campaigns`
- Sub: "each project is a brand. campaigns group the work you do for that
  brand."
- Top-right: gradient CTA `+ new project`.

Below: a **stacked operational list** of projects (matches the Plays page
rebuild from PR #52, not a card grid). Each row, full-width, `rounded-2xl
border border-border/60 bg-surface-raised/40 p-5
hover:bg-surface-raised/60`:

- Left cluster (vertical):
  - Row 1: color dot + project name (`text-h2`, font-display) + small
    `text-fg-subtle` chip with the brand's `company_name` if it differs
    from the project name.
  - Row 2: `text-body-sm text-fg-muted` — `N campaigns · M investigations
    · last active 3d ago`.
- Middle: an inline horizontal scroll of up-to-5 campaign chips for this
  project. Each chip: `rounded-lg border border-border/60
  bg-surface-sunken/40 px-3 py-1.5`, name in `text-fg`, optional date
  pill on the right. Active campaign (the one currently selected in
  localStorage) gets `border-brand/40 bg-brand/5`. If more than 5, the
  last chip is `+N more` linking into the project detail.
- Right: overflow menu `⋯` — archive, rename, set as active.

Archived projects: shown as a dim section below with a "show archived
(N)" toggle. Rows are 50% opacity, `archived 2 weeks ago` eyebrow,
"unarchive" button instead of `⋯`.

Filtered-empty state (when search matches nothing): centered card with
"no projects match 'foo'" + reset link, matching the Plays page empty
state.

### Surface 3 — `/settings/projects/:id` (project detail)

Header:

- Breadcrumb chip top-right: `settings › projects › Allbirds`
- Eyebrow: color-dot + `project`
- H1: editable project name inline (click to edit, `bg-surface-sunken/40`
  on focus).
- Sub: "brand context + campaigns for this project."
- Top-right: ghost `archive project` (destructive-feeling but soft — no
  red gradients).

Two-column layout below the header (`lg:grid-cols-[1fr_1.2fr] gap-6`,
stacks on mobile):

**Left column — brand profile** (inlined; replaces what's currently in
`/settings`):

A single card `rounded-2xl border border-border/60 bg-surface-raised/40
p-6`. Sections separated by `border-border/40 hairlines`:

1. **Company.** Company name (text), website (url).
2. **ICP.** "who do you sell to?" — multiline textarea.
3. **Targets.** Target CAC (`$ ...`) + target ROAS (`...x`) side-by-side
   in `grid-cols-2`.
4. **Channels.** Multi-select chip group: meta, google, tiktok, youtube,
   linkedin, klaviyo, lifecycle, paid social, paid search, other. Selected
   chips: `border-brand/40 bg-brand/5 text-fg`. Unselected:
   `border-border/60 bg-surface-sunken/40 text-fg-muted`.
5. **Voice + current activity.** Two textareas: "voice guidelines" +
   "current campaigns summary".

Save button: gradient CTA, sticky to the bottom of the card. "save
changes" — disabled until dirty. Saved-state shows emerald check +
"saved just now" for 2s then fades.

**Right column — campaigns in this project:**

Stacked list, same shape as Surface 2's project rows but smaller:

- Each campaign row: `rounded-xl border border-border/60
  bg-surface-raised/40 p-4`.
- Top line: campaign name (`text-h2-sm`) + status pill on the right
  (emerald "active" / amber "ended" / muted "no window" / dim "archived").
- Second line: objective (`text-fg-muted text-body-sm`, line-clamp-1), or
  `text-fg-subtle italic` "no objective set" placeholder.
- Third line: date window in `font-mono text-fg-subtle text-body-sm`
  (`nov 14 – dec 24`, or `started nov 14`, or empty).
- Fourth line: `N investigations · last activity 2h ago`.
- Right edge: overflow `⋯` (rename, edit, archive, set as active).

At top of column: gradient CTA `+ new campaign`. At bottom: archived
campaigns section, collapsed by default.

### Surface 4 — Campaign edit drawer

Slides in from the right (480px wide) when clicking a campaign row or
"new campaign". Backdrop: `bg-fg/40 backdrop-blur-sm`, matching the
command palette overlay.

Header: color dot + project name (read-only context) → eyebrow. H2:
editable campaign name. Close button top-right.

Body, single column, `space-y-5`:

1. **Objective.** Textarea, placeholder "what does success look like for
   this campaign? (optional)". Counter `0 / 500` bottom-right of the
   field.
2. **Date window.** Two date inputs side-by-side: "starts on" / "ends
   on", both optional, both styled as `bg-surface-sunken/40 rounded-lg`.
   Inline helper text below: "leave blank for ongoing campaigns."
3. **Read-only summary** (only on edit, not new): `N investigations ·
   created mar 14 · last activity 2h ago`.

Footer (sticky bottom): destructive ghost `archive` on the left, primary
gradient `save` on the right. On new-campaign, left side is `cancel`.

### Surface 5 — First-run onboarding (replaces the current brand-profile wizard)

Three-step wizard. Same card shell as today's onboarding (`rounded-2xl
border-border/60 bg-surface-raised/40`, centered, ~640px wide). Top
progress: three dots, current dot is `bg-brand` and ~2x wider; completed
dots are `bg-fg-subtle`; pending are `bg-border`.

**Step 1 — name your project.**

- Eyebrow: `welcome to paidpilot · step 1 of 3`
- H1: "what brand are we working on?"
- Sub: "every investigation is grounded in a brand context. you can add
  more brands later."
- Single input: "brand name" (this becomes the project name).
- Helper microcopy: "this is what we'll call your first project. usually
  your company name."
- Footer: gradient `continue` (disabled until non-empty), text-only `i'll
  set this up later` on the left (creates project as "My Brand" and skips
  through with defaults).

**Step 2 — brand context.**

- Eyebrow: `step 2 of 3`
- H1: "tell us a bit about [project name]."
- Sub: "this grounds every answer paidpilot gives you."
- Full brand-profile form inlined (same fields as Surface 3 left column:
  company website, ICP, target CAC + ROAS, channels chips, voice).
- Footer: `back` (ghost) + `continue` (gradient).

**Step 3 — your first campaign.**

- Eyebrow: `step 3 of 3`
- H1: "what are you working on right now?"
- Sub: "campaigns organise investigations by goal. start with whatever's
  on your plate this week. we've pre-filled a 'general' campaign you can
  use for anything that doesn't fit."
- Two cards side-by-side, radio-selectable:
  - **(default selected)** "use general" — small card, dim, "we'll add a
    'General' campaign you can use for anything one-off."
  - "name a campaign" — expands inline to show name + objective +
    optional date window inputs.
- Footer: `back` + gradient `finish setup` (CTA copy changes based on
  the choice).

Completion: card swaps to a success state — emerald check ring, "you're
set. opening [project name] · [campaign name]…" then 600ms fade to the
homepage with the switcher pre-loaded to this campaign.

### What I don't need designed

- **Investigations list** (the sidebar in `/investigations`) — same as
  today, just filtered by active campaign. No visual change needed unless
  you want a campaign-name eyebrow above the title list.
- **Investigation detail / chat surface** — no change.
- **Plays / Calculators pages** — no change, they just scope to active
  campaign automatically.
- **Settings root page** — minor: today's "brand profile" section moves
  out to `/settings/projects/:id`. Settings root keeps account, model
  selector, theme.

### Notes for the generations

- All copy is lowercase except proper nouns.
- No iconography from the AI-buzzword era (no Sparkles, no shimmer). Use
  Lucide's `FolderKanban`, `Target`, `Calendar`, `MoreHorizontal`, `Plus`,
  `Archive`, `ChevronDown` / `ChevronRight`, `Check`.
- Mobile: switcher popover becomes a full-screen sheet sliding up from
  the bottom. Project detail two-column collapses to single-column.
  Campaign edit drawer becomes a full-screen modal.
- Reduced-motion users: cross-fade only, no slide. All `transition` rules
  wrapped in `motion-safe:`.

---

## Prompt 2 — collapsible sidebar (addendum)

The left sidebar in the Prompt 1 designs is correct as the expanded
default. Add a collapsed (icon-only) state and the transition between
them.

### Two states

**Expanded (default, 240px wide):**

- Top: project + campaign label block (`Project` eyebrow + name) as in
  current designs.
- Below: primary CTA `+ new run` (gradient violet→blue, full width,
  `rounded-lg`).
- Below: nav list with icon (16px Lucide) + label, vertical stack, 4–8px
  between items, lowercase. Active item: subtle 2px violet left-accent
  border + `bg-brand/5` background + `text-fg`.
- Bottom: help + docs as ghost rows. Sidebar background
  `bg-surface-container-low` (matches current designs).

**Collapsed (64px wide):**

- Top: 32px square color-dot tile representing the active project (no
  text). Tooltip on hover: "Allbirds · Q4 holiday push".
- Below: `+ new run` becomes a 36px square icon button (Lucide `Plus`),
  gradient background preserved, centered. Tooltip: "new run".
- Below: nav list keeps the icons only, centered, 8px vertical rhythm.
  Active item: 2px violet left-accent border + `bg-brand/5`, no
  background-pill expansion. Tooltip on hover: the label.
- Bottom: help + docs as 36px square icons (Lucide `HelpCircle`,
  `BookOpen`).

### Toggle

A 24px collapse chevron sits at the **bottom-right edge of the sidebar**,
vertically centered on the divider line. Icon: Lucide `PanelLeftClose`
when expanded → `PanelLeftOpen` when collapsed. Subtle background
`bg-surface-container rounded-full`, only visible on sidebar hover
(always visible on touch devices). Click toggles state. Keyboard
shortcut: `[` (matches Linear / VS Code convention).

### Transition

- Width animates 240px ↔ 64px over **160ms**, `ease-out`. Labels fade out
  at 0–60ms when collapsing, fade in at 100–160ms when expanding. No
  content reflow shimmer — labels are absolutely positioned during the
  transition.
- `motion-safe:` wrap. Reduced-motion users get an instant swap, no
  animation.

### Tooltips (collapsed only)

Tooltip appears 300ms after hover, positioned to the right of the icon,
8px gap. Shape: `rounded-md bg-surface-container-high border-border/60
px-2.5 py-1.5 text-body-sm`. Content varies per row:

- Project tile: `<project name> · <active campaign name>`
- `+ new run`: `new run`
- Nav rows: the label only (e.g. `investigations`)
- Help / docs: `help` / `docs`

Tooltips never appear on the expanded state.

### Persistence + responsive

- State stored in `localStorage` as `paidpilot-sidebar-collapsed`
  (boolean).
- Below `lg` breakpoint (<1024px): sidebar is hidden entirely. A
  hamburger button appears in the top-nav left edge → opens the expanded
  sidebar as a **slide-over drawer** (`bg-fg/40 backdrop-blur-sm`
  overlay, closes on outside click). No collapsed icon-bar on mobile;
  either drawer or nothing.

### What the collapsed state does *not* do

- It does not auto-collapse based on viewport width. Above `lg` the user
  owns the choice.
- It does not show secondary sub-navigation expanded inside icons (no
  fly-out menus on hover). Just tooltips. Click the icon to navigate,
  that's it.
- It does not hide the campaign switcher in the top nav. The switcher is
  the source of truth for active context, regardless of sidebar state.

### Mock states needed

1. **Sidebar collapsed — home page in view.** Active campaign chip in
   top-nav, sidebar at 64px with `home` icon active, tooltip hovering on
   `investigations`.
2. **Sidebar collapsed → expanding (mid-transition frame at ~80ms).**
   Width ~152px, labels at 40% opacity, chevron just starting to flip.
3. **Mobile drawer open.** Hamburger in top-nav, expanded sidebar slid
   in from left, dimmed backdrop, rest of page visible behind.

---

## Notes for re-running these prompts

- **Reconciliation:** the first generation invented secondary nav labels
  (`overview / segments / analytics / settings`). Our real nav is
  `home / investigations / plays / calculators / settings`. Substitute
  before generating, or leave Stitch's labels as aspirational and decide
  in code review.
- **Visual reference image** in the campaign edit drawer (the shoe photo
  in the first generation) is a nice idea but out of scope until users
  can attach assets to campaigns. Skip for v1.
- **Tabs vs. two-column** on the project detail page: the first
  generation chose tabs (`campaigns | brand profile`) which reads
  cleaner than my proposed two-column. Adopt the tabs version.
