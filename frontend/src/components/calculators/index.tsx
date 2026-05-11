import React from 'react';
import { CACPaybackCalc } from './CACPaybackCalc';
import { ROASToMarginCalc } from './ROASToMarginCalc';
import { SampleSizeCalc } from './SampleSizeCalc';
import { BlendedEfficiencyCalc } from './BlendedEfficiencyCalc';

export { PresetProvider } from './PresetContext';
export { PresetBar } from './PresetBar';

/** Stable id for each calculator. Matches the CALC_ID constant inside each
 * component so useScenarios stays consistent across the page. */
export type CalcId =
  | 'cac-payback'
  | 'roas-margin'
  | 'sample-size'
  | 'blended-efficiency';

export const CALC_DEFS: { id: CalcId; label: string }[] = [
  { id: 'cac-payback', label: 'CAC Payback' },
  { id: 'roas-margin', label: 'ROAS → Margin' },
  { id: 'sample-size', label: 'A/B Sample Size' },
  { id: 'blended-efficiency', label: 'Blended Efficiency' },
];

interface Props {
  activeCalc: CalcId;
  /** Kept for back-compat with the page; not actually used (tokens swap via .dark). */
  darkMode?: boolean;
}

/** Single-calc workspace: renders only the selected calculator. Page-level
 * tabs in CalculatorsPage drive the selection. */
export function Calculators({ activeCalc }: Props) {
  switch (activeCalc) {
    case 'cac-payback':
      return <CACPaybackCalc />;
    case 'roas-margin':
      return <ROASToMarginCalc />;
    case 'sample-size':
      return <SampleSizeCalc />;
    case 'blended-efficiency':
      return <BlendedEfficiencyCalc />;
  }
}
