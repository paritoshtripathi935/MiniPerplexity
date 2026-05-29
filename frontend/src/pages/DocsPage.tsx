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
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Calculator,
  ChevronRight,
  CornerDownLeft,
  FolderKanban,
  Image as ImageIcon,
  Info,
  Keyboard,
  ListChecks,
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
  Youtube,
  Zap,
} from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '../components/AppLayout';

interface Props {
  darkMode: boolean;
}

/* -------------------------------------------------------------------- */
/* Section registry — single source of truth for content + TOC          */
/* -------------------------------------------------------------------- */

interface Section {
  id: string;
  eyebrow: string;
  title: string;
  icon: ReactNode;
  body: ReactNode;
}

const STORAGE_KEY_SCENARIO = 'paidpilot.calc.scenarios.v1';

function buildSections(): Section[] {
  return [
    {
      id: 'getting-started',
      eyebrow: 'start here',
      title: 'three minutes',
      icon: <BookOpen className="w-4 h-4" />,
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
      id: 'models',
      eyebrow: 'choose your engine',
      title: 'model selection',
      icon: <Sparkles className="w-4 h-4" />,
      body: (
        <>
          <P>
            the model dropdown lives in the top-right of the investigation
            header. your choice is per-user (not per-conversation) and
            persists across sessions. every option is grounded with the same
            brand + campaign context — only the engine changes.
          </P>
          <ModelGrid />
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
      id: 'integrations',
      eyebrow: 'connections',
      title: 'integrations',
      icon: <Plug className="w-4 h-4" />,
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
  const activeId = useScrollSpy(sections.map(s => s.id));

  // Suppress an unused-var warning for the storage key constant. It's
  // referenced by the scenarios section copy in spirit (and used elsewhere
  // in the app) — kept here for future "this is where the data lives"
  // callouts without re-grepping.
  void STORAGE_KEY_SCENARIO;

  return (
    <>
      <PageHeader
        eyebrow="documentation"
        title="how paidpilot works."
        subtitle="the operator's guide — every feature, what it's for, when to reach for it. a project = your brand, a campaign = a real push, everything else hangs off those two."
        actions={
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/60 text-fg-muted hover:text-fg hover:bg-surface-sunken/40 text-body-sm transition-colors"
          >
            back to home
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        }
      />

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-10">
        {/* Main content stream */}
        <main className="min-w-0 space-y-14">
          {sections.map(s => (
            <SectionBlock key={s.id} section={s} />
          ))}
          <FooterMeta />
        </main>

        {/* Sticky TOC — lg+ only */}
        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-3">
              on this page
            </p>
            <ul className="space-y-px border-l border-border/40 pl-3">
              {sections.map(s => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className={clsx(
                      'block text-body-sm py-1 -ml-3 pl-3 border-l-2 transition-colors',
                      activeId === s.id
                        ? 'border-brand text-fg'
                        : 'border-transparent text-fg-subtle hover:text-fg',
                    )}
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------- */
/* Section block                                                         */
/* -------------------------------------------------------------------- */

function SectionBlock({ section }: { section: Section }) {
  return (
    <section id={section.id} className="scroll-mt-24">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-fg-muted">{section.icon}</span>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80">
          {section.eyebrow}
        </p>
      </div>
      <h2 className="font-display text-h2 text-fg mb-4 lowercase">
        {section.title}
      </h2>
      <div className="max-w-3xl space-y-3">{section.body}</div>
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

function ModelGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
      {MODELS.map(m => (
        <div
          key={m.id}
          className={clsx(
            'rounded-2xl border bg-surface-raised/40 backdrop-blur p-4',
            m.isDefault ? 'border-brand/30' : 'border-border/60',
          )}
        >
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <h3 className="font-display font-semibold text-fg text-body-base lowercase">
              {m.pretty}
            </h3>
            <span
              className={clsx(
                'inline-flex items-center px-1.5 h-5 rounded-md font-mono text-[10px] uppercase tracking-wider border',
                m.isDefault
                  ? 'border-brand/30 bg-brand/5 text-brand'
                  : 'border-border/60 bg-surface-sunken/40 text-fg-subtle',
              )}
            >
              {m.characteristic}
            </span>
          </div>
          <p className="text-body-sm text-fg mb-2">{m.pitch}</p>
          <p className="text-body-sm text-fg-muted">
            <strong className="text-fg-muted font-medium">when to pick:</strong>{' '}
            {m.pickWhen}
          </p>
          {m.emitsThinking && (
            <p className="text-body-sm text-fg-subtle mt-2 italic">
              tip: the chain-of-thought renders in a collapsible "thinking"
              disclosure above the answer.
            </p>
          )}
        </div>
      ))}
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

function FooterMeta() {
  return (
    <div className="pt-8 border-t border-border/40">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
        end of guide
      </p>
      <p className="text-body-sm text-fg-muted mt-2 max-w-2xl">
        missing a feature? something behaving differently than this describes?
        email{' '}
        <a
          href="mailto:hello@paidpilot.app?subject=Docs%20feedback"
          className="text-brand hover:underline"
        >
          hello@paidpilot.app
        </a>{' '}
        — docs lag behind code occasionally and we're happy to fix it.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Scroll-spy                                                            */
/* -------------------------------------------------------------------- */

/** Watches every section's intersection with the viewport. The id whose
 *  top is closest to (but past) the top of the scroll area becomes
 *  active. Drives the TOC's left-bar highlight. */
function useScrollSpy(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!ids.length) return;

    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          const id = entry.target.id;
          if (entry.isIntersecting) {
            // Use boundingClientRect.top as priority — sections nearer
            // the top of the viewport win on ties.
            visible.set(id, entry.boundingClientRect.top);
          } else {
            visible.delete(id);
          }
        }
        if (visible.size === 0) return;
        // Pick the one with the smallest non-negative top (or the
        // largest negative if all are above the viewport).
        let best: { id: string; top: number } | null = null;
        for (const [id, top] of visible) {
          if (best === null || Math.abs(top) < Math.abs(best.top)) {
            best = { id, top };
          }
        }
        if (best) setActive(best.id);
      },
      {
        rootMargin: '-96px 0px -55% 0px',
        threshold: [0, 0.1, 0.5, 1],
      },
    );

    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids]);

  return active;
}
