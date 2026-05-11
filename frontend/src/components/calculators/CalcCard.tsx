import React from 'react';
import { Card } from '../ui/Card';

export const inputCls =
  'w-full px-2.5 h-9 rounded-md border border-border bg-surface text-body-sm tabular-nums placeholder:text-fg-subtle outline-none focus-visible:shadow-focus';

export function CalcCard({
  title,
  description,
  children,
  results,
  insight,
  headerRight,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  results: React.ReactNode;
  insight?: React.ReactNode;
  headerRight?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display font-semibold text-body-base tracking-tight">{title}</h3>
          <p className="text-body-md text-fg-muted mt-0.5 leading-relaxed">{description}</p>
        </div>
        {headerRight && <div className="shrink-0">{headerRight}</div>}
      </div>
      <div className="space-y-3">{children}</div>
      <div className="mt-4 pt-3 border-t border-border space-y-1.5">{results}</div>
      {insight}
      {footer}
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
      <span className="block text-label-caps uppercase text-fg-subtle mb-1">
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
      <span className="text-body-md text-fg-subtle">{label}</span>
      <span
        className={`font-mono ${emphasised ? 'text-body-base font-semibold text-fg' : 'text-body-sm text-fg'}`}
      >
        {value}
      </span>
    </div>
  );
}
