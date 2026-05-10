import React from 'react';
import { Card } from '../ui/Card';

export const inputCls =
  'w-full px-2.5 h-9 rounded-md border border-border bg-surface text-[13px] tabular-nums placeholder:text-fg-subtle outline-none focus-visible:shadow-focus';

export function CalcCard({
  title,
  description,
  children,
  results,
  insight,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  results: React.ReactNode;
  insight?: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4">
        <h3 className="font-display font-semibold text-[14px] tracking-tight">{title}</h3>
        <p className="text-[12px] text-fg-muted mt-0.5 leading-relaxed">{description}</p>
      </div>
      <div className="space-y-3">{children}</div>
      <div className="mt-4 pt-3 border-t border-border space-y-1.5">{results}</div>
      {insight}
    </Card>
  );
}

export function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.06em] font-medium text-fg-subtle mb-1">
        {label}
      </span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        inputMode="decimal"
        className={inputCls}
      />
    </label>
  );
}

export function Result({
  label,
  value,
  emphasised = false,
}: {
  label: string;
  value: string;
  emphasised?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[12px] text-fg-subtle">{label}</span>
      <span
        className={`font-mono ${emphasised ? 'text-[15px] font-semibold text-fg' : 'text-[13px] text-fg'}`}
      >
        {value}
      </span>
    </div>
  );
}
