import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, Beaker, Eye, FileText, PieChart, Play as PlayIcon, Search as SearchIcon,
  Shield, TrendingUp, Users, X, Zap,
} from 'lucide-react';
import { listPlays, type Play, type PlayInput } from '../services/api';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Activity, Beaker, Eye, FileText, PieChart, Search: SearchIcon,
  Shield, TrendingUp, Users, Zap,
};

interface Props {
  darkMode: boolean;
  /** Called when the user submits a Play. Parent should compose the query
   *  string from the Play + values and run /search → /answer. */
  onRun: (play: Play, query: string) => void;
}

/**
 * Compose a templated query string from a Play and its filled-in inputs.
 * The backend layers the Play's instructions + output schema onto the
 * system prompt; this string just states the user's specifics in prose.
 */
function buildQuery(play: Play, values: Record<string, string>): string {
  const lines: string[] = [`Run the "${play.title}" play.`];
  for (const i of play.inputs) {
    const v = (values[i.key] ?? '').trim();
    if (v) lines.push(`- ${i.label}: ${v}`);
  }
  return lines.join('\n');
}

export function PlayPicker({ darkMode, onRun }: Props) {
  const [plays, setPlays] = useState<Play[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [activePlay, setActivePlay] = useState<Play | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<string>('All');

  useEffect(() => {
    (async () => {
      try {
        const { plays } = await listPlays();
        setPlays(plays);
      } catch (e: any) {
        setErr(e?.message ?? 'Failed to load plays');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(plays.map(p => p.category)));
    return ['All', ...cats];
  }, [plays]);

  const visible = useMemo(
    () => (filter === 'All' ? plays : plays.filter(p => p.category === filter)),
    [plays, filter]
  );

  const startPlay = (play: Play) => {
    const blank: Record<string, string> = {};
    for (const i of play.inputs) blank[i.key] = '';
    setValues(blank);
    setActivePlay(play);
  };

  const submit = () => {
    if (!activePlay) return;
    const missing = activePlay.inputs.filter(i => i.required && !values[i.key]?.trim());
    if (missing.length) {
      setErr(`Missing required: ${missing.map(m => m.label).join(', ')}`);
      return;
    }
    setErr(null);
    onRun(activePlay, buildQuery(activePlay, values));
    setActivePlay(null);
  };

  const tile = darkMode
    ? 'bg-gray-900 hover:bg-gray-800 border-gray-800'
    : 'bg-white hover:bg-gray-50 border-gray-200';

  if (loading) {
    return <div className="px-3 py-4 text-sm opacity-60">Loading plays…</div>;
  }
  if (err && !activePlay) {
    return <div className="px-3 py-4 text-sm text-red-400">{err}</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 flex flex-wrap gap-1">
        {categories.map(c => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`text-xs px-2.5 py-1 rounded-full border ${
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

      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-2">
        {visible.map(p => {
          const Icon = ICONS[p.icon ?? ''] ?? PlayIcon;
          return (
            <button
              key={p.id}
              onClick={() => startPlay(p)}
              className={`w-full text-left rounded-lg border ${tile} p-3 transition`}
            >
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-blue-500 shrink-0" />
                <div className="font-medium text-sm">{p.title}</div>
                <div className="ml-auto text-[10px] uppercase tracking-wider opacity-50">
                  {p.category}
                </div>
              </div>
              <div className="mt-1 text-xs opacity-70 line-clamp-2">{p.description}</div>
            </button>
          );
        })}
      </div>

      {activePlay && (
        <PlayRunModal
          darkMode={darkMode}
          play={activePlay}
          values={values}
          setValues={setValues}
          onSubmit={submit}
          onClose={() => {
            setActivePlay(null);
            setErr(null);
          }}
          err={err}
        />
      )}
    </div>
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
                      <option key={o} value={o}>
                        {o}
                      </option>
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
            <button onClick={onClose} className={`px-3 py-2 text-sm ${subtle}`}>
              Cancel
            </button>
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
