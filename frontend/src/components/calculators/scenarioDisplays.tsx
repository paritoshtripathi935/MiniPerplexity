/**
 * Per-calculator display config for the workspace-level ScenariosPanel.
 *
 * Each calc has its own "headline metric" (one big tabular number) and its
 * own set of metadata chips (the inputs that produced the metric). This map
 * is the single source of truth — both ScenariosPanel and the (existing)
 * Compare table consume from here. Keeps the per-calc tsx components
 * focused on the math, not the presentation of their scenarios.
 */
import type { Scenario } from './useScenarios';
import type { CompareField } from './ScenarioCompare';
import type { CalcId } from './index';
import { fmtMoney, fmtMonths, fmtPct } from './formatters';

export interface ScenarioDisplay {
  /** One-line headline metric for the scenario, formatted. Empty string if
   * the scenario carries no usable output yet (e.g. reverse-mode with
   * incomplete inputs). */
  headline: (s: Scenario) => string;
  /** The numeric value behind `headline`, or null if not comparable. Used
   * to compute deltas between adjacent rows. */
  headlineValue: (s: Scenario) => number | null;
  /** `true` when a lower number is better (e.g. CAC payback months).
   * Drives the delta-direction colour. */
  lowerIsBetter: boolean;
  /** Short metadata chips summarising the inputs. Six max; keep each ≤16ch. */
  chips: (s: Scenario) => string[];
  /** Field list for the existing ScenarioCompare table. Lifted out of each
   * calc so ScenariosPanel can drive Compare without coupling. */
  compareFields: CompareField[];
}

function fmtDeltaMonths(d: number): string {
  if (Math.abs(d) < 0.05) return '— 0.0 mo';
  return `${d < 0 ? '↓' : '↑'} ${Math.abs(d).toFixed(1)} mo`;
}
function fmtDeltaPct(d: number): string {
  if (Math.abs(d) < 0.05) return '— 0.0pp';
  return `${d < 0 ? '↓' : '↑'} ${Math.abs(d).toFixed(1)}pp`;
}
function fmtDeltaCount(d: number): string {
  if (d === 0) return '— 0';
  return `${d < 0 ? '↓' : '↑'} ${Math.abs(d).toLocaleString()}`;
}
function fmtDeltaMoney(d: number): string {
  if (Math.abs(d) < 0.5) return '— $0';
  return `${d < 0 ? '↓' : '↑'} ${fmtMoney(Math.abs(d))}`;
}

export const formatDelta: Record<CalcId, (d: number) => string> = {
  'cac-payback': fmtDeltaMonths,
  'roas-margin': fmtDeltaPct,
  'sample-size': fmtDeltaCount,
  'blended-efficiency': fmtDeltaMoney,
};

export const SCENARIO_DISPLAYS: Record<CalcId, ScenarioDisplay> = {
  'cac-payback': {
    lowerIsBetter: true,
    headline: s => {
      if (s.mode === 'forward') return fmtMonths(s.outputs.months as number | null);
      return fmtMoney(s.outputs.requiredCac as number | null);
    },
    headlineValue: s => {
      const v =
        s.mode === 'forward'
          ? (s.outputs.months as number | null)
          : (s.outputs.requiredCac as number | null);
      return typeof v === 'number' && isFinite(v) ? v : null;
    },
    chips: s => [
      `CAC ${fmtMoney(Number(s.inputs.cac))}`,
      `ARPU ${fmtMoney(Number(s.inputs.arpu))}`,
      `Margin ${s.inputs.margin}%`,
    ],
    compareFields: [
      { key: 'mode', label: 'Mode', get: s => s.mode, format: v => (v === 'forward' ? 'Forward' : 'Reverse') },
      { key: 'cac', label: 'CAC', get: s => s.inputs.cac, format: v => fmtMoney(Number(v)), lowerIsBetter: true },
      { key: 'arpu', label: 'ARPU/mo', get: s => s.inputs.arpu, format: v => fmtMoney(Number(v)) },
      { key: 'margin', label: 'Margin %', get: s => s.inputs.margin, format: v => `${v}%`, lowerIsBetter: false },
      { key: 'months', label: 'Payback (months)', get: s => s.outputs.months, format: v => fmtMonths(v as number | null), lowerIsBetter: true },
      { key: 'requiredCac', label: 'Required CAC', get: s => s.outputs.requiredCac, format: v => fmtMoney(v as number | null), lowerIsBetter: true },
    ],
  },
  'roas-margin': {
    lowerIsBetter: false,
    headline: s => {
      if (s.mode === 'forward') return fmtPct(s.outputs.marginPct as number | null);
      const r = s.outputs.requiredRoas as number | null;
      return r == null ? '—' : `${r.toFixed(2)}×`;
    },
    headlineValue: s => {
      const v =
        s.mode === 'forward'
          ? (s.outputs.marginPct as number | null)
          : (s.outputs.requiredRoas as number | null);
      return typeof v === 'number' && isFinite(v) ? v : null;
    },
    chips: s => [
      `ROAS ${s.inputs.roas}×`,
      `Target ${s.inputs.targetMargin}%`,
      `COGS ${s.inputs.cogs}%`,
    ],
    compareFields: [
      { key: 'mode', label: 'Mode', get: s => s.mode, format: v => (v === 'forward' ? 'Forward' : 'Reverse') },
      { key: 'roas', label: 'ROAS (×)', get: s => s.inputs.roas, format: v => `${v}×` },
      { key: 'targetMargin', label: 'Target margin %', get: s => s.inputs.targetMargin, format: v => `${v}%` },
      { key: 'cogs', label: 'COGS %', get: s => s.inputs.cogs, format: v => `${v}%`, lowerIsBetter: true },
      { key: 'fixed', label: 'Fixed costs %', get: s => s.inputs.fixed, format: v => `${v}%`, lowerIsBetter: true },
      { key: 'marginPct', label: 'Contribution margin', get: s => s.outputs.marginPct, format: v => fmtPct(v as number | null), lowerIsBetter: false },
      { key: 'contributionPerAd', label: 'Contribution / ad $', get: s => s.outputs.contributionPerAd, format: v => fmtMoney(v as number | null), lowerIsBetter: false },
      { key: 'requiredRoas', label: 'Required ROAS', get: s => s.outputs.requiredRoas, format: v => v == null ? '—' : `${(v as number).toFixed(2)}×`, lowerIsBetter: true },
    ],
  },
  'sample-size': {
    lowerIsBetter: true,
    headline: s => {
      if (s.mode === 'forward') {
        const n = s.outputs.nPerArm as number | null;
        return n == null ? '—' : `${n.toLocaleString()}/arm`;
      }
      const v = s.outputs.minDetectableLift as number | null;
      return v == null ? '—' : `${v.toFixed(1)}% lift`;
    },
    headlineValue: s => {
      const v =
        s.mode === 'forward'
          ? (s.outputs.nPerArm as number | null)
          : (s.outputs.minDetectableLift as number | null);
      return typeof v === 'number' && isFinite(v) ? v : null;
    },
    chips: s => [
      `Baseline ${s.inputs.baseline}%`,
      `MDE ${s.inputs.mde}%`,
      `α ${s.inputs.alpha}`,
      `Power ${s.inputs.power}`,
    ],
    compareFields: [
      { key: 'mode', label: 'Mode', get: s => s.mode, format: v => (v === 'forward' ? 'Forward' : 'Reverse') },
      { key: 'baseline', label: 'Baseline %', get: s => s.inputs.baseline, format: v => `${v}%` },
      { key: 'mde', label: 'MDE %', get: s => s.inputs.mde, format: v => `${v}%`, lowerIsBetter: true },
      { key: 'targetN', label: 'Target N / arm', get: s => s.inputs.targetN, format: v => Number(v).toLocaleString() },
      { key: 'alpha', label: 'α', get: s => s.inputs.alpha, format: v => String(v) },
      { key: 'power', label: 'Power', get: s => s.inputs.power, format: v => String(v) },
      { key: 'nPerArm', label: 'N / arm', get: s => s.outputs.nPerArm, format: v => v == null ? '—' : (v as number).toLocaleString(), lowerIsBetter: true },
      { key: 'minDetectableLift', label: 'Min detectable lift', get: s => s.outputs.minDetectableLift, format: v => v == null ? '—' : `${(v as number).toFixed(1)}%`, lowerIsBetter: true },
    ],
  },
  'blended-efficiency': {
    lowerIsBetter: true,
    headline: s => {
      if (s.mode === 'forward') return fmtMoney(s.outputs.blendedCAC as number | null);
      return fmtMoney(s.outputs.requiredTotalSpend as number | null);
    },
    headlineValue: s => {
      const v =
        s.mode === 'forward'
          ? (s.outputs.blendedCAC as number | null)
          : (s.outputs.requiredTotalSpend as number | null);
      return typeof v === 'number' && isFinite(v) ? v : null;
    },
    chips: s => {
      const rows = (s.inputs.rows as unknown[] | undefined) ?? [];
      const target = s.inputs.targetCac;
      return [
        `${rows.length} channel${rows.length === 1 ? '' : 's'}`,
        ...(target ? [`Target CAC ${fmtMoney(Number(target))}`] : []),
      ];
    },
    compareFields: [
      { key: 'mode', label: 'Mode', get: s => s.mode, format: v => (v === 'forward' ? 'Forward' : 'Reverse') },
      {
        key: 'channels',
        label: 'Channels',
        get: s => (s.inputs.rows as unknown[] | undefined)?.length ?? 0,
        format: v => `${v}`,
      },
      { key: 'targetCac', label: 'Target CAC', get: s => s.inputs.targetCac, format: v => fmtMoney(Number(v)), lowerIsBetter: true },
      { key: 'totalSpend', label: 'Total spend', get: s => s.outputs.totalSpend, format: v => fmtMoney(v as number | null) },
      { key: 'totalConversions', label: 'Total conversions', get: s => s.outputs.totalConversions, format: v => v == null ? '—' : (v as number).toLocaleString() },
      { key: 'blendedCAC', label: 'Blended CAC', get: s => s.outputs.blendedCAC, format: v => fmtMoney(v as number | null), lowerIsBetter: true },
      { key: 'requiredTotalSpend', label: 'Required spend', get: s => s.outputs.requiredTotalSpend, format: v => fmtMoney(v as number | null), lowerIsBetter: true },
    ],
  },
};
