/**
 * /docs — onboarding-grade documentation page.
 *
 * Today this is a single static page rather than a full doc site. It
 * covers the questions a marketer asks in their first 10 minutes with
 * PaidPilot:
 *
 *   - what is this for?
 *   - projects + campaigns — why the hierarchy?
 *   - investigations + citations
 *   - plays library
 *   - calculators + scenarios
 *   - data sources / integrations
 *   - keyboard shortcuts
 *
 * Built on the same primitives as every other page (`PageHeader`,
 * Section eyebrow with brand-tint type, body text). Lazy-loaded via
 * React.lazy in App.tsx — adds zero kB to first paint.
 *
 * Reachable from the sidebar's "docs" row and the landing-page nav.
 */
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Calculator,
  ChevronRight,
  FolderKanban,
  Keyboard,
  Plug,
  PlayCircle,
  Quote,
  Search,
} from 'lucide-react';
import { PageHeader } from '../components/AppLayout';

interface Props {
  darkMode: boolean;
}

export function DocsPage(_props: Props) {
  return (
    <>
      <PageHeader
        eyebrow="documentation"
        title="how paidpilot works."
        subtitle="the short version: a project = your brand, a campaign = a real push, and every investigation, play, and creative anchors to one. answers are grounded in sources you can click through to verify."
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

      <div className="space-y-9">
        <Section eyebrow="getting started" title="three minutes" icon={<BookOpen className="w-4 h-4" />}>
          <ol className="space-y-2 text-body-base text-fg leading-relaxed list-decimal pl-5">
            <li>create a project (= your brand). the brand profile you fill out grounds every answer.</li>
            <li>open the project's default <em>general</em> campaign — or add one with a date window + objective.</li>
            <li>
              start an investigation, run a play, or open a calculator from
              the sidebar. all three are scoped to whichever campaign is
              active.
            </li>
          </ol>
        </Section>

        <Section
          eyebrow="hierarchy"
          title="projects + campaigns"
          icon={<FolderKanban className="w-4 h-4" />}
        >
          <p className="text-body-base text-fg leading-relaxed mb-3">
            <strong className="text-fg">project</strong> = one brand. holds the brand profile (icp, channels, target CAC, voice). a user can own multiple projects — agencies, holdcos, side-projects.
          </p>
          <p className="text-body-base text-fg leading-relaxed mb-3">
            <strong className="text-fg">campaign</strong> = a real-world marketing push inside a project (Q4 holiday, Black Friday, lifecycle revamp). holds its own objective + optional date window. every investigation / play / creative anchors to a campaign so context doesn't leak between pushes.
          </p>
          <p className="text-body-sm text-fg-muted leading-relaxed">
            the active campaign is shown in the sidebar pill at the top. switch it from there or from <Link to="/projects" className="text-brand hover:underline">/projects</Link>.
          </p>
        </Section>

        <Section
          eyebrow="conversations"
          title="investigations + citations"
          icon={<Search className="w-4 h-4" />}
        >
          <p className="text-body-base text-fg leading-relaxed mb-3">
            an <strong className="text-fg">investigation</strong> is a chat session grounded in your brand profile + active campaign. every assistant turn cites its sources inline — click any <code className="font-mono text-brand bg-brand/5 border border-brand/20 px-1 rounded text-[12px]">[N]</code> pill to see the exact paragraph the model was conditioned on.
          </p>
          <p className="text-body-base text-fg leading-relaxed mb-3">
            the conversation header carries chips for{' '}
            <span className="inline-flex items-center gap-1 mx-0.5">
              <Quote className="w-3 h-3 text-fg-muted" />
              <span className="font-mono text-[11px] text-fg-muted">citations · N</span>
            </span>{' '}
            and{' '}
            <span className="font-mono text-[11px] text-fg-muted">videos · N</span>{' '}
            — click either to browse the full set as a side drawer.
          </p>
          <p className="text-body-sm text-fg-muted leading-relaxed">
            tip: the <code className="font-mono text-fg-muted bg-surface-sunken/60 px-1 rounded text-[12px]">[</code> key collapses the sidebar; <kbd className="font-mono text-[11px] border border-border/60 rounded px-1">⌘</kbd>+<kbd className="font-mono text-[11px] border border-border/60 rounded px-1">K</kbd> opens the command palette to jump anywhere.
          </p>
        </Section>

        <Section
          eyebrow="library"
          title="plays"
          icon={<PlayCircle className="w-4 h-4" />}
        >
          <p className="text-body-base text-fg leading-relaxed mb-3">
            plays are pre-written prompts that ask for a specific deliverable: a creative brief, a channel allocation plan, an A/B test spec, a launch playbook. they run as a single turn in an investigation — same citations, same brand grounding, structured output.
          </p>
          <p className="text-body-sm text-fg-muted leading-relaxed">
            the catalog lives at <code className="font-mono text-fg-muted">/plays</code> within the active campaign. anything you've run recently surfaces at the top.
          </p>
        </Section>

        <Section
          eyebrow="math"
          title="calculators + scenarios"
          icon={<Calculator className="w-4 h-4" />}
        >
          <p className="text-body-base text-fg leading-relaxed mb-3">
            four calculators ship today: CAC payback, ROAS → margin, A/B sample size, blended channel efficiency. each lives at <code className="font-mono text-fg-muted">/calc</code> within the active campaign and saves <em>scenarios</em> you can revisit / compare later.
          </p>
          <p className="text-body-sm text-fg-muted leading-relaxed">
            scenarios are stored locally for now (no DB sync). that lifts to per-project in a later release.
          </p>
        </Section>

        <Section
          eyebrow="connections"
          title="data sources + integrations"
          icon={<Plug className="w-4 h-4" />}
        >
          <p className="text-body-base text-fg leading-relaxed mb-3">
            connect Meta (and soon Google Ads, Slack, Notion, Linear, …) at{' '}
            <Link to="/settings/integrations" className="text-brand hover:underline">
              /settings/integrations
            </Link>. once connected, the active campaign's spend / CPP / ROAS is appended to the system prompt — answers reference <em>your</em> numbers, not generic best-practice.
          </p>
          <p className="text-body-sm text-fg-muted leading-relaxed">
            integrations are grouped by purpose (ads, lifecycle, commerce, crm, collab, ops). hit the "notify me" button on any coming-soon row to vote — we ship the next one based on demand.
          </p>
        </Section>

        <Section
          eyebrow="shortcuts"
          title="keyboard"
          icon={<Keyboard className="w-4 h-4" />}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-body-sm">
            <ShortcutRow keys={['⌘', 'K']} label="open command palette" />
            <ShortcutRow keys={['⌘', 'N']} label="new investigation" />
            <ShortcutRow keys={['⌘', 'E']} label="open calculators" />
            <ShortcutRow keys={['⌘', 'P']} label="open plays" />
            <ShortcutRow keys={['[']} label="collapse / expand sidebar" />
            <ShortcutRow keys={['Esc']} label="close any open drawer" />
          </div>
        </Section>

        <Section eyebrow="more help" title="still stuck?">
          <p className="text-body-base text-fg-muted leading-relaxed">
            email <a href="mailto:hello@paidpilot.app" className="text-brand hover:underline">hello@paidpilot.app</a> and we'll route it to the right human. mention the page you were on — the sidebar's "help" row prefills that for you.
          </p>
        </Section>
      </div>
    </>
  );
}

function Section({
  eyebrow,
  title,
  icon,
  children,
}: {
  eyebrow: string;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-fg-muted">{icon}</span>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80">
          {eyebrow}
        </p>
      </div>
      <h2 className="font-display text-h2 text-fg mb-3 lowercase">{title}</h2>
      <div className="max-w-3xl">{children}</div>
    </section>
  );
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-fg">{label}</span>
      <span className="flex items-center gap-1 shrink-0">
        {keys.map((k, i) => (
          <kbd
            key={i}
            className="inline-grid place-items-center min-w-[22px] h-[20px] px-1 font-mono text-[11px] text-fg-muted bg-surface-sunken/60 border border-border/60 rounded"
          >
            {k}
          </kbd>
        ))}
      </span>
    </div>
  );
}
