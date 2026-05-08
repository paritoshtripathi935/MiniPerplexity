import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, Beaker, Eye, FileText, PieChart, Play as PlayIcon, Search as SearchIcon,
  Shield, TrendingUp, Users, X, Zap,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { listPlays, type Play, type PlayInput } from '../services/api';
import { PageHeader } from '../components/AppLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

const ICONS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  Activity, Beaker, Eye, FileText, PieChart, Search: SearchIcon,
  Shield, TrendingUp, Users, Zap,
};

interface Props {
  darkMode: boolean;
  onPrepareRun: (play: Play, query: string, sessionId: string) => void;
}

function buildQuery(play: Play, values: Record<string, string>): string {
  const lines: string[] = [`Run the "${play.title}" play.`];
  for (const i of play.inputs) {
    const v = (values[i.key] ?? '').trim();
    if (v) lines.push(`- ${i.label}: ${v}`);
  }
  return lines.join('\n');
}

export function PlaysPage({ onPrepareRun }: Props) {
  const navigate = useNavigate();
  const [plays, setPlays] = useState<Play[]>([]);
  const [filter, setFilter] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [activePlay, setActivePlay] = useState<Play | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
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

  const startPlay = (p: Play) => {
    const blank: Record<string, string> = {};
    for (const i of p.inputs) blank[i.key] = '';
    setValues(blank);
    setActivePlay(p);
    setErr(null);
  };

  const submit = () => {
    if (!activePlay) return;
    const missing = activePlay.inputs.filter(i => i.required && !values[i.key]?.trim());
    if (missing.length) {
      setErr(`Missing required: ${missing.map(m => m.label).join(', ')}`);
      return;
    }
    const sid = uuidv4();
    const query = buildQuery(activePlay, values);
    onPrepareRun(activePlay, query, sid);
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
                onClick={() => startPlay(p)}
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
          values={values}
          setValues={setValues}
          onSubmit={submit}
          onClose={() => setActivePlay(null)}
          err={err}
        />
      )}
    </>
  );
}

interface ModalProps {
  play: Play;
  values: Record<string, string>;
  setValues: (v: Record<string, string>) => void;
  onSubmit: () => void;
  onClose: () => void;
  err: string | null;
}

function PlayRunModal({ play, values, setValues, onSubmit, onClose, err }: ModalProps) {
  const update = (k: string, v: string) => setValues({ ...values, [k]: v });
  const inputCls =
    'w-full px-3 py-2 rounded-md border border-border bg-surface text-[13px] placeholder:text-fg-subtle outline-none focus-visible:shadow-focus';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 backdrop-blur-sm p-4 animate-fade-in">
      <div className="relative w-full max-w-lg rounded-xl bg-surface shadow-dialog border border-border">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 grid place-items-center w-7 h-7 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-sunken transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="p-6">
          <div className="text-[10px] uppercase tracking-[0.08em] font-medium text-fg-subtle mb-1">
            {play.category}
          </div>
          <h2 className="font-display text-[18px] font-semibold tracking-tight mb-1">
            {play.title}
          </h2>
          <p className="text-[13px] text-fg-muted mb-5 leading-relaxed">{play.description}</p>

          <div className="space-y-3.5">
            {play.inputs.map((i: PlayInput) => (
              <div key={i.key}>
                <label className="block text-[12px] font-medium mb-1 text-fg">
                  {i.label}
                  {i.required && <span className="text-danger ml-1">*</span>}
                </label>
                {i.type === 'textarea' ? (
                  <textarea
                    rows={3}
                    value={values[i.key] ?? ''}
                    onChange={e => update(i.key, e.target.value)}
                    placeholder={i.placeholder}
                    className={inputCls}
                  />
                ) : i.type === 'select' ? (
                  <select
                    value={values[i.key] ?? ''}
                    onChange={e => update(i.key, e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Select…</option>
                    {(i.options ?? []).map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={i.type === 'number' ? 'number' : 'text'}
                    value={values[i.key] ?? ''}
                    onChange={e => update(i.key, e.target.value)}
                    placeholder={i.placeholder}
                    className={inputCls}
                  />
                )}
              </div>
            ))}
          </div>

          {err && (
            <div className="mt-4 px-3 py-2 text-[13px] rounded-md bg-danger-subtle text-danger">
              {err}
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={onSubmit} leadingIcon={<PlayIcon className="w-3.5 h-3.5" />}>
              Run play
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
