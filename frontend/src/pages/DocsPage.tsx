/**
 * /docs — feature-by-feature documentation.
 *
 * Sectioned guide covering every user-facing surface in PaidPilot.
 * Built on the same primitives as the rest of the app: PageHeader,
 * eyebrow + h2 + body, code/kbd chips. Single-page on mobile / tablet;
 * adds a sticky table-of-contents rail on `lg:` and up. Scroll-spy
 * highlights the active section as you read.
 *
 * Content order mirrors how a marketer actually adopts the product —
 * start here → building blocks → investigations → tools → settings —
 * not the route order in the app. Every feature lands in one (and
 * only one) section so search-by-symbol works (grep "model" → one hit).
 */
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import {
  ArrowUp,
  BookOpen,
  Calculator,
  CornerDownLeft,
  FolderKanban,
  Image as ImageIcon,
  Info,
  Keyboard,
  ListChecks,
  Menu,
  Moon,
  Plug,
  PlayCircle,
  Quote,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  SquareSlash,
  Target,
  UserCircle2,
  Wand2,
  X,
  Youtube,
  Zap,
} from 'lucide-react';
import clsx from 'clsx';

interface Props {
  darkMode: boolean;
}

/* -------------------------------------------------------------------- */
/* Section registry — single source of truth for content + TOC          */
/* -------------------------------------------------------------------- */

/** Groups drive the floating bottom-right "guide nav" popover. Same
 *  order as STITCH_PROMPTS_DOCS.md so the popover reads as a
 *  category-grouped index. */
type SectionGroup =
  | 'start'
  | 'building-blocks'
  | 'conversations'
  | 'tools'
  | 'connections'
  | 'navigation'
  | 'settings';

const GROUP_LABEL: Record<SectionGroup, string> = {
  'start': 'start here',
  'building-blocks': 'building blocks',
  'conversations': 'conversations',
  'tools': 'tools',
  'connections': 'connections',
  'navigation': 'navigation',
  'settings': 'settings',
};

interface Section {
  id: string;
  eyebrow: string;
  title: string;
  icon: ReactNode;
  body: ReactNode;
  /** Optional aspect-video placeholder label rendered above the body
   *  (mirrors the Stitch screenshot-placeholder convention). Only the
   *  marquee sections that benefit visually carry one; everything else
   *  goes straight from step label → h2 → body. */
  placeholder?: string;
  /** Path to a real screenshot for this section. When set, the
   *  aspect-video block renders the image instead of the placeholder
   *  text. Path is relative to the public/ directory — drop files in
   *  `frontend/public/docs/` and reference them as `/docs/<file>.png`. */
  imageSrc?: string;
  /** Alt text for the screenshot when imageSrc is set. Falls back to
   *  the section title if omitted. */
  imageAlt?: string;
  /** Which group the floating TOC slots this section under. */
  group: SectionGroup;
}

const STORAGE_KEY_SCENARIO = 'paidpilot.calc.scenarios.v1';

function buildSections(): Section[] {
  return [
    {
      id: 'getting-started',
      eyebrow: 'start here',
      title: 'three minutes',
      icon: <BookOpen className="w-4 h-4" />,
      group: 'start',
      placeholder: 'dashboard onboarding screenshot',
      imageSrc: '/docs/getting-started.jpg',
      imageAlt: 'paidpilot operational hub with active campaign scope and recent investigations',
      body: (
        <>
          <P>
            paidpilot is an ai co-pilot for in-house performance marketers. you
            describe your brand once; every answer, play, calculator scenario,
            and report is grounded in that brand context, scoped to a
            real-world campaign, and cited from sources you can click through
            to verify.
          </P>
          <Ol>
            <li>
              create a project (= your brand). fill out the brand profile —
              icp, channels, target cac, voice. this grounds every answer.
            </li>
            <li>
              open the project's default <em>general</em> campaign, or add one
              with a date window + objective.
            </li>
            <li>
              start an investigation, run a play, or open a calculator from
              the sidebar. all three are scoped to the active campaign.
            </li>
          </Ol>
          <Callout icon={<Info className="w-3.5 h-3.5" />}>
            <strong className="text-fg">no investigations is fine.</strong>{' '}
            you can run plays and calculators without ever opening the chat —
            different operators use the product differently.
          </Callout>
        </>
      ),
    },
    {
      id: 'projects-campaigns',
      eyebrow: 'building blocks',
      title: 'projects + campaigns',
      icon: <FolderKanban className="w-4 h-4" />,
      group: 'building-blocks',
      placeholder: 'project + campaign hierarchy view',
      imageSrc: '/docs/projects-campaigns.jpg',
      imageAlt: 'projects + campaigns list with status filter and metrics columns',
      body: (
        <>
          <P>
            <strong className="text-fg">project</strong> = one brand. holds
            the brand profile and acts as the unit of access (who can see what
            in a future team workspace). agencies, holdcos, and side-projects
            can run multiple projects from one account.
          </P>
          <P>
            <strong className="text-fg">campaign</strong> = a real-world
            marketing push inside a project — q4 holiday, black friday, lifecycle
            revamp, brand relaunch. has its own objective text and optional
            start / end dates. every investigation, play, calculator scenario,
            and creative anchors to a campaign so context doesn't leak between
            pushes.
          </P>
          <P>
            switch the active campaign from the sidebar pill at the top of the
            window, or from <DocLink to="/projects">/projects</DocLink>. the
            currently active one always shows below the operational state line
            on home.
          </P>
        </>
      ),
    },
    {
      id: 'brand-profile',
      eyebrow: 'context',
      title: 'brand profile',
      icon: <Target className="w-4 h-4" />,
      group: 'building-blocks',
      body: (
        <>
          <P>
            the brand profile is the single most leveraged piece of context in
            paidpilot — it's prepended to every system prompt so the model
            never has to guess who you are, what you sell, or which numbers to
            care about.
          </P>
          <P>fields:</P>
          <Ul>
            <li>
              <strong className="text-fg">company name + website</strong> —
              identity, used in copy + research lookups
            </li>
            <li>
              <strong className="text-fg">icp description</strong> — who you
              sell to, in operator language. paragraph or bullets both work.
            </li>
            <li>
              <strong className="text-fg">primary channels</strong> — meta,
              google, tiktok, klaviyo, etc. drives which best-practice the
              model leans on by default.
            </li>
            <li>
              <strong className="text-fg">target CAC</strong> +{' '}
              <strong className="text-fg">target ROAS</strong> — the model
              flags when a tactic would push you off-target.
            </li>
            <li>
              <strong className="text-fg">voice guidelines</strong> — for any
              copy outputs (ad headlines, lifecycle emails, briefs).
            </li>
            <li>
              <strong className="text-fg">current campaigns summary</strong> —
              optional, freeform. landscape note the model can reference.
            </li>
          </Ul>
          <P>
            edit it from the project's <em>brand profile</em> tab. each
            project keeps its own — switching projects swaps the entire
            grounding context.
          </P>
        </>
      ),
    },
    {
      id: 'investigations',
      eyebrow: 'conversations',
      title: 'investigations',
      icon: <Search className="w-4 h-4" />,
      group: 'conversations',
      placeholder: 'investigation chat surface',
      imageSrc: '/docs/investigations.jpg',
      imageAlt: 'investigation empty state with four brand-aware starter prompts (benchmark, creative, plan, audit)',
      body: (
        <>
          <P>
            an <strong className="text-fg">investigation</strong> is a chat
            session anchored to a campaign. type a question, the model
            searches the web (citations rolled in), composes an answer using
            your brand + campaign context, and streams it token-by-token.
          </P>
          <P>per turn you'll see:</P>
          <Ul>
            <li>
              <strong className="text-fg">live searching indicator</strong> —
              the urls being fetched as they come in, before the answer starts
              streaming
            </li>
            <li>
              <strong className="text-fg">streaming answer</strong> with a
              soft cursor; full markdown rendering as it arrives
            </li>
            <li>
              <strong className="text-fg">inline citations</strong> — every
              factual claim gets a <Chip>[N]</Chip> pill linking to its source
              (more in the <a href="#citations" className="text-brand hover:underline">citations</a> section)
            </li>
            <li>
              <strong className="text-fg">next-step chips</strong> — three
              short questions the model thinks you'd naturally ask next; click
              to fire as a follow-up (covered below)
            </li>
            <li>
              <strong className="text-fg">copy + regenerate</strong> — both
              live below the answer once streaming finishes
            </li>
          </Ul>
          <P>
            an investigation lives forever — sessions sidebar on the left lets
            you rename, archive, export as markdown, or full-text search.
          </P>
        </>
      ),
    },
    {
      id: 'improve-prompt',
      eyebrow: 'sharpen the ask',
      title: 'improve prompt',
      icon: <Sparkles className="w-4 h-4" />,
      group: 'conversations',
      body: (
        <>
          <P>
            type a rough draft in the composer ("how do i scale ads"), click
            the brand-tinted <strong className="text-fg">improve</strong>{' '}
            button next to the URL action, and the model rewrites your draft
            into a sharper question grounded in your active campaign's brand
            profile + objective. the textarea content swaps in place so you
            can edit it further or send as-is.
          </P>
          <P>what the improver does:</P>
          <Ul>
            <li>
              names the specific channels (meta, klaviyo, google ads) and
              metrics (CAC, ROAS, CPP) implied by your brand profile so the
              answer has something concrete to anchor on
            </li>
            <li>
              keeps it ONE OR TWO sentences — long prompts hurt the answer
              model's focus
            </li>
            <li>
              preserves your intent — it sharpens the framing, never replaces
              the topic
            </li>
            <li>
              references the active campaign's time horizon when the draft
              implies "when" but doesn't say it explicitly ("Q4" vs "later
              this year")
            </li>
          </Ul>
          <P>
            the improve button only appears when (1) you've typed at least
            four characters and (2) you're inside a real campaign scope. if
            the button is missing, switch into a campaign first from the
            top-nav switcher.
          </P>
          <Callout icon={<Info className="w-3.5 h-3.5" />}>
            <strong className="text-fg">runs on the small + fast model</strong>{' '}
            (llama-3.2-3b) so the rewrite lands in ~2s. doesn't burn answer-
            quality budget — your selected chat model still does the actual
            investigation.
          </Callout>
        </>
      ),
    },
    {
      id: 'models',
      eyebrow: 'choose your engine',
      title: 'model selection',
      icon: <Sparkles className="w-4 h-4" />,
      group: 'conversations',
      body: (
        <>
          <P>
            the model dropdown lives in the top-right of the investigation
            header. your choice is per-user (not per-conversation) and
            persists across sessions. every option is grounded with the same
            brand + campaign context — only the engine changes.
          </P>
          <ModelShowcase />
          <P className="mt-5">
            two other models run on fixed, hidden paths and aren't user-
            selectable: the search reranker (qwen3, fast structured output)
            and the next-step suggester (llama-3.2-3b, tiny + fast for 3
            short questions). you don't need to think about them.
          </P>
          <Callout icon={<Info className="w-3.5 h-3.5" />}>
            <strong className="text-fg">when in doubt → gpt-oss-120b.</strong>{' '}
            it's the default for a reason: best balance of answer quality and
            speed across the operator-question taxonomy.
          </Callout>
        </>
      ),
    },
    {
      id: 'citations',
      eyebrow: 'sources',
      title: 'citation drawer',
      icon: <Quote className="w-4 h-4" />,
      group: 'conversations',
      body: (
        <>
          <P>
            every <Chip>[N]</Chip> pill in an answer is a button. click it and
            the citation drawer slides in from the right with:
          </P>
          <Ul>
            <li>the source title + domain</li>
            <li>
              the exact paragraph the model was conditioned on (the "quoted
              excerpt" — the snippet from the search step, not a hallucinated
              quote)
            </li>
            <li>an "authoritative" chip when the source ranks high on our authority list</li>
            <li>"open source" gradient button to read the full page in a new tab</li>
            <li>
              <Kbd>←</Kbd> / <Kbd>→</Kbd> arrow keys to step through every
              citation in that turn
            </li>
          </Ul>
          <P>
            the conversation header carries a{' '}
            <span className="inline-flex items-center gap-1 mx-0.5 align-middle">
              <Quote className="w-3 h-3 text-fg-muted" />
              <span className="font-mono text-[11px] text-fg-muted">citations · N</span>
            </span>{' '}
            chip — click it to open the drawer on a deduplicated, conversation-
            wide view of every source you've cited so far. great for "wait,
            where did that number come from three turns ago?".
          </P>
        </>
      ),
    },
    {
      id: 'videos',
      eyebrow: 'sources',
      title: 'videos drawer',
      icon: <Youtube className="w-4 h-4" />,
      group: 'conversations',
      body: (
        <>
          <P>
            when the search step surfaces relevant youtube videos (long-form
            only — shorts are filtered out), they collect in the videos
            drawer. open it from the{' '}
            <span className="font-mono text-[11px] text-fg-muted">videos · N</span>{' '}
            chip in the conversation header.
          </P>
          <P>
            the drawer renders a grid of thumbnails with titles. clicking a
            thumbnail opens the video on youtube in a new tab — we never embed
            the player to keep the page light.
          </P>
        </>
      ),
    },
    {
      id: 'next-steps',
      eyebrow: 'follow-ups',
      title: 'next-step chips',
      icon: <CornerDownLeft className="w-4 h-4" />,
      group: 'conversations',
      body: (
        <>
          <P>
            once an assistant turn finishes streaming, three short follow-up
            questions appear below the answer as chips. they're generated by a
            tiny fast model (llama-3.2-3b) based on the turn you just got.
            clicking a chip fires the question as your next turn — no edit
            step, no extra confirmation. faster than typing for the obvious
            follow-up.
          </P>
          <P>
            chips only show on the most recent turn so older turns stay quiet.
            cached server-side after first generation, so revisiting a session
            doesn't re-run the model.
          </P>
        </>
      ),
    },
    {
      id: 'plays',
      eyebrow: 'library',
      title: 'plays',
      icon: <PlayCircle className="w-4 h-4" />,
      group: 'tools',
      body: (
        <>
          <P>
            plays are pre-written prompts that ask for a specific deliverable:
            creative brief, channel allocation plan, a/b test spec, lifecycle
            audit, launch playbook, etc. they run as a single turn in an
            investigation — same citations, same grounding, structured output.
          </P>
          <P>two ways to run one:</P>
          <Ol>
            <li>
              open <DocLink to="/plays">/plays</DocLink> within the active
              campaign — picks from the full catalog, fills out the play's
              required inputs (one form per play), runs as a new session.
            </li>
            <li>
              from inside an existing investigation: type <Chip>/</Chip> in
              the composer to open the slash menu (more below).
            </li>
          </Ol>
          <P>
            "recently used" at the top of <DocLink to="/plays">/plays</DocLink>{' '}
            shows what you've run lately, scoped to the active campaign. the
            home page's right rail surfaces the top 3 too.
          </P>
        </>
      ),
    },
    {
      id: 'slash-menu',
      eyebrow: 'composer',
      title: 'slash menu + url paste',
      icon: <SquareSlash className="w-4 h-4" />,
      group: 'tools',
      body: (
        <>
          <P>
            the chat composer recognises two shortcuts:
          </P>
          <Ul>
            <li>
              <Chip>/</Chip> at the start of the line — opens the play picker
              inline. type to filter; <Kbd>↑</Kbd> / <Kbd>↓</Kbd> to navigate;{' '}
              <Kbd>↵</Kbd> to select. picked plays mount as a "play chip"
              above the input — type your question, hit send, and the play's
              system instructions are applied to that turn.
            </li>
            <li>
              <strong className="text-fg">paste a url</strong> — the composer
              detects it and offers to "use as source". the page content gets
              fetched + appended to the search context for that turn. handy
              for "here's a competitor's page, what's their angle?".
            </li>
          </Ul>
          <P>
            both work mid-message — you can drop a play chip + paste a url +
            type a question, all in one turn.
          </P>
        </>
      ),
    },
    {
      id: 'calculators',
      eyebrow: 'math',
      title: 'calculators + scenarios',
      icon: <Calculator className="w-4 h-4" />,
      group: 'tools',
      body: (
        <>
          <P>four calculators ship today:</P>
          <Ul>
            <li>
              <strong className="text-fg">CAC payback</strong> — months to
              break even on a customer given CAC + monthly contribution
              margin
            </li>
            <li>
              <strong className="text-fg">ROAS → margin</strong> — required
              ROAS to hit a target net margin given COGS + opex split
            </li>
            <li>
              <strong className="text-fg">A/B sample size</strong> — visitors
              per variant for a given baseline conversion, minimum detectable
              effect, and significance level. uses Acklam's invNormal for an
              exact normal-approximation calc, no rounding.
            </li>
            <li>
              <strong className="text-fg">blended channel efficiency</strong>{' '}
              — channel mix optimiser: enter per-channel spend + CAC + cap,
              get the blended CAC you'd hit
            </li>
          </Ul>
          <P>
            every calculator persists <strong className="text-fg">scenarios</strong>{' '}
            — name a run, save it, open it later for comparison. side-by-side
            compare lifts to a panel that shows deltas vs. the baseline you
            picked. stored locally per browser for now (no DB sync); lifts to
            per-project storage in a future release.
          </P>
        </>
      ),
    },
    {
      id: 'creatives',
      eyebrow: 'library',
      title: 'creatives',
      icon: <ImageIcon className="w-4 h-4" />,
      group: 'tools',
      placeholder: 'campaign creatives library',
      body: (
        <>
          <P>
            each campaign has its own creatives library — upload pdfs and
            images (briefs, ad mocks, comp swipe files, brand decks) so you
            can attach them to investigations later, or just hold them in one
            place per campaign instead of fishing through google drive.
          </P>
          <P>
            drag-and-drop or use the upload button. 25 MB per file. supported
            types: pdf, png, jpeg, webp, gif, svg. files upload directly to
            object storage (uploadthing or r2 depending on deploy config) —
            the backend never sees the bytes.
          </P>
          <P>
            pdf tiles render the actual first page as a thumbnail; images
            render inline. click any tile to preview. metadata line under
            each shows file size + upload time.
          </P>
        </>
      ),
    },
    {
      id: 'studio',
      eyebrow: 'creative generation',
      title: 'studio',
      icon: <Wand2 className="w-4 h-4" />,
      group: 'tools',
      placeholder: 'studio composer + timeline',
      imageSrc: '/docs/studio.jpg',
      imageAlt: 'studio composer with brand-context toggle on and two saved generated creatives',
      body: (
        <>
          <P>
            <strong className="text-fg">studio</strong> generates ad
            creatives from a text prompt — three variants per click, rendered
            by cloudflare's flux model in ~10-15 seconds. unlike a one-shot
            image-gen tool, every batch is anchored to the active campaign
            and the prompt is optionally <em>baked</em> with your brand voice
            + campaign objective so the output looks on-brand.
          </P>
          <P>the composer carries:</P>
          <Ul>
            <li>
              <strong className="text-fg">suggest from campaign</strong> — a
              brand-tinted button that drafts a prompt for you from the
              campaign's brand profile + objective. type your own draft and
              it flips to "refine from campaign" instead.
            </li>
            <li>
              <strong className="text-fg">aspect-ratio chips</strong> — 1:1
              (meta feed), 9:16 (reels / tiktok), 1.91:1 (link preview), 4:5
              (instagram portrait). currently a prompt-level hint since the
              hosted flux model renders at ~1024×1024 natively; final crop
              happens in your design tool.
            </li>
            <li>
              <strong className="text-fg">style chips</strong> — photo,
              illustration, minimal, 3d. modifies the rendering style; null
              means "let the model pick".
            </li>
            <li>
              <strong className="text-fg">brand + campaign toggle</strong> —
              when on, the server appends a distilled context phrase
              (company, voice, objective) to the prompt before flux sees it.
              default on; flip off for bare prompts.
            </li>
          </Ul>
          <P>
            after generation, the three variants land in a{' '}
            <strong className="text-fg">review · pick what to keep</strong>{' '}
            timeline row. each tile gets a save (emerald bookmark) and a
            discard (rose X) button in the top-right corner; hover the tile
            to copy the prompt or download. saved tiles flip to a "saved"
            chip in place — you don't lose them on the next generate.
            discards delete from storage in the background; no DB row gets
            written until you save.
          </P>
          <P>
            saved variants land in the campaign's{' '}
            <DocLink to="/projects">creatives library</DocLink> alongside any
            pdfs / images you uploaded manually. they carry the prompt + the
            model id in their metadata so you can find them later via
            full-text search.
          </P>
        </>
      ),
    },
    {
      id: 'integrations',
      eyebrow: 'connections',
      title: 'integrations',
      icon: <Plug className="w-4 h-4" />,
      group: 'connections',
      placeholder: 'integrations grid — slack, meta, more',
      body: (
        <>
          <P>
            connect external platforms at{' '}
            <DocLink to="/settings/integrations">/settings/integrations</DocLink>.
            today: meta ads (oauth, ad-account linking per project). coming
            soon: google ads, slack, notion, discord, hubspot, linear, zapier,
            klaviyo, shopify.
          </P>
          <P>
            once connected, the active campaign's last-7d spend / CPP / ROAS
            gets appended to every system prompt — answers reference{' '}
            <em>your</em> numbers, not generic best-practice. the home page's
            CAC trend tile (planned) reads from the same data.
          </P>
          <P>
            integrations are grouped by purpose: <strong className="text-fg">ads</strong>,{' '}
            <strong className="text-fg">lifecycle</strong>,{' '}
            <strong className="text-fg">commerce</strong>,{' '}
            <strong className="text-fg">crm</strong>,{' '}
            <strong className="text-fg">collab</strong>,{' '}
            <strong className="text-fg">ops</strong>. hit the "notify me"
            button on any coming-soon row to vote — we ship the next one
            based on demand.
          </P>
        </>
      ),
    },
    {
      id: 'navigation',
      eyebrow: 'getting around',
      title: 'sidebar, palette, sessions',
      icon: <ListChecks className="w-4 h-4" />,
      group: 'navigation',
      body: (
        <>
          <P>
            the persistent left sidebar holds primary nav: home,
            investigations, plays, calculators, projects, integrations,
            settings, plus help + docs at the bottom. collapse to a 64 px
            icon rail with <Kbd>[</Kbd> or the toggle pill — every row gets a
            hover tooltip when collapsed.
          </P>
          <P>
            inside an investigation, a second narrower sidebar lists every
            session in the current campaign with full-text search. rename
            (double-click the title), archive (per-row menu), export as
            markdown, or open in a new tab from there. collapses independently
            of the primary sidebar so you can reclaim ~580 px on a 1440-wide
            screen.
          </P>
          <P>
            the <strong className="text-fg">command palette</strong> — open
            with <Kbd>⌘</Kbd>+<Kbd>K</Kbd> — is the fastest way to jump
            anywhere. groups: investigations, plays, calculators, jump-to
            shortcuts. recognises <Kbd>G</Kbd> chord sequences linear-style
            (<Kbd>G</Kbd>+<Kbd>D</Kbd> → home, <Kbd>G</Kbd>+<Kbd>I</Kbd> →
            investigations, etc.).
          </P>
        </>
      ),
    },
    {
      id: 'shortcuts',
      eyebrow: 'keyboard',
      title: 'shortcuts',
      icon: <Keyboard className="w-4 h-4" />,
      group: 'navigation',
      body: (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-body-sm">
          <ShortcutRow keys={['⌘', 'K']} label="open command palette" />
          <ShortcutRow keys={['⌘', 'N']} label="new investigation" />
          <ShortcutRow keys={['⌘', 'E']} label="open calculators" />
          <ShortcutRow keys={['⌘', 'P']} label="open plays" />
          <ShortcutRow keys={['[']} label="collapse / expand sidebar" />
          <ShortcutRow keys={['/']} label="open slash menu in composer" />
          <ShortcutRow keys={['Esc']} label="close drawer / modal / palette" />
          <ShortcutRow keys={['←']} label="prev citation (drawer open)" />
          <ShortcutRow keys={['→']} label="next citation (drawer open)" />
          <ShortcutRow keys={['G', 'D']} label="jump to home" />
          <ShortcutRow keys={['G', 'I']} label="jump to investigations" />
          <ShortcutRow keys={['G', 'P']} label="jump to plays" />
        </div>
      ),
    },
    {
      id: 'settings',
      eyebrow: 'preferences',
      title: 'settings + theme',
      icon: <SettingsIcon className="w-4 h-4" />,
      group: 'settings',
      body: (
        <>
          <P>
            <DocLink to="/settings">/settings</DocLink> holds account-level
            preferences: display name, email (from clerk), preferred chat
            model, theme. brand context lives per-project, not here.
          </P>
          <P>
            <strong className="text-fg inline-flex items-center gap-1.5">
              <Moon className="w-3.5 h-3.5" />
              theme
            </strong>{' '}
            — dark-first per the operator-tool aesthetic. switch to light from
            account settings; preference persists in localStorage and syncs
            across tabs in the same browser. the toggle script runs before
            react mounts so there's no flash of unstyled content.
          </P>
          <P>
            <strong className="text-fg inline-flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              model
            </strong>{' '}
            — covered in the{' '}
            <a href="#models" className="text-brand hover:underline">
              model selection
            </a>{' '}
            section. change here or from the dropdown in any investigation
            header (both write to the same backing store).
          </P>
        </>
      ),
    },
    {
      id: 'account',
      eyebrow: 'identity',
      title: 'account + sign-out',
      icon: <UserCircle2 className="w-4 h-4" />,
      group: 'settings',
      body: (
        <>
          <P>
            authentication is handled by clerk. your avatar lives in the
            top-right corner — click it for the user menu (manage account,
            sign out, switch accounts).
          </P>
          <P>
            sign-in via email + password or google oauth. if you sign in on
            a new browser, no extra steps — your projects, campaigns,
            sessions, brand profiles, and creatives all follow you (anchored
            to your clerk user id, not the device).
          </P>
          <P>
            if the backend ever rejects a token mid-session (token rotation,
            instance migration, etc.), the app signs you out and bounces you
            to the sign-in page automatically — no stuck screens.
          </P>
        </>
      ),
    },
    {
      id: 'help',
      eyebrow: 'still stuck?',
      title: 'help',
      icon: <Info className="w-4 h-4" />,
      group: 'settings',
      body: (
        <P>
          click <strong className="text-fg">help</strong> at the bottom of
          the sidebar — it opens an email pre-filled with the page you were
          on, so support gets context without you having to describe it.
          alternatively, email{' '}
          <a
            href="mailto:hello@paidpilot.app"
            className="text-brand hover:underline"
          >
            hello@paidpilot.app
          </a>{' '}
          directly.
        </P>
      ),
    },
  ];
}

/* -------------------------------------------------------------------- */
/* Page                                                                  */
/* -------------------------------------------------------------------- */

export function DocsPage(_props: Props) {
  const sections = useMemo(() => buildSections(), []);
  void STORAGE_KEY_SCENARIO;

  /** Search filter — title-match only. Empty query → show all. Step
   *  numbers stay ABSOLUTE so a filter doesn't reorder the guide. */
  const [search, setSearch] = useState('');
  const visibleIds = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return new Set(sections.map(s => s.id));
    return new Set(
      sections
        .filter(s => s.title.toLowerCase().includes(q) || s.eyebrow.toLowerCase().includes(q))
        .map(s => s.id),
    );
  }, [search, sections]);

  // Cmd+K / Ctrl+K focuses the search input.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const total = sections.length;

  return (
    <div className="max-w-[800px] mx-auto px-5 sm:px-6 -mt-4 sm:-mt-6">
      {/* Hero */}
      <header className="text-center mb-32 pt-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-3">
          official walkthrough
        </p>
        <h1 className="font-display text-5xl text-fg mb-4 lowercase">
          how paidpilot works.
        </h1>
        <p className="text-body-lg text-fg-muted max-w-xl mx-auto mb-8 leading-relaxed">
          follow this guided sequence to learn the operator's workspace for
          performance marketing.
        </p>
        <div className="relative max-w-lg mx-auto">
          <Search
            aria-hidden
            className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle"
          />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search the guide…"
            className="w-full bg-surface-raised/40 border border-border/60 rounded-full py-3 pl-12 pr-24 text-body-base text-fg placeholder:text-fg-subtle focus:outline-none focus:border-brand/40 focus:shadow-[0_0_18px_rgba(124,92,255,0.15)] transition-all"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </div>
        </div>
      </header>

      {/* Sections */}
      <div className="space-y-32 mb-32">
        {sections.map((s, i) => {
          if (!visibleIds.has(s.id)) return null;
          return (
            <SectionBlock
              key={s.id}
              section={s}
              step={i + 1}
              total={total}
            />
          );
        })}
        {visibleIds.size === 0 && (
          <p className="text-center text-body-base text-fg-muted">
            no sections match "{search}".{' '}
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-brand hover:underline"
            >
              clear search
            </button>
          </p>
        )}
      </div>

      {/* Final CTA */}
      <FinalCTA />

      {/* Last-updated footer */}
      <p className="mt-8 mb-12 text-center font-mono text-[10px] text-fg-subtle uppercase tracking-widest">
        last updated · 2026-05-30
      </p>

      {/* Floating guide nav */}
      <FloatingGuideNav sections={sections} />
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Section block — centered timeline row                                 */
/* -------------------------------------------------------------------- */

function SectionBlock({
  section,
  step,
  total,
}: {
  section: Section;
  step: number;
  total: number;
}) {
  return (
    <section id={section.id} className="scroll-mt-24">
      <div className="text-center mb-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brand/80">
          step {String(step).padStart(2, '0')} of {String(total).padStart(2, '0')}
        </p>
        <h2 className="font-display text-4xl text-fg mt-2 lowercase">
          {section.title}
        </h2>
      </div>

      {(section.placeholder || section.imageSrc) && (
        <div className="w-full aspect-video rounded-xl border border-border/40 bg-surface-sunken/40 mb-8 grid place-items-center relative overflow-hidden">
          {section.imageSrc ? (
            <img
              src={section.imageSrc}
              alt={section.imageAlt ?? section.title}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <>
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(45deg, transparent, transparent 12px, rgba(255,255,255,0.012) 12px, rgba(255,255,255,0.012) 13px)',
                }}
              />
              <span className="font-mono text-[11px] text-fg-subtle uppercase tracking-widest relative">
                {section.placeholder}
              </span>
            </>
          )}
        </div>
      )}

      <div className="space-y-3">{section.body}</div>

      <div className="mt-12 flex justify-center">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="inline-flex items-center gap-1.5 font-mono text-[10px] text-fg-subtle hover:text-fg uppercase tracking-wider transition-colors"
        >
          <ArrowUp className="w-3 h-3" />
          back to top
        </button>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------- */
/* Model selection grid                                                  */
/* -------------------------------------------------------------------- */

interface ModelEntry {
  id: string;
  pretty: string;
  pitch: string;
  pickWhen: string;
  characteristic: string;
  isDefault?: boolean;
  emitsThinking?: boolean;
}

const MODELS: ModelEntry[] = [
  {
    id: 'gpt-oss-120b',
    pretty: 'gpt-oss-120b',
    pitch: 'best balance of quality and speed for operator questions.',
    pickWhen:
      'most of the time. handles long-form analysis, multi-source synthesis, and strategy with citation discipline.',
    characteristic: 'default',
    isDefault: true,
  },
  {
    id: 'gpt-oss-20b',
    pretty: 'gpt-oss-20b',
    pitch: 'faster + cheaper sibling of the default.',
    pickWhen:
      'when you want a quick second opinion or are iterating fast and don\'t need the heavyweight.',
    characteristic: 'fast',
  },
  {
    id: 'qwq-32b',
    pretty: 'qwq-32b',
    pitch: 'reasoning model — shows its chain-of-thought before the answer.',
    pickWhen:
      'numerical reasoning, multi-step calculations, "show your work" questions. you can see the model think.',
    characteristic: 'reasoning',
    emitsThinking: true,
  },
  {
    id: 'qwen3-30b-a3b-fp8',
    pretty: 'qwen3-30b',
    pitch: 'fast structured-output model. great for briefs + checklists.',
    pickWhen:
      'when you want a clean structured deliverable (creative brief, channel plan, a/b test spec) and speed matters.',
    characteristic: 'structured',
  },
  {
    id: 'mistral-small-3.1',
    pretty: 'mistral-small-3.1',
    pitch: 'solid generalist; different family for a second opinion.',
    pickWhen:
      'cross-checking an answer the default gave you — different training data, different blind spots.',
    characteristic: 'generalist',
  },
];

/** Model section gets a special showcase treatment: the default model
 *  is rendered as a featured full-width card with a brand-violet border
 *  + a Default badge bleeding into the top-right corner; siblings live
 *  in a 2-up grid below it. Matches the Stitch mock convention for
 *  this specific section. */
function ModelShowcase() {
  const featured = MODELS.find(m => m.isDefault);
  const siblings = MODELS.filter(m => !m.isDefault);
  if (!featured) return null;
  return (
    <div className="space-y-4">
      <p className="text-body-lg text-fg-muted leading-relaxed text-center max-w-2xl mx-auto">
        paidpilot routes investigations through one of five specialised
        models. each is tuned for a different shape of question — pick from
        the model dropdown in any investigation header.
      </p>

      {/* Featured card */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-brand/60 bg-surface-raised/40 backdrop-blur p-6">
        <span className="absolute top-0 right-0 px-3 py-1 bg-brand text-white font-mono text-[10px] uppercase tracking-wider">
          default
        </span>
        <div className="mb-3">
          <p className="font-mono text-[11px] uppercase tracking-wider text-brand/80 mb-1">
            {featured.pretty}
          </p>
          <span className="inline-flex items-center px-2 h-5 rounded-full border border-brand/30 bg-brand/10 font-mono text-[10px] uppercase tracking-wider text-brand">
            {featured.characteristic}
          </span>
        </div>
        <h3 className="font-display text-h2 text-fg mb-2 lowercase">
          the performance powerhouse
        </h3>
        <p className="text-body-base text-fg-muted mb-4 leading-relaxed">
          {featured.pitch}
        </p>
        <div className="pt-3 border-t border-border/40">
          <p className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle mb-1.5">
            when to pick
          </p>
          <p className="text-body-base text-fg italic">"{featured.pickWhen}"</p>
        </div>
      </div>

      {/* Sibling grid — 2-up at md+, single column on small screens. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {siblings.map(m => (
          <div
            key={m.id}
            className="rounded-2xl border border-border/60 bg-surface-raised/40 backdrop-blur p-4"
          >
            <p className="font-mono text-[11px] uppercase tracking-wider text-fg-muted mb-1">
              {m.pretty}
            </p>
            <span className="inline-flex items-center px-2 h-5 rounded-full border border-border/60 bg-surface-sunken/40 font-mono text-[10px] uppercase tracking-wider text-fg-subtle mb-3">
              {m.characteristic}
            </span>
            <p className="text-body-sm text-fg-muted mb-3 leading-relaxed">
              {m.pitch}
            </p>
            <div className="pt-3 border-t border-border/40">
              <p className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle mb-1">
                when to pick
              </p>
              <p className="text-body-sm text-fg-muted">{m.pickWhen}</p>
            </div>
            {m.emitsThinking && (
              <p className="text-body-sm text-fg-subtle mt-3 italic">
                tip: the chain-of-thought renders in a collapsible "thinking"
                disclosure above the answer.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Final CTA + floating guide nav                                        */
/* -------------------------------------------------------------------- */

function FinalCTA() {
  // Auth-aware routing: signed-in visitors jump straight to /projects;
  // signed-out visitors (the docs page is public) get bounced through
  // /sign-in first. Copy adapts too — "create a project" for authed
  // users, "sign up to get started" for anonymous.
  const { isSignedIn } = useAuth();
  return (
    <section className="w-full text-center">
      <div className="rounded-2xl border border-brand/30 bg-brand/5 px-6 py-10 sm:px-12 sm:py-12">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brand/80 mb-2">
          ready to start?
        </p>
        <h3 className="font-display text-3xl text-fg mb-3 lowercase">
          {isSignedIn
            ? 'build your first campaign.'
            : 'try paidpilot — free in beta.'}
        </h3>
        <p className="text-body-base text-fg-muted mb-6 max-w-md mx-auto">
          {isSignedIn
            ? "you've completed the conceptual walkthrough. open a project, set up a campaign, and run your first investigation."
            : "you've read the guide. sign in to set up your brand profile and run your first investigation in under a minute."}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
          <Link
            to={isSignedIn ? '/projects' : '/sign-in'}
            className="inline-flex items-center h-10 px-5 rounded-md bg-gradient-to-br from-[#7C5CFF] to-[#3B82F6] text-white text-body-base font-medium shadow-[0_0_18px_rgba(124,92,255,0.3)] hover:shadow-[0_0_24px_rgba(124,92,255,0.45)] transition-shadow"
          >
            {isSignedIn ? 'create a project' : 'sign in to start'}
          </Link>
          <a
            href="mailto:hello@paidpilot.app?subject=Hello%20from%20the%20guide"
            className="inline-flex items-center h-10 px-5 rounded-md border border-border/60 text-fg-muted hover:text-fg hover:bg-surface-sunken/40 text-body-base transition-colors"
          >
            email the team
          </a>
        </div>
      </div>
    </section>
  );
}

/** Bottom-right floating "guide nav" pill that opens a popover with the
 *  category-grouped section index. Replaces the sticky right-rail TOC
 *  from the previous design — the centered single-column layout doesn't
 *  have rail space for a persistent TOC. */
function FloatingGuideNav({ sections }: { sections: Section[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Bucket sections into their groups, preserving the order they were
  // declared in buildSections().
  const grouped = useMemo(() => {
    const groups: Record<SectionGroup, Section[]> = {
      'start': [],
      'building-blocks': [],
      'conversations': [],
      'tools': [],
      'connections': [],
      'navigation': [],
      'settings': [],
    };
    for (const s of sections) groups[s.group].push(s);
    return groups;
  }, [sections]);

  const order: SectionGroup[] = [
    'start',
    'building-blocks',
    'conversations',
    'tools',
    'connections',
    'navigation',
    'settings',
  ];

  return (
    <div
      ref={rootRef}
      className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2"
    >
      {open && (
        <div
          role="menu"
          className="w-64 rounded-xl border border-border/60 bg-surface-raised/95 backdrop-blur-xl shadow-2xl p-3 max-h-[60vh] overflow-y-auto motion-safe:animate-fade-in"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle mb-3 px-1">
            table of contents
          </p>
          <div className="space-y-3">
            {order.map(group => {
              const items = grouped[group];
              if (items.length === 0) return null;
              return (
                <div key={group}>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-brand/80 px-1 mb-1">
                    {GROUP_LABEL[group]}
                  </p>
                  <ul>
                    {items.map(s => (
                      <li key={s.id}>
                        <a
                          href={`#${s.id}`}
                          onClick={() => setOpen(false)}
                          className="block px-1 py-1 text-body-sm text-fg-muted hover:text-fg rounded transition-colors"
                        >
                          {s.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label={open ? 'close guide nav' : 'open guide nav'}
        aria-expanded={open}
        className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-gradient-to-br from-[#7C5CFF] to-[#3B82F6] text-white text-body-sm font-medium shadow-[0_0_24px_rgba(124,92,255,0.35)] hover:shadow-[0_0_30px_rgba(124,92,255,0.5)] transition-all"
      >
        {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        <span className="font-mono text-[11px] uppercase tracking-wider">
          {open ? 'close' : 'guide nav'}
        </span>
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Small primitives                                                      */
/* -------------------------------------------------------------------- */

function P({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={clsx('text-body-base text-fg leading-relaxed', className)}>
      {children}
    </p>
  );
}

function Ul({ children }: { children: ReactNode }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5 text-body-base text-fg leading-relaxed marker:text-fg-subtle">
      {children}
    </ul>
  );
}

function Ol({ children }: { children: ReactNode }) {
  return (
    <ol className="list-decimal pl-5 space-y-1.5 text-body-base text-fg leading-relaxed marker:text-fg-subtle">
      {children}
    </ol>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <code className="font-mono text-brand bg-brand/5 border border-brand/20 px-1 rounded text-[12px] inline-block leading-snug">
      {children}
    </code>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-grid place-items-center min-w-[22px] h-[20px] px-1.5 font-mono text-[11px] text-fg-muted bg-surface-sunken/60 border border-border/60 rounded align-middle">
      {children}
    </kbd>
  );
}

function DocLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="text-brand hover:underline font-mono text-[13px] bg-brand/5 border border-brand/15 px-1.5 py-0.5 rounded"
    >
      {children}
    </Link>
  );
}

function Callout({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-brand/20 bg-brand/5 px-4 py-3 flex items-start gap-2.5 text-body-sm text-fg-muted leading-relaxed">
      <span className="text-brand mt-0.5">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-border/30 last:border-b-0">
      <span className="text-fg">{label}</span>
      <span className="flex items-center gap-1 shrink-0">
        {keys.map((k, i) => (
          <Kbd key={i}>{k}</Kbd>
        ))}
      </span>
    </div>
  );
}

// FooterMeta + useScrollSpy were removed when the layout switched from
// the 3-column dev-docs to the centered timeline (the floating
// FloatingGuideNav replaces the sticky TOC + scroll-spy).
