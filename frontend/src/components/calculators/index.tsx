import React from 'react';
import { CACPaybackCalc } from './CACPaybackCalc';
import { ROASToMarginCalc } from './ROASToMarginCalc';
import { SampleSizeCalc } from './SampleSizeCalc';
import { BlendedEfficiencyCalc } from './BlendedEfficiencyCalc';

export { PresetProvider } from './PresetContext';
export { PresetBar } from './PresetBar';

interface Props {
  /** Kept for back-compat with the page; not actually used (tokens swap via .dark). */
  darkMode?: boolean;
}

/** Four client-only calculators marketers reach for daily. */
export function Calculators({}: Props) {
  return (
    <>
      <CACPaybackCalc />
      <ROASToMarginCalc />
      <SampleSizeCalc />
      <BlendedEfficiencyCalc />
    </>
  );
}
