/**
 * Operational Hub — PaidPilot homepage (PAI-13 / PR D).
 *
 * Replaces the passive "Good afternoon, Paritosh" greeting + uniform card
 * grid with an operational state line + asymmetric three-zone layout:
 *
 *   Header           One line of live operational state, tabular numerics.
 *   Operational feed Stacked rows (left ~60%) — what's in flight right now.
 *   Continue ...     Top 3 recent investigations (right top).
 *   Quick actions    Keyboard-shortcutted navigation (right bottom).
 *
 * Real data sources: listSessions (investigations), localStorage scenarios
 * (calculator state), brand profile completion. Meta CAC / campaign rows
 * stub to "Connect Meta" onramps until V2 ad-library integration lands.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { v4 as uuidv4 } from 'uuid';
import {
  ArrowUpRight,
  BarChart3,
  Calculator,
  PlayCircle,
  Search,
  Settings,
  TrendingDown,
} from 'lucide-react';
import { useCommandPalette } from '../components/CommandPalette';
import { useBrandProfile, useSessions } from '../services/queries';

interface Props {
  darkMode: boolean;
}

const SCENARIO_STORAGE_KEY = 'paidpilot.calc.scenarios.v1';

interface CalcSummary {
  total: number;
  byCalc: Record<string, number>;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString();
}

function readScenarioCounts(): CalcSummary {
  if (typeof window === 'undefined') return { total: 0, byCalc: {} };
  try {
    const raw = window.localStorage.getItem(SCENARIO_STORAGE_KEY);
    if (!raw) return { total: 0, byCalc: {} };
    const store = JSON.parse(raw) as Record<string, unknown[]>;
    const byCalc: Record<string, number> = {};
    let total = 0;
    for (const [k, v] of Object.entries(store)) {
      const n = Array.isArray(v) ? v.length : 0;
      byCalc[k] = n;
      total += n;
    }
    return { total, byCalc };
  } catch {
    return { total: 0, byCalc: {} };
  }
}

export function HomePage({}: Props) {
  const { getToken, isSignedIn } = useAuth();
  const { setOpen: setPaletteOpen } = useCommandPalette();
  const [scenarios, setScenarios] = useState<CalcSummary>(() => readScenarioCounts());
  const [newChatId] = useState(() => uuidv4());

  // Cached queries — return synchronously from cache on revisit, then
  // revalidate in background. First-visit hits the network as before.
  const { data: profile } = useBrandProfile(getToken, !!isSignedIn);
  const { data: sessions = [] } = useSessions(getToken, { limit: 10 }, !!isSignedIn);

  // Pick up scenarios written from /calc in another tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SCENARIO_STORAGE_KEY) setScenarios(readScenarioCounts());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const openInvestigations = useMemo(
    () => sessions.filter(s => !s.is_archived && s.message_count > 0),
    [sessions],
  );
  const lastActivity = openInvestigations[0]?.last_accessed_at ?? null;
  const recentThree = openInvestigations.slice(0, 3);

  const brandSetupPct = useMemo(() => {
    if (!profile) return 0;
    const items = [
      !!profile.company_name,
      !!profile.primary_channels?.length,
      profile.target_cac != null,
      !!profile.voice_guidelines,
    ];
    return Math.round((items.filter(Boolean).length / items.length) * 100);
  }, [profile]);
  const brandIncomplete = profile && !profile.onboarding_completed;

  return (
    <>
      <header className="mb-8">
        {/* No page title — top-nav already says "Home" is active. The
         * operational state line is the lead, matching the Stitch dark
         * mock where the page identity lives in the sidebar chip. */}
        <OperationalStateLine
          openCount={openInvestigations.length}
          scenarioCount={scenarios.total}
          lastActivityIso={lastActivity}
        />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* PRIMARY SURFACE — operational feed */}
        <section className="lg:col-span-3">
          <SectionLabel>operational feed</SectionLabel>
          <div className="rounded-2xl border border-border/60 bg-surface-raised/40 backdrop-blur divide-y divide-border/40 overflow-hidden">
            <FeedRow
              icon={<Search className="w-4 h-4" />}
              label={
                openInvestigations.length === 0
                  ? 'no investigations open'
                  : `${openInvestigations.length} investigation${openInvestigations.length === 1 ? '' : 's'} open`
              }
              trailing={
                lastActivity ? (
                  <span className="text-body-sm text-fg-muted tabular-nums">
                    last activity {relativeTime(lastActivity)}
                  </span>
                ) : (
                  <Link
                    to={`/investigations/${newChatId}`}
                    className="text-body-sm text-brand hover:underline"
                  >
                    start one →
                  </Link>
                )
              }
              to={openInvestigations.length > 0 ? '/investigations' : undefined}
            />

            <FeedRow
              icon={<Calculator className="w-4 h-4" />}
              label="calculators"
              trailing={
                scenarios.total === 0 ? (
                  <span className="text-body-sm text-fg-muted">
                    <span className="text-fg-subtle/60">→</span>{' '}
                    <Link to="/calc" className="text-brand hover:underline">
                      no scenarios saved yet
                    </Link>
                  </span>
                ) : (
                  <span className="text-body-sm text-fg-muted tabular-nums">
                    <span className="text-fg-subtle/60">→</span>{' '}
                    {scenarios.total} scenario{scenarios.total === 1 ? '' : 's'} saved
                  </span>
                )
              }
              to="/calc"
            />

            <FeedRow
              icon={<TrendingDown className="w-4 h-4" />}
              label="meta CAC trend"
              trailing={
                <span className="text-body-sm">
                  <span className="text-fg-muted">—</span>{' '}
                  <Link to="/settings" className="text-brand hover:underline">
                    connect Meta
                  </Link>
                </span>
              }
              dim
            />

            <FeedRow
              icon={<BarChart3 className="w-4 h-4" />}
              label="channel mix vs. target ROAS"
              trailing={
                <span className="text-body-sm">
                  <span className="text-fg-muted">—</span>{' '}
                  <Link to="/settings" className="text-brand hover:underline">
                    connect Google Ads
                  </Link>
                </span>
              }
              dim
            />

            {brandIncomplete && (
              <FeedRow
                icon={<Settings className="w-4 h-4" />}
                label={`brand profile · ${brandSetupPct}% complete`}
                trailing={
                  <Link to="/settings" className="text-body-sm text-brand hover:underline">
                    finish setup →
                  </Link>
                }
                to="/settings"
              />
            )}
          </div>

          {/* Sub-feed: recent plays / next-step suggestions could land here in
              future. Empty for now. */}
        </section>

        {/* SECONDARY SURFACE — right rail */}
        <aside className="lg:col-span-2 space-y-8">
          <section>
            <SectionLabel>continue investigation</SectionLabel>
            {recentThree.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/60 px-4 py-6 text-body-sm text-fg-muted">
                no active investigations. start by asking what changed, what to
                test, or what to scale.
              </div>
            ) : (
              <ul className="space-y-2">
                {recentThree.map(s => (
                  <li key={s.id}>
                    <Link
                      to={`/investigations/${s.id}`}
                      className="block rounded-2xl border border-border/60 bg-surface-raised/40 backdrop-blur hover:border-brand/40 transition-colors p-3 group focus-visible:outline-none focus-visible:shadow-focus"
                    >
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <span className="text-body-base text-fg font-medium truncate">
                          {s.title?.trim() || 'untitled investigation'}
                        </span>
                        <span className="text-body-sm text-fg-muted shrink-0 tabular-nums">
                          {relativeTime(s.last_accessed_at)}
                        </span>
                      </div>
                      {s.last_message_excerpt && (
                        <p className="text-body-sm text-fg-muted line-clamp-1 leading-snug">
                          {s.last_message_excerpt}
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <SectionLabel>quick actions</SectionLabel>
            <ul className="space-y-px">
              <QuickAction
                label="new investigation"
                to={`/investigations/${newChatId}`}
                shortcut={['⌘', 'N']}
              />
              <QuickAction
                label="open calculators"
                to="/calc"
                shortcut={['⌘', 'E']}
              />
              <QuickAction
                label="run a play"
                to="/plays"
                shortcut={['⌘', 'P']}
                icon={<PlayCircle className="w-3.5 h-3.5" />}
              />
              <QuickAction
                label="search anything"
                onClick={() => setPaletteOpen(true)}
                shortcut={['⌘', 'K']}
                icon={<Search className="w-3.5 h-3.5" />}
              />
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}

/* ----------------------------- Sub-components --------------------------- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-3">
      {children}
    </h2>
  );
}

function OperationalStateLine({
  openCount,
  scenarioCount,
  lastActivityIso,
}: {
  openCount: number;
  scenarioCount: number;
  lastActivityIso: string | null;
}) {
  const parts: React.ReactNode[] = [];
  parts.push(
    openCount === 0 ? (
      <span key="inv">no investigations open</span>
    ) : (
      <span key="inv" className="tabular-nums">
        {openCount} open investigation{openCount === 1 ? '' : 's'}
      </span>
    ),
  );
  parts.push(
    scenarioCount === 0 ? (
      <span key="sc">no scenarios pending</span>
    ) : (
      <span key="sc" className="tabular-nums">
        {scenarioCount} scenario{scenarioCount === 1 ? '' : 's'} pending
      </span>
    ),
  );
  if (lastActivityIso) {
    parts.push(
      <span key="last" className="tabular-nums">
        last active {relativeTime(lastActivityIso)}
      </span>,
    );
  }
  return (
    <p className="text-body-base text-fg-muted flex items-center gap-2 flex-wrap">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" aria-hidden />
      {parts.map((p, i) => (
        <span key={i} className="contents">
          {p}
          {i < parts.length - 1 && (
            <span className="text-fg-subtle/60" aria-hidden>
              ·
            </span>
          )}
        </span>
      ))}
    </p>
  );
}

interface FeedRowProps {
  icon: React.ReactNode;
  label: React.ReactNode;
  trailing?: React.ReactNode;
  to?: string;
  /** Mute the row to indicate "stub / not yet connected" data sources. */
  dim?: boolean;
}

function FeedRow({ icon, label, trailing, to, dim = false }: FeedRowProps) {
  const content = (
    <>
      <span
        className={`shrink-0 ${dim ? 'text-fg-subtle' : 'text-fg-muted'}`}
      >
        {icon}
      </span>
      <span
        className={`flex-1 min-w-0 truncate text-body-base ${dim ? 'text-fg-muted' : 'text-fg'}`}
      >
        {label}
      </span>
      {trailing}
    </>
  );
  if (!to) return <div className="flex items-center gap-3 px-4 py-3">{content}</div>;
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-4 py-3 hover:bg-surface-raised/60 transition-colors focus-visible:outline-none focus-visible:shadow-focus"
    >
      {content}
    </Link>
  );
}

function QuickAction({
  label,
  to,
  onClick,
  shortcut,
  icon,
}: {
  label: string;
  to?: string;
  onClick?: () => void;
  shortcut: string[];
  icon?: React.ReactNode;
}) {
  const body = (
    <div className="flex items-center gap-2 px-3 py-2 rounded-control hover:bg-surface-raised/60 transition-colors group">
      {icon && (
        <span className="text-fg-muted group-hover:text-fg transition-colors">
          {icon}
        </span>
      )}
      <span className="flex-1 text-body-base text-fg-muted group-hover:text-fg transition-colors">
        {label}
      </span>
      <span className="flex items-center gap-1">
        {shortcut.map((k, i) => (
          <kbd
            key={i}
            className="inline-grid place-items-center min-w-[20px] h-[18px] px-1 font-mono text-[10px] text-fg-subtle bg-surface-raised/60 border border-border/60 rounded-control"
          >
            {k}
          </kbd>
        ))}
      </span>
      {to && (
        <ArrowUpRight
          className="w-3 h-3 text-fg-subtle/60 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-hidden
        />
      )}
    </div>
  );
  if (to) {
    return (
      <li>
        <Link to={to} className="block focus-visible:outline-none focus-visible:shadow-focus rounded-control">
          {body}
        </Link>
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left focus-visible:outline-none focus-visible:shadow-focus rounded-control"
      >
        {body}
      </button>
    </li>
  );
}

