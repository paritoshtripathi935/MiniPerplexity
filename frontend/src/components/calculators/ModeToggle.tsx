import React from 'react';

export type CalcMode = 'forward' | 'reverse';

/** Segmented forward / reverse toggle pinned in each CalcCard's header. */
export function ModeToggle({
  mode,
  onChange,
  reverseLabel = 'Reverse',
}: {
  mode: CalcMode;
  onChange: (m: CalcMode) => void;
  reverseLabel?: string;
}) {
  const base =
    'h-7 px-2.5 text-[11px] font-medium tracking-tight transition-colors focus-visible:shadow-focus outline-none';
  const active = 'bg-surface text-fg shadow-card';
  const idle = 'text-fg-subtle hover:text-fg';
  return (
    <div
      role="tablist"
      aria-label="Calculation mode"
      className="inline-flex items-center bg-surface-sunken border border-border rounded-md p-0.5 gap-0.5"
    >
      <button
        role="tab"
        aria-selected={mode === 'forward'}
        onClick={() => onChange('forward')}
        className={`${base} rounded-[5px] ${mode === 'forward' ? active : idle}`}
      >
        Forward
      </button>
      <button
        role="tab"
        aria-selected={mode === 'reverse'}
        onClick={() => onChange('reverse')}
        className={`${base} rounded-[5px] ${mode === 'reverse' ? active : idle}`}
      >
        {reverseLabel}
      </button>
    </div>
  );
}
