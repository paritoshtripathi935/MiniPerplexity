import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity, Beaker, Eye, FileText, PieChart, Play as PlayIcon,
  Search as SearchIcon, Shield, TrendingUp, Users, Zap,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { listPlays, type Play } from '../services/api';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [plays, setPlays] = useState<Play[]>([]);
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
    navigate(`/chat/${sid}`);
  };

  return (
    <>
      <PageHeader
        title="Plays"
        subtitle="Pre-baked playbooks for the most common asks. Pick one, fill a few inputs, get a marketer-grade output."
      />

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
