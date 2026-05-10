/**
 * Benchmark thresholds — single source of truth for "is this number good?"
 *
 * Each metric has GOOD / WARN cutoffs and a direction (lowerIsBetter or
 * higherIsBetter). The classifier returns a state plus a benchmark string
 * the Insight banner renders verbatim.
 *
 * Thresholds here are general-industry defaults. PAI-9 PR4 layers
 * preset/benchmark profiles (SaaS / D2C / Marketplace × Seed / Growth /
 * Enterprise) on top.
 */

export type InsightState = 'good' | 'warn' | 'bad';

export interface Insight {
  state: InsightState;
  headline: string;
  /** Benchmark context — "Healthy: < 4 months" etc. */
  benchmark: string;
}

interface Band {
  good: number;
  warn: number;
  /** Lower number is better (e.g. CAC payback months, blended CAC). */
  lowerIsBetter: boolean;
}

/** CAC payback period in months. */
export const CAC_PAYBACK_MONTHS: Band = { good: 4, warn: 8, lowerIsBetter: true };

/** Contribution margin as a fraction of revenue (0–1). */
export const CONTRIBUTION_MARGIN: Band = { good: 0.3, warn: 0.1, lowerIsBetter: false };

/** A/B sample size required per arm. */
export const SAMPLE_SIZE_PER_ARM: Band = { good: 5_000, warn: 50_000, lowerIsBetter: true };

/** Blended CAC in USD. Industry-agnostic; refine per preset in PR4. */
export const BLENDED_CAC: Band = { good: 50, warn: 150, lowerIsBetter: true };

function classify(value: number, band: Band): InsightState {
  if (band.lowerIsBetter) {
    if (value <= band.good) return 'good';
    if (value <= band.warn) return 'warn';
    return 'bad';
  } else {
    if (value >= band.good) return 'good';
    if (value >= band.warn) return 'warn';
    return 'bad';
  }
}

export function cacPaybackInsight(months: number): Insight {
  const state = classify(months, CAC_PAYBACK_MONTHS);
  const benchmark = `Healthy: < ${CAC_PAYBACK_MONTHS.good} months`;
  if (state === 'good') {
    return { state, headline: 'Fast payback — capital cycles back quickly.', benchmark };
  }
  if (state === 'warn') {
    return {
      state,
      headline: 'Borderline. Cash is tied up longer than ideal — watch your runway.',
      benchmark,
    };
  }
  return {
    state,
    headline: 'Slow payback. Cash recovery cycle is long and may constrain scale.',
    benchmark,
  };
}

export function contributionMarginInsight(marginPct: number): Insight {
  const state = classify(marginPct, CONTRIBUTION_MARGIN);
  const benchmark = `Healthy: ≥ ${(CONTRIBUTION_MARGIN.good * 100).toFixed(0)}%`;
  if (marginPct < 0) {
    return {
      state: 'bad',
      headline: 'Losing money on every ad dollar at this ROAS.',
      benchmark: 'Break-even requires positive contribution margin.',
    };
  }
  if (state === 'good') {
    return { state, headline: 'Healthy contribution. Worth scaling spend.', benchmark };
  }
  if (state === 'warn') {
    return {
      state,
      headline: 'Thin margin. A small COGS or fixed-cost shock turns this negative.',
      benchmark,
    };
  }
  return {
    state,
    headline: 'Unprofitable at this ROAS once COGS and fixed costs land.',
    benchmark,
  };
}

export function sampleSizeInsight(nPerArm: number): Insight {
  const state = classify(nPerArm, SAMPLE_SIZE_PER_ARM);
  const benchmark = `Achievable: ≤ ${SAMPLE_SIZE_PER_ARM.good.toLocaleString()} per arm`;
  if (state === 'good') {
    return {
      state,
      headline: 'Tractable test. Should ship in days at typical traffic.',
      benchmark,
    };
  }
  if (state === 'warn') {
    return {
      state,
      headline: 'Multi-week test. Consider a larger MDE or higher-traffic surface.',
      benchmark,
    };
  }
  return {
    state,
    headline: 'Likely under-powered. Either accept a bigger MDE or skip the test.',
    benchmark,
  };
}

export function blendedCacInsight(cac: number): Insight {
  const state = classify(cac, BLENDED_CAC);
  const benchmark = `General-industry healthy: < $${BLENDED_CAC.good}`;
  if (state === 'good') {
    return { state, headline: 'Efficient acquisition across the channel mix.', benchmark };
  }
  if (state === 'warn') {
    return {
      state,
      headline: 'Mid-band CAC. Sustainable depends on your ARPU and margin.',
      benchmark,
    };
  }
  return {
    state,
    headline: 'High blended CAC. Pair with the CAC-payback calc to check viability.',
    benchmark,
  };
}
