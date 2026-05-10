import React from 'react';
import { Sparkles } from 'lucide-react';
import { PRESETS, PRESET_KEYS } from './presets';
import { usePreset } from './PresetContext';

/** Industry preset selector. One click fills defaults across every calc. */
export function PresetBar() {
  const { preset, apply } = usePreset();
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.06em] font-medium text-fg-subtle">
        <Sparkles className="w-3 h-3" aria-hidden />
        Preset
      </span>
      {PRESET_KEYS.map(k => {
        const p = PRESETS[k];
        const active = preset === k;
        return (
          <button
            key={k}
            onClick={() => apply(k)}
            title={p.description}
            className={`h-7 px-2.5 text-[11px] rounded-md border transition-colors ${
              active
                ? 'border-brand text-brand bg-brand-subtle font-medium'
                : 'border-border text-fg-muted hover:text-fg hover:border-border-strong'
            }`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
