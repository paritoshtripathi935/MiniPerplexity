import React, { useEffect, useState } from 'react';
import { Play as PlayIcon, X, Sparkles } from 'lucide-react';
import { Button } from './ui/Button';
import type { Play, PlayInput } from '../services/api';

interface Props {
  play: Play;
  onClose: () => void;
  /**
   * Fired when the user submits valid inputs. Receives the templated query
   * string + the play instance. The host decides what to do (run in current
   * session, hand off to a fresh session, etc).
   */
  onSubmit: (play: Play, query: string) => void;
}

/**
 * Composes a "Run the X play" prompt with the user-provided field values.
 * Format kept consistent with the catalog so the system prompt can rely
 * on the inputs being labelled.
 */
function buildQuery(play: Play, values: Record<string, string>): string {
  const lines: string[] = [`Run the "${play.title}" play.`];
  for (const i of play.inputs) {
    const v = (values[i.key] ?? '').trim();
    if (v) lines.push(`- ${i.label}: ${v}`);
  }
  return lines.join('\n');
}

/**
 * Modal that collects a Play's inputs and hands the composed query back to
 * the parent. Used by /plays and from the slash-menu in /chat.
 */
export function PlayRunModal({ play, onClose, onSubmit }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const blank: Record<string, string> = {};
    for (const i of play.inputs) blank[i.key] = '';
    return blank;
  });
  const [err, setErr] = useState<string | null>(null);

  // Esc closes.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const update = (k: string, v: string) => setValues(prev => ({ ...prev, [k]: v }));

  const submit = () => {
    const missing = play.inputs.filter(i => i.required && !values[i.key]?.trim());
    if (missing.length) {
      setErr(`Missing required: ${missing.map(m => m.label).join(', ')}`);
      return;
    }
    setErr(null);
    onSubmit(play, buildQuery(play, values));
  };

  const inputCls =
    'w-full px-3 py-2 rounded-md border border-border bg-surface text-body-sm placeholder:text-fg-subtle outline-none focus-visible:shadow-focus';

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
          <div className="flex items-center gap-1.5 text-label-caps uppercase text-fg-subtle mb-1">
            <Sparkles className="w-3 h-3" />
            {play.category}
          </div>
          <h2 className="font-display text-h2 font-semibold tracking-tight mb-1">
            {play.title}
          </h2>
          <p className="text-body-sm text-fg-muted mb-5 leading-relaxed">
            {play.description}
          </p>

          <div className="space-y-3.5">
            {play.inputs.map((i: PlayInput) => (
              <div key={i.key}>
                <label className="block text-body-md font-medium mb-1 text-fg">
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
                    className={inputCls}
                  />
                )}
              </div>
            ))}
          </div>

          {err && (
            <div className="mt-4 px-3 py-2 text-body-sm rounded-md bg-danger-subtle text-danger">
              {err}
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={submit}
              leadingIcon={<PlayIcon className="w-3.5 h-3.5" />}
            >
              Run play
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
