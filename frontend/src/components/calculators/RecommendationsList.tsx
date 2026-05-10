import React from 'react';
import { Lightbulb } from 'lucide-react';
import type { Recommendation } from './recommendations';

/** Ranked next-step recommendations rendered under the Insight banner. */
export function Recommendations({ items }: { items: Recommendation[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2 px-2.5 py-2 rounded-md bg-surface-sunken border border-border">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Lightbulb className="w-3.5 h-3.5 text-fg-muted" aria-hidden />
        <span className="text-[10px] uppercase tracking-[0.06em] font-medium text-fg-subtle">
          Next steps
        </span>
      </div>
      <ol className="space-y-1 text-[12px] leading-relaxed text-fg">
        {items.map((r, i) => (
          <li key={r.id} className="flex gap-2">
            <span className="font-mono text-fg-subtle tabular-nums shrink-0">{i + 1}.</span>
            <span>{r.description}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
