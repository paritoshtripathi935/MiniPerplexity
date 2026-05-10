import React, { useState } from 'react';
import { Bookmark, Copy, GitCompare, Plus, X } from 'lucide-react';
import type { Scenario } from './useScenarios';

interface Props {
  scenarios: Scenario[];
  onSave: (name: string) => void;
  onLoad: (s: Scenario) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onCompareToggle: () => void;
  compareOpen: boolean;
}

/** Rendered in CalcCard's footer. Save current state, load saved chips, open compare. */
export function ScenarioBar({
  scenarios,
  onSave,
  onLoad,
  onRemove,
  onDuplicate,
  onCompareToggle,
  compareOpen,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState('');

  const startAdd = () => {
    setDraftName(scenarios.length === 0 ? 'Current' : `Scenario ${scenarios.length + 1}`);
    setAdding(true);
  };

  const commitAdd = () => {
    const name = draftName.trim();
    if (name) onSave(name);
    setAdding(false);
    setDraftName('');
  };

  return (
    <div className="mt-4 pt-3 border-t border-border">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[10px] uppercase tracking-[0.06em] font-medium text-fg-subtle">
          Scenarios
        </span>
        <div className="flex items-center gap-1">
          {scenarios.length >= 2 && (
            <button
              onClick={onCompareToggle}
              className={`inline-flex items-center gap-1 h-7 px-2 text-[11px] rounded-md border transition-colors ${
                compareOpen
                  ? 'border-brand text-brand bg-brand-subtle'
                  : 'border-border text-fg-muted hover:text-fg hover:border-border-strong'
              }`}
            >
              <GitCompare className="w-3 h-3" />
              Compare
            </button>
          )}
          {!adding ? (
            <button
              onClick={startAdd}
              className="inline-flex items-center gap-1 h-7 px-2 text-[11px] rounded-md border border-border text-fg-muted hover:text-fg hover:border-border-strong transition-colors"
            >
              <Plus className="w-3 h-3" />
              Save
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={draftName}
                onChange={e => setDraftName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitAdd();
                  if (e.key === 'Escape') {
                    setAdding(false);
                    setDraftName('');
                  }
                }}
                className="h-7 px-2 text-[11px] rounded-md border border-border bg-surface outline-none focus-visible:shadow-focus w-32"
                placeholder="Name"
              />
              <button
                onClick={commitAdd}
                className="h-7 px-2 text-[11px] rounded-md bg-brand text-brand-fg font-medium hover:bg-brand/90"
              >
                Save
              </button>
            </div>
          )}
        </div>
      </div>

      {scenarios.length === 0 ? (
        <p className="text-[11px] text-fg-subtle leading-relaxed">
          Save the current numbers to compare against optimised or aggressive variants later.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {scenarios.map(s => (
            <div
              key={s.id}
              className="group inline-flex items-center h-7 rounded-md border border-border bg-surface text-[11px] overflow-hidden"
            >
              <button
                onClick={() => onLoad(s)}
                className="inline-flex items-center gap-1 px-2 h-full text-fg hover:bg-surface-sunken transition-colors"
                title="Load"
              >
                <Bookmark className="w-3 h-3 text-fg-subtle" />
                {s.name}
              </button>
              <button
                onClick={() => onDuplicate(s.id)}
                className="px-1.5 h-full text-fg-subtle hover:text-fg hover:bg-surface-sunken border-l border-border opacity-0 group-hover:opacity-100 transition-opacity"
                title="Duplicate"
                aria-label={`Duplicate ${s.name}`}
              >
                <Copy className="w-3 h-3" />
              </button>
              <button
                onClick={() => onRemove(s.id)}
                className="px-1.5 h-full text-fg-subtle hover:text-danger hover:bg-danger-subtle border-l border-border opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete"
                aria-label={`Delete ${s.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
