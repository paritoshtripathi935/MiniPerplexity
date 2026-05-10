import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';
import type { Insight as InsightData } from './benchmarks';

const ICON = {
  good: CheckCircle2,
  warn: AlertTriangle,
  bad: AlertCircle,
} as const;

const TONE = {
  good: 'bg-success-subtle text-success',
  warn: 'bg-warning-subtle text-warning',
  bad: 'bg-danger-subtle text-danger',
} as const;

/** Status banner under a calculator's results — interprets the number. */
export function Insight({ insight }: { insight: InsightData | null }) {
  if (!insight) return null;
  const Icon = ICON[insight.state];
  return (
    <div
      role="status"
      className={`flex gap-2 mt-3 px-2.5 py-2 rounded-md ${TONE[insight.state]}`}
    >
      <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
      <div className="text-[12px] leading-relaxed">
        <div className="font-medium">{insight.headline}</div>
        <div className="text-[11px] opacity-80 mt-0.5">{insight.benchmark}</div>
      </div>
    </div>
  );
}
