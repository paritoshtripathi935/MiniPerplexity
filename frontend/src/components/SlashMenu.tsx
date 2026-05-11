import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import clsx from 'clsx';
import type { Play } from '../services/api';

interface Props {
  /** All available plays. The popover filters by the user's slash query. */
  plays: Play[];
  /** Substring after `/`. Empty = show all. */
  query: string;
  /** Fired when the user picks a play (Enter or click). */
  onSelect: (play: Play) => void;
  /** Fired when the user dismisses (Esc, blur). */
  onDismiss: () => void;
}

/**
 * Floating popover anchored above the composer. Shows fuzzy-filtered Plays
 * with keyboard navigation. Lives in normal document flow — the parent is
 * responsible for placing it (`absolute bottom-full` etc).
 */
export function SlashMenu({ plays, query, onSelect, onDismiss }: Props) {
  const filtered = useMemo(() => fuzzyFilter(plays, query), [plays, query]);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // Reset active index when the filter changes.
  useEffect(() => {
    setActive(0);
  }, [query, filtered.length]);

  // Keyboard nav lives at the document level so the textarea can keep focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(i => Math.min(i + 1, Math.max(0, filtered.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(i => Math.max(0, i - 1));
      } else if (e.key === 'Enter' && filtered[active]) {
        e.preventDefault();
        onSelect(filtered[active]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filtered, active, onSelect, onDismiss]);

  // Scroll the active item into view when it changes.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (filtered.length === 0) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-2 rounded-lg border border-border bg-surface shadow-popover px-3 py-2 text-body-sm text-fg-muted animate-fade-in">
        No plays match "{query}".
      </div>
    );
  }

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 rounded-lg border border-border bg-surface shadow-popover overflow-hidden animate-fade-in">
      <div className="px-3 py-1.5 text-label-caps uppercase text-fg-subtle border-b border-border bg-surface-sunken/60 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" />
          Plays
        </span>
        <span className="font-normal normal-case tracking-normal text-fg-subtle">
          ↑↓ to navigate · ↵ to run
        </span>
      </div>
      <ul ref={listRef} className="max-h-[260px] overflow-y-auto py-1">
        {filtered.map((p, i) => (
          <li key={p.id} data-idx={i}>
            <button
              onMouseEnter={() => setActive(i)}
              onMouseDown={e => {
                // mousedown fires before the textarea blur so the click
                // actually registers before the popover dismisses.
                e.preventDefault();
                onSelect(p);
              }}
              className={clsx(
                'w-full text-left px-3 py-2 transition-colors duration-100',
                i === active ? 'bg-surface-sunken' : 'hover:bg-surface-sunken/60'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-body-sm font-medium text-fg truncate">{p.title}</span>
                <span className="text-label-caps uppercase text-fg-subtle shrink-0">
                  {p.category}
                </span>
              </div>
              <div className="text-body-md text-fg-muted line-clamp-1 mt-0.5">{p.description}</div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Lightweight subsequence-match scorer. Plays whose title fully contains the
 * query rank highest; falls back to per-character subsequence on title +
 * description. Anything matching at all surfaces.
 */
function fuzzyFilter(plays: Play[], q: string): Play[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return plays;

  type Scored = { play: Play; score: number };
  const scored: Scored[] = [];

  for (const p of plays) {
    const t = p.title.toLowerCase();
    const d = p.description.toLowerCase();
    if (t === needle) {
      scored.push({ play: p, score: 1000 });
      continue;
    }
    if (t.startsWith(needle)) {
      scored.push({ play: p, score: 500 + needle.length });
      continue;
    }
    if (t.includes(needle)) {
      scored.push({ play: p, score: 250 });
      continue;
    }
    if (d.includes(needle)) {
      scored.push({ play: p, score: 100 });
      continue;
    }
    // Subsequence match on title characters.
    let i = 0;
    for (const c of t) {
      if (c === needle[i]) i++;
      if (i === needle.length) break;
    }
    if (i === needle.length) scored.push({ play: p, score: 50 });
  }

  return scored.sort((a, b) => b.score - a.score).map(s => s.play);
}
