import React from 'react';
import { PRESETS, PRESET_KEYS } from './presets';
import { usePreset } from './PresetContext';

/** Industry preset selector. One click fills defaults across every calc. */
export function PresetBar() {
  const { preset, apply } = usePreset();
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-label-caps text-on-surface-variant uppercase">
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
