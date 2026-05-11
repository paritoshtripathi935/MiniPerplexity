import React from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import type { Scenario } from './useScenarios';

export interface CompareField {
  key: string;
  label: string;
  get: (s: Scenario) => unknown;
  format: (raw: unknown) => string;
  /** When true, lower deltas vs baseline are coloured success. */
  lowerIsBetter?: boolean;
  /** Pull a number out of the raw value for delta math. Default: Number(raw). */
  numeric?: (raw: unknown) => number | null;
}

interface Props {
  scenarios: Scenario[];
  fields: CompareField[];
}

function defaultNumeric(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return isFinite(n) ? n : null;
}

/** Inline comparison table. First scenario is the baseline; others show delta vs it. */
export function ScenarioCompare({ scenarios, fields }: Props) {
  if (scenarios.length < 2) return null;
  const [baseline, ...rest] = scenarios;

  return (
    <div className="mt-3 rounded-md border border-border overflow-x-auto">
      <table className="w-full text-body-md border-collapse">
        <thead>
          <tr className="bg-surface-sunken">
            <th className="text-left font-medium text-fg-subtle px-3 py-2 border-b border-border">
              Metric
            </th>
            {scenarios.map((s, i) => (
              <th
                key={s.id}
                className="text-right font-medium text-fg px-3 py-2 border-b border-border whitespace-nowrap"
              >
                {s.name}
                {i === 0 && (
                  <span className="ml-1 text-[10px] text-fg-subtle font-normal">(baseline)</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fields.map(field => {
            const raw = field.get;
            const num = field.numeric ?? defaultNumeric;
            const baseValue = num(raw(baseline));

            return (
              <tr key={field.key} className="border-b border-border last:border-0">
                <td className="text-fg-subtle px-3 py-1.5">{field.label}</td>
                {scenarios.map((s, i) => {
                  const value = raw(s);
                  const display = field.format(value);
                  const isBaseline = i === 0;
                  let deltaNode: React.ReactNode = null;

                  if (!isBaseline && baseValue != null) {
                    const v = num(value);
                    if (v != null && isFinite(v)) {
                      const diff = v - baseValue;
                      if (Math.abs(diff) < 1e-9) {
                        deltaNode = (
                          <span className="ml-1 inline-flex items-center text-[10px] text-fg-subtle">
                            <Minus className="w-2.5 h-2.5" />
                          </span>
                        );
                      } else {
                        const better =
                          field.lowerIsBetter == null
                            ? null
                            : field.lowerIsBetter
                              ? diff < 0
                              : diff > 0;
                        const tone =
                          better == null
                            ? 'text-fg-subtle'
                            : better
                              ? 'text-success'
                              : 'text-danger';
                        const Arrow = diff > 0 ? ArrowUp : ArrowDown;
                        const pct =
                          baseValue !== 0
                            ? ` ${(((v - baseValue) / Math.abs(baseValue)) * 100).toFixed(0)}%`
                            : '';
                        deltaNode = (
                          <span className={`ml-1 inline-flex items-center text-[10px] ${tone}`}>
                            <Arrow className="w-2.5 h-2.5" />
                            {pct}
                          </span>
                        );
                      }
                    }
                  }

                  return (
                    <td
                      key={s.id}
                      className="text-right font-mono tabular-nums text-fg px-3 py-1.5 whitespace-nowrap"
                    >
                      {display}
                      {deltaNode}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
