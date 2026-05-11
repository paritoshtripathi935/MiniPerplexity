import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Cpu, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import {
  listChatModels, setPreferredChatModel,
  type ChatModelOption,
} from '../services/api';
import { useAuth } from '@clerk/clerk-react';

interface Props {
  /** Current selection. Falls back to the catalog's `default` when unset. */
  value: string | null;
  /** Fired after the server confirms the new preference is saved. */
  onChange: (modelId: string) => void;
}

/**
 * Compact dropdown for picking the chat model. Lives in the chat header.
 * Loads the catalog once on mount; saves on every selection. Closes on
 * outside click or Escape. The current selection's label is the trigger.
 */
export function ModelSelector({ value, onChange }: Props) {
  const { getToken, isSignedIn } = useAuth();
  const [models, setModels] = useState<ChatModelOption[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { models, default: def } = await listChatModels();
        if (cancelled) return;
        setModels(models);
        setDefaultId(def);
      } catch {
        /* leave catalog empty — selector renders disabled */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (models.length === 0) return null;

  const activeId = value ?? defaultId ?? models[0].id;
  const active = models.find(m => m.id === activeId) ?? models[0];

  const pick = async (modelId: string) => {
    if (modelId === activeId) {
      setOpen(false);
      return;
    }
    if (!isSignedIn) return;
    setSaving(modelId);
    try {
      await setPreferredChatModel(modelId, getToken);
      onChange(modelId);
      setOpen(false);
    } catch {
      /* swallow — caller can re-try; a toast system would surface this */
    } finally {
      setSaving(null);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={clsx(
          'inline-flex items-center gap-1.5 h-7 pl-2 pr-1.5 rounded-md',
          'text-body-md font-medium text-fg-muted hover:text-fg',
          'border border-border hover:border-border-strong bg-surface',
          'transition-colors duration-150',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={active.description}
      >
        <Cpu className="w-3 h-3" strokeWidth={2} />
        <span className="truncate max-w-[140px]">{active.label}</span>
        <ChevronDown className="w-3 h-3 text-fg-subtle" strokeWidth={2} />
      </button>

      {open && (
        <div
          role="listbox"
          className={clsx(
            'absolute right-0 top-full mt-1.5 z-30 w-72 p-1 rounded-lg',
            'bg-surface border border-border shadow-popover animate-fade-in',
          )}
        >
          {models.map(m => {
            const selected = m.id === activeId;
            const isSaving = saving === m.id;
            return (
              <button
                key={m.id}
                role="option"
                aria-selected={selected}
                disabled={isSaving}
                onClick={() => pick(m.id)}
                className={clsx(
                  'w-full text-left px-2.5 py-2 rounded-md flex items-start gap-2',
                  'transition-colors duration-150',
                  selected
                    ? 'bg-brand-subtle text-fg'
                    : 'hover:bg-surface-sunken text-fg',
                  isSaving && 'opacity-60 cursor-progress',
                )}
              >
                <div className="grid place-items-center w-4 h-4 mt-0.5 shrink-0">
                  {selected ? (
                    <Check className="w-3.5 h-3.5 text-brand" strokeWidth={2.5} />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-body-sm font-medium truncate">{m.label}</span>
                    {m.recommended && (
                      <span className="inline-flex items-center gap-0.5 text-[9.5px] uppercase tracking-[0.06em] font-semibold text-brand shrink-0">
                        <Sparkles className="w-2.5 h-2.5" strokeWidth={2.5} />
                        Recommended
                      </span>
                    )}
                  </div>
                  <div className="text-[11.5px] text-fg-muted mt-0.5 leading-snug">
                    {m.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
