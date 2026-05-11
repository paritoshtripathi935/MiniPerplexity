import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import {
  Activity, Beaker, Eye, FileText, History, PieChart, Play as PlayIcon,
  Search as SearchIcon, Shield, TrendingUp, Users, Zap,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import {
  getPlaysHistory, listPlays,
  type Play, type PlayHistoryItem,
} from '../services/api';
import { PageHeader } from '../components/AppLayout';
import { Card } from '../components/ui/Card';
import { PlayRunModal } from '../components/PlayRunModal';

const ICONS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  Activity, Beaker, Eye, FileText, PieChart, Search: SearchIcon,
  Shield, TrendingUp, Users, Zap,
};

interface Props {
  darkMode: boolean;
  onPrepareRun: (play: Play, query: string, sessionId: string) => void;
}

export function PlaysPage({ onPrepareRun }: Props) {
  const navigate = useNavigate();
  const { getToken, isSignedIn } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [plays, setPlays] = useState<Play[]>([]);
  const [history, setHistory] = useState<PlayHistoryItem[]>([]);
  const [filter, setFilter] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [activePlay, setActivePlay] = useState<Play | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { plays } = await listPlays();
        setPlays(plays);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Plays history is signed-in only — anonymous users don't have one. Failure
  // is non-fatal: the section just stays hidden.
  useEffect(() => {
    if (!isSignedIn) return;
    (async () => {
      try {
        const { items } = await getPlaysHistory(getToken);
        setHistory(items);
      } catch {
        /* leave empty — section won't render */
      }
    })();
  }, [isSignedIn, getToken]);

  // Deep-link support: `/plays?run=<play_id>` opens the run modal directly.
  // Used by the home anchor card when it suggests a specific play.
  useEffect(() => {
    const runId = searchParams.get('run');
    if (!runId || plays.length === 0) return;
    const target = plays.find(p => p.id === runId);
    if (target) {
      setActivePlay(target);
      // Clear so a back-then-forward doesn't reopen unexpectedly.
      const next = new URLSearchParams(searchParams);
      next.delete('run');
      setSearchParams(next, { replace: true });
    }
  }, [plays, searchParams, setSearchParams]);

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(plays.map(p => p.category)))],
    [plays]
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

  // Recently-used plays the user has actually run, joined to the catalog so
  // we can render full play metadata for the run modal. History entries
  // referencing plays no longer in the catalog are filtered out silently.
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

  return (
    <>
      <PageHeader
        title="Plays"
        subtitle="Pre-baked playbooks for the most common asks. Pick one, fill a few inputs, get a marketer-grade output."
      />

      {recentPlays.length > 0 && (
        <RecentlyUsedSection
          recentPlays={recentPlays}
          onPick={p => setActivePlay(p)}
        />
      )}

      <h2 className="text-[11px] uppercase tracking-[0.08em] font-semibold text-fg-subtle mb-3">
        All plays
      </h2>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search plays"
            className="w-full pl-9 pr-3 h-9 rounded-md text-[13px] bg-surface border border-border placeholder:text-fg-subtle outline-none focus-visible:shadow-focus"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={clsx(
                'h-8 px-3 rounded-md text-[12px] font-medium transition-colors duration-150',
                filter === c
                  ? 'bg-fg text-fg-inverted'
                  : 'bg-surface border border-border text-fg-muted hover:text-fg hover:bg-surface-sunken'
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-[13px] text-fg-muted">Loading plays…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(p => {
            const Icon = ICONS[p.icon ?? ''] ?? PlayIcon;
            return (
              <button
                key={p.id}
                onClick={() => setActivePlay(p)}
                className="group text-left focus-visible:outline-none focus-visible:shadow-focus rounded-lg"
              >
                <Card interactive className="p-4 h-full">
                  <div className="flex items-center justify-between mb-3">
                    <div className="grid place-items-center w-8 h-8 rounded-md bg-surface-sunken text-fg-muted group-hover:bg-brand-subtle group-hover:text-brand transition-colors">
                      <Icon className="w-4 h-4" strokeWidth={2} />
                    </div>
                    <span className="text-[10px] uppercase tracking-[0.08em] font-medium text-fg-subtle">
                      {p.category}
                    </span>
                  </div>
                  <h3 className="font-display font-semibold text-[14px] tracking-tight mb-1">
                    {p.title}
                  </h3>
                  <p className="text-[13px] text-fg-muted leading-snug line-clamp-3">
                    {p.description}
                  </p>
                </Card>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-[13px] text-fg-muted col-span-full">No plays match.</p>
          )}
        </div>
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

/* ---------- Recently used ---------------------------------------------- */

interface RecentPlay {
  play: Play;
  lastRunAt: string;
  runCount: number;
}

function RecentlyUsedSection({
  recentPlays,
  onPick,
}: {
  recentPlays: RecentPlay[];
  onPick: (play: Play) => void;
}) {
  return (
    <section className="mb-8">
      <h2 className="text-[11px] uppercase tracking-[0.08em] font-semibold text-fg-subtle mb-3 flex items-center gap-1.5">
        <History className="w-3 h-3" />
        Recently used
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {recentPlays.map(({ play, lastRunAt, runCount }) => {
          const Icon = ICONS[play.icon ?? ''] ?? PlayIcon;
          return (
            <button
              key={play.id}
              onClick={() => onPick(play)}
              className="group text-left focus-visible:outline-none focus-visible:shadow-focus rounded-lg"
            >
              <Card interactive className="p-4 h-full">
                <div className="flex items-center justify-between mb-3">
                  <div className="grid place-items-center w-8 h-8 rounded-md bg-brand-subtle text-brand">
                    <Icon className="w-4 h-4" strokeWidth={2} />
                  </div>
                  <span className="text-[11px] text-fg-subtle tabular-nums">
                    {runCount} run{runCount === 1 ? '' : 's'}
                  </span>
                </div>
                <h3 className="font-display font-semibold text-[14px] tracking-tight mb-1">
                  {play.title}
                </h3>
                <div className="flex items-center justify-between gap-2 mt-2">
                  <span className="text-[12px] text-fg-subtle">
                    {relativeTime(lastRunAt)}
                  </span>
                  <span className="text-[12px] text-brand font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    Run again →
                  </span>
                </div>
              </Card>
            </button>
          );
        })}
      </div>
    </section>
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
