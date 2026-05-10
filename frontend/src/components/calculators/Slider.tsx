import React from 'react';

interface Props {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}

/** Range slider for fast input exploration alongside the numeric field. */
export function Slider({ label, min, max, step, value, onChange, format }: Props) {
  const display = format ? format(value) : `${value}`;
  const safe = isFinite(value) ? Math.min(Math.max(value, min), max) : min;
  return (
    <div>
      <div className="flex justify-between items-baseline text-[10px] uppercase tracking-[0.06em] font-medium text-fg-subtle mb-1">
        <span>{label}</span>
        <span className="font-mono normal-case tracking-normal text-[11px] text-fg-muted">
          {display}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={safe}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-brand h-1.5 cursor-pointer"
        aria-label={label}
      />
    </div>
  );
}
