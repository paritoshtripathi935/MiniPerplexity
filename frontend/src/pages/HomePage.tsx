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
  ChevronRight,
  PlayCircle,
  Search,
  Settings,
  TrendingDown,
} from 'lucide-react';
import {
  getBrandProfile,
  listSessions,
  type BrandProfile,
  type SessionListItem,
} from '../services/api';
import { useCommandPalette } from '../components/CommandPalette';

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

const CALC_LABELS: Record<string, string> = {
  'cac-payback': 'CAC Payback',
  'roas-margin': 'ROAS → Margin',
  'sample-size': 'A/B Sample Size',
  'blended-efficiency': 'Blended Efficiency',
};

export function HomePage({}: Props) {
  const { getToken } = useAuth();
  const { setOpen: setPaletteOpen } = useCommandPalette();
  const [profile, setProfile] = useState<BrandProfile | null>(null);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [scenarios, setScenarios] = useState<CalcSummary>(() => readScenarioCounts());
  const [newChatId] = useState(() => uuidv4());

  useEffect(() => {
    (async () => {
      const [p, s] = await Promise.all([
        getBrandProfile(getToken).catch(() => null),
        listSessions(getToken, { limit: 10 }).catch(
          () => ({ sessions: [] as SessionListItem[] }),
        ),
      ]);
      if (p) setProfile(p);
      setSessions(s.sessions);
    })();
  }, [getToken]);

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
        <h1 className="font-display text-h1 text-on-surface">Operational Hub</h1>
        <OperationalStateLine
          openCount={openInvestigations.length}
          scenarioCount={scenarios.total}
          lastActivityIso={lastActivity}
        />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* PRIMARY SURFACE — operational feed */}
        <section className="lg:col-span-3">
          <SectionLabel>Operational feed</SectionLabel>
          <div className="rounded-card border border-outline-variant bg-surface-container-low divide-y divide-outline-variant">
            <FeedRow
              icon={<Search className="w-4 h-4" />}
              label={
                openInvestigations.length === 0
                  ? 'No investigations open'
                  : `${openInvestigations.length} investigation${openInvestigations.length === 1 ? '' : 's'} open`
              }
              trailing={
                lastActivity ? (
                  <span className="text-body-sm text-on-surface-variant tabular-nums">
                    last activity {relativeTime(lastActivity)}
                  </span>
                ) : (
                  <Link
                    to={`/investigations/${newChatId}`}
                    className="text-body-sm text-primary hover:underline"
                  >
                    Start one →
                  </Link>
                )
              }
              to={openInvestigations.length > 0 ? '/investigations' : undefined}
            />

            <FeedRow
              icon={<Calculator className="w-4 h-4" />}
              label={
                <span>
                  Calculators
                  <span className="text-on-surface-variant"> · </span>
                  <span className="text-on-surface-variant">
                    {scenarios.total === 0
                      ? 'no scenarios saved yet'
                      : `${scenarios.total} scenario${scenarios.total === 1 ? '' : 's'} saved`}
                  </span>
                </span>
              }
              trailing={
                scenarios.total === 0 ? (
                  <Link to="/calc" className="text-body-sm text-primary hover:underline">
                    Open →
                  </Link>
                ) : (
                  <span className="text-body-sm text-on-surface-variant tabular-nums">
                    {topCalcLabel(scenarios.byCalc)}
                  </span>
                )
              }
              to="/calc"
            />

            <FeedRow
              icon={<TrendingDown className="w-4 h-4" />}
              label="Meta CAC trend"
              trailing={
                <span className="text-body-sm">
                  <span className="text-on-surface-variant">—</span>{' '}
                  <Link to="/settings" className="text-primary hover:underline">
                    Connect Meta
                  </Link>
                </span>
              }
              dim
            />

            <FeedRow
              icon={<BarChart3 className="w-4 h-4" />}
              label="Channel mix vs. target ROAS"
              trailing={
                <span className="text-body-sm">
                  <span className="text-on-surface-variant">—</span>{' '}
                  <Link to="/settings" className="text-primary hover:underline">
                    Connect Google Ads
                  </Link>
                </span>
              }
              dim
            />

            {brandIncomplete && (
              <FeedRow
                icon={<Settings className="w-4 h-4" />}
                label={`Brand profile · ${brandSetupPct}% complete`}
                trailing={
                  <Link to="/settings" className="text-body-sm text-primary hover:underline">
                    Finish setup →
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
            <SectionLabel>Continue investigation</SectionLabel>
            {recentThree.length === 0 ? (
              <div className="rounded-card border border-dashed border-outline-variant px-4 py-6 text-body-sm text-on-surface-variant">
                No active investigations. Start by asking what changed, what to
                test, or what to scale.
              </div>
            ) : (
              <ul className="space-y-2">
                {recentThree.map(s => (
                  <li key={s.id}>
                    <Link
                      to={`/investigations/${s.id}`}
                      className="block rounded-card border border-outline-variant bg-surface-container-low hover:border-outline transition-colors p-3 group focus-visible:outline-none focus-visible:shadow-focus"
                    >
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <span className="text-body-base text-on-surface font-medium truncate">
                          {s.title?.trim() || 'Untitled investigation'}
                        </span>
                        <span className="text-body-sm text-on-surface-variant shrink-0 tabular-nums">
                          {relativeTime(s.last_accessed_at)}
                        </span>
                      </div>
                      {s.last_message_excerpt && (
                        <p className="text-body-sm text-on-surface-variant line-clamp-1 leading-snug">
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
            <SectionLabel>Quick actions</SectionLabel>
            <ul className="space-y-px">
              <QuickAction
                label="New investigation"
                to={`/investigations/${newChatId}`}
                shortcut={['⌘', 'N']}
              />
              <QuickAction
                label="Open calculators"
                to="/calc"
                shortcut={['⌘', 'E']}
              />
              <QuickAction
                label="Run a play"
                to="/plays"
                shortcut={['⌘', 'P']}
                icon={<PlayCircle className="w-3.5 h-3.5" />}
              />
              <QuickAction
                label="Search anything"
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
    <h2 className="text-label-caps text-on-surface-variant uppercase mb-3">
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
    <span key="inv" className="tabular-nums">
      {openCount} open investigation{openCount === 1 ? '' : 's'}
    </span>,
  );
  parts.push(
    <span key="sc" className="tabular-nums">
      {scenarioCount} scenario{scenarioCount === 1 ? '' : 's'} pending
    </span>,
  );
  if (lastActivityIso) {
    parts.push(
      <span key="last" className="tabular-nums">
        last active {relativeTime(lastActivityIso)}
      </span>,
    );
  }
  return (
    <p className="mt-2 text-body-sm text-on-surface-variant flex items-center gap-2 flex-wrap">
      <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" aria-hidden />
      {parts.map((p, i) => (
        <span key={i} className="contents">
          {p}
          {i < parts.length - 1 && (
            <span className="text-outline-variant" aria-hidden>
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
        className={`shrink-0 ${dim ? 'text-outline' : 'text-on-surface-variant'}`}
      >
        {icon}
      </span>
      <span
        className={`flex-1 min-w-0 truncate text-body-base ${dim ? 'text-on-surface-variant' : 'text-on-surface'}`}
      >
        {label}
      </span>
      {trailing}
      {to && (
        <ChevronRight
          className="w-3.5 h-3.5 text-outline-variant shrink-0 group-hover:text-outline transition-colors"
          aria-hidden
        />
      )}
    </>
  );
  const inner = (
    <div className="flex items-center gap-3 px-4 py-3">{content}</div>
  );
  if (!to) return <div className="flex items-center gap-3 px-4 py-3">{content}</div>;
  return (
    <Link
      to={to}
      className="block hover:bg-surface-container transition-colors group focus-visible:outline-none focus-visible:shadow-focus"
    >
      {inner}
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
    <div className="flex items-center gap-2 px-3 py-2 rounded-control hover:bg-surface-container transition-colors group">
      {icon && (
        <span className="text-on-surface-variant group-hover:text-on-surface transition-colors">
          {icon}
        </span>
      )}
      <span className="flex-1 text-body-base text-on-surface-variant group-hover:text-on-surface transition-colors">
        {label}
      </span>
      <span className="flex items-center gap-1">
        {shortcut.map((k, i) => (
          <kbd
            key={i}
            className="inline-grid place-items-center min-w-[20px] h-[18px] px-1 text-label-caps text-outline bg-surface-container rounded-control"
          >
            {k}
          </kbd>
        ))}
      </span>
      {to && (
        <ArrowUpRight
          className="w-3 h-3 text-outline-variant opacity-0 group-hover:opacity-100 transition-opacity"
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

function topCalcLabel(byCalc: Record<string, number>): string {
  let topKey: string | null = null;
  let topCount = 0;
  for (const [k, n] of Object.entries(byCalc)) {
    if (n > topCount) {
      topCount = n;
      topKey = k;
    }
  }
  if (!topKey || topCount === 0) return '';
  return `${CALC_LABELS[topKey] ?? topKey} · ${topCount}`;
}
