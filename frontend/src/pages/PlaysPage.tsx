import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, Beaker, Eye, FileText, PieChart, Play as PlayIcon, Search as SearchIcon,
  Shield, TrendingUp, Users, X, Zap, Sparkles,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { listPlays, type Play, type PlayInput } from '../services/api';
import { PageHeader } from '../components/AppLayout';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Activity, Beaker, Eye, FileText, PieChart, Search: SearchIcon,
  Shield, TrendingUp, Users, Zap,
};

const ACCENTS: Record<string, string> = {
  Creative: 'text-purple-500 bg-purple-500/10',
  Research: 'text-blue-500 bg-blue-500/10',
  Planning: 'text-emerald-500 bg-emerald-500/10',
  Audit: 'text-amber-500 bg-amber-500/10',
};

interface Props {
  darkMode: boolean;
  /** Persisted in App so we can hand it off to ChatPage. */
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

export function PlaysPage({ darkMode, onPrepareRun }: Props) {
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

  const card = darkMode
    ? 'bg-gray-900 border-gray-800 hover:border-gray-700'
    : 'bg-white border-gray-200 hover:border-gray-300 shadow-sm';
  const subtle = darkMode ? 'text-gray-400' : 'text-gray-500';
  const inputCls = darkMode
    ? 'bg-gray-900 border-gray-800 placeholder-gray-500 text-gray-100'
    : 'bg-white border-gray-300 placeholder-gray-400 text-gray-900';

  return (
    <>
      <PageHeader
        title="Plays"
        subtitle="Pre-baked playbooks for the most common asks. Pick one, fill a few inputs, get a marketer-grade output. Free while in beta."
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className={`relative flex-1 max-w-md ${subtle}`}>
          <SearchIcon className="absolute left-3 top-2.5 w-4 h-4 opacity-60" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search plays…"
            className={`w-full pl-9 pr-3 py-2 rounded-lg text-sm border outline-none ${inputCls}`}
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`text-xs px-3 py-1.5 rounded-full border ${
                filter === c
                  ? 'bg-blue-600 text-white border-blue-600'
                  : darkMode
                    ? 'bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className={`text-sm ${subtle}`}>Loading plays…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => {
            const Icon = ICONS[p.icon ?? ''] ?? PlayIcon;
            const accent = ACCENTS[p.category] ?? 'text-blue-500 bg-blue-500/10';
            return (
              <button
                key={p.id}
                onClick={() => startPlay(p)}
                className={`group text-left rounded-xl border p-5 transition ${card}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-9 h-9 rounded-lg inline-flex items-center justify-center ${accent}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider ${subtle}`}>
                    {p.category}
                  </span>
                </div>
                <h3 className="font-semibold mb-1.5">{p.title}</h3>
                <p className={`text-sm ${subtle} line-clamp-3`}>{p.description}</p>
                <div className="mt-4 inline-flex items-center gap-1 text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition">
                  <PlayIcon className="w-3 h-3" /> Run
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className={`text-sm ${subtle} col-span-full`}>No plays match.</p>
          )}
        </div>
      )}

      {activePlay && (
        <PlayRunModal
          darkMode={darkMode}
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
  darkMode: boolean;
  play: Play;
  values: Record<string, string>;
  setValues: (v: Record<string, string>) => void;
  onSubmit: () => void;
  onClose: () => void;
  err: string | null;
}

function PlayRunModal({ darkMode, play, values, setValues, onSubmit, onClose, err }: ModalProps) {
  const card = darkMode ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900';
  const subtle = darkMode ? 'text-gray-400' : 'text-gray-500';
  const inputCls = darkMode
    ? 'bg-gray-800 border-gray-700 placeholder-gray-500 text-gray-100'
    : 'bg-white border-gray-300 placeholder-gray-400 text-gray-900';

  const update = (k: string, v: string) => setValues({ ...values, [k]: v });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={`relative w-full max-w-lg rounded-2xl shadow-2xl ${card}`}>
        <button
          onClick={onClose}
          className={`absolute top-3 right-3 p-1 rounded ${subtle} hover:opacity-100`}
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-blue-500" />
            <span className={`text-xs uppercase tracking-wider ${subtle}`}>{play.category}</span>
          </div>
          <h2 className="text-lg font-semibold mb-1">{play.title}</h2>
          <p className={`${subtle} text-sm mb-5`}>{play.description}</p>

          <div className="space-y-3">
            {play.inputs.map((i: PlayInput) => (
              <div key={i.key}>
                <label className="block text-sm font-medium mb-1">
                  {i.label}
                  {i.required && <span className="text-red-400 ml-1">*</span>}
                </label>
                {i.type === 'textarea' ? (
                  <textarea
                    rows={3}
                    value={values[i.key] ?? ''}
                    onChange={e => update(i.key, e.target.value)}
                    placeholder={i.placeholder}
                    className={`w-full px-3 py-2 rounded-lg border outline-none text-sm ${inputCls}`}
                  />
                ) : i.type === 'select' ? (
                  <select
                    value={values[i.key] ?? ''}
                    onChange={e => update(i.key, e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border outline-none text-sm ${inputCls}`}
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
                    className={`w-full px-3 py-2 rounded-lg border outline-none text-sm ${inputCls}`}
                  />
                )}
              </div>
            ))}
          </div>

          {err && (
            <div className="mt-4 px-3 py-2 text-sm rounded bg-red-500/10 text-red-400">
              {err}
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-2">
            <button onClick={onClose} className={`px-3 py-2 text-sm ${subtle}`}>Cancel</button>
            <button
              onClick={onSubmit}
              className="inline-flex items-center gap-1 text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500"
            >
              <PlayIcon className="w-4 h-4" /> Run play
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
