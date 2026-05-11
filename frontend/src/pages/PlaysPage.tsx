import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import {
  Activity, Beaker, Eye, FileText, History, PieChart, Play as PlayIcon,
  Search as SearchIcon, Shield, TrendingUp, Users, Zap,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { type Play } from '../services/api';
import { usePlays, usePlaysHistory } from '../services/queries';
import { PageHeader } from '../components/AppLayout';
import { PlayRunModal } from '../components/PlayRunModal';

const ICONS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  Activity, Beaker, Eye, FileText, PieChart, Search: SearchIcon,
  Shield, TrendingUp, Users, Zap,
};

interface Props {
  darkMode: boolean;
  onPrepareRun: (play: Play, query: string, sessionId: string) => void;
}

/**
 * Plays catalog — operational list, not a card grid.
 *
 * Rebuilt under PAI-13 / PR H to drop the "dashboard grid syndrome"
 * 3-column tile layout in favour of stacked rows with internal dividers
 * (per DESIGN.md's "1px borders instead of large gaps" rule). Recent
 * plays at the top, full catalog below. Both surfaces use the same row
 * shape so visual rhythm is consistent.
 */
export function PlaysPage({ onPrepareRun }: Props) {
  const navigate = useNavigate();
  const { getToken, isSignedIn } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [activePlay, setActivePlay] = useState<Play | null>(null);
  const { data: plays = [], isLoading: loading } = usePlays();
  const { data: history = [] } = usePlaysHistory(getToken, !!isSignedIn);

  // Deep-link support: `/plays?run=<play_id>` opens the run modal directly.
  useEffect(() => {
    const runId = searchParams.get('run');
    if (!runId || plays.length === 0) return;
    const target = plays.find(p => p.id === runId);
    if (target) {
      setActivePlay(target);
      const next = new URLSearchParams(searchParams);
      next.delete('run');
      setSearchParams(next, { replace: true });
    }
  }, [plays, searchParams, setSearchParams]);

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(plays.map(p => p.category)))],
    [plays],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return plays
      .filter(p => filter === 'All' || p.category === filter)
      .filter(p => !q || p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
  }, [plays, filter, search]);

  const handleSubmit = (play: Play, query: string) => {
    const sid = uuidv4();
    onPrepareRun(play, query, sid);
    navigate(`/investigations/${sid}`);
  };

  const recentPlays = useMemo<RecentPlay[]>(() => {
    if (history.length === 0 || plays.length === 0) return [];
    const byId = new Map(plays.map(p => [p.id, p]));
    return history
      .map(h => {
        const play = byId.get(h.play_id);
        return play ? { play, lastRunAt: h.last_run_at, runCount: h.run_count } : null;
      })
      .filter((x): x is RecentPlay => x !== null)
      .slice(0, 6);
  }, [history, plays]);

  const filterActive = filter !== 'All' || search.trim().length > 0;

  return (
    <>
      <PageHeader
        title="Plays"
        subtitle="Pre-built playbooks for common growth-ops asks. Pick one, fill a few inputs, get a marketer-grade output."
      />

      {recentPlays.length > 0 && (
        <section className="mb-8">
          <h2 className="text-label-caps uppercase text-on-surface-variant mb-3 flex items-center gap-1.5">
            <History className="w-3 h-3" aria-hidden />
            Recently used
          </h2>
          <PlayList>
            {recentPlays.map(({ play, lastRunAt, runCount }) => (
              <PlayRow
                key={play.id}
                play={play}
                onClick={() => setActivePlay(play)}
                trailing={
                  <span className="flex items-center gap-3 shrink-0 text-body-sm text-on-surface-variant tabular-nums">
                    <span>{runCount} run{runCount === 1 ? '' : 's'}</span>
                    <span className="text-outline-variant" aria-hidden>·</span>
                    <span>{relativeTime(lastRunAt)}</span>
                  </span>
                }
              />
            ))}
          </PlayList>
        </section>
      )}

      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-label-caps uppercase text-on-surface-variant">All plays</h2>
        {filterActive && (
          <button
            type="button"
            onClick={() => {
              setFilter('All');
              setSearch('');
            }}
            className="text-body-sm text-primary hover:underline"
          >
            Clear filter
          </button>
        )}
      </header>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search plays"
            className="w-full pl-9 pr-3 h-9 rounded-control text-body-sm bg-surface border border-outline-variant placeholder:text-outline outline-none focus-visible:shadow-focus"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={clsx(
                'h-8 px-3 rounded-control text-body-md font-medium transition-colors',
                filter === c
                  ? 'bg-on-surface text-surface'
                  : 'bg-surface border border-outline-variant text-on-surface-variant hover:text-on-surface hover:border-outline',
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-body-sm text-on-surface-variant">Loading plays…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-card border border-dashed border-outline-variant px-4 py-10 text-center text-body-sm text-on-surface-variant">
          No plays match this filter.{' '}
          <button
            type="button"
            onClick={() => {
              setFilter('All');
              setSearch('');
            }}
            className="text-primary hover:underline"
          >
            Show all
          </button>
        </div>
      ) : (
        <PlayList>
          {filtered.map(p => (
            <PlayRow
              key={p.id}
              play={p}
              onClick={() => setActivePlay(p)}
              trailing={
                <span className="inline-flex items-center px-1.5 h-5 rounded-control bg-surface-container-high text-label-caps text-on-surface-variant shrink-0">
                  {p.category}
                </span>
              }
            />
          ))}
        </PlayList>
      )}

      {activePlay && (
        <PlayRunModal
          play={activePlay}
          onClose={() => setActivePlay(null)}
          onSubmit={(p, q) => {
            setActivePlay(null);
            handleSubmit(p, q);
          }}
        />
      )}
    </>
  );
}

/* ----------------------------- Sub-components --------------------------- */

interface RecentPlay {
  play: Play;
  lastRunAt: string;
  runCount: number;
}

function PlayList({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-outline-variant bg-surface-container-low divide-y divide-outline-variant overflow-hidden">
      {children}
    </div>
  );
}

function PlayRow({
  play,
  onClick,
  trailing,
}: {
  play: Play;
  onClick: () => void;
  trailing?: React.ReactNode;
}) {
  const Icon = ICONS[play.icon ?? ''] ?? PlayIcon;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-surface-container transition-colors focus-visible:outline-none focus-visible:shadow-focus"
    >
      <span className="grid place-items-center w-7 h-7 rounded-control bg-surface-container text-on-surface-variant shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5" strokeWidth={2} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-body-base text-on-surface font-medium truncate">
          {play.title}
        </span>
        <span className="block text-body-sm text-on-surface-variant leading-snug line-clamp-1">
          {play.description}
        </span>
      </span>
      {trailing}
    </button>
  );
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
