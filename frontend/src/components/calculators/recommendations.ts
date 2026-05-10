/**
 * Per-calc recommendation generators (PAI-9 §4).
 *
 * For each calc, given the current inputs and a target, surface 1–3
 * concrete actions ranked by required magnitude of change. The smaller
 * the change, the higher the rank (easier wins first).
 *
 * Each generator returns an empty list when the metric is already healthy.
 */

import {
  CAC_PAYBACK_MONTHS,
  CONTRIBUTION_MARGIN,
  SAMPLE_SIZE_PER_ARM,
  BLENDED_CAC,
} from './benchmarks';

export interface Recommendation {
  /** Stable per-calc key, used as React list key. */
  id: string;
  /** Human copy — verb-first imperative. */
  description: string;
  /** Magnitude of change required (used for ranking; smaller = easier). */
  effort: number;
}

function rank(recs: Recommendation[], limit = 3): Recommendation[] {
  return [...recs].sort((a, b) => a.effort - b.effort).slice(0, limit);
}

// ---------- CAC payback -----------------------------------------------------

export function cacPaybackRecommendations(
  currentMonths: number,
  cac: number,
  arpu: number,
  marginPct: number,
): Recommendation[] {
  if (currentMonths <= CAC_PAYBACK_MONTHS.good) return [];
  const target = CAC_PAYBACK_MONTHS.good;
  const recs: Recommendation[] = [];

  // Required CAC to hit target.
  const reqCac = target * arpu * (marginPct / 100);
  if (reqCac > 0 && reqCac < cac) {
    const pctDrop = ((cac - reqCac) / cac) * 100;
    recs.push({
      id: 'cut-cac',
      description: `Reduce CAC by ${pctDrop.toFixed(0)}% (to ~$${reqCac.toFixed(0)})`,
      effort: pctDrop,
    });
  }

  // Required ARPU.
  const reqArpu = cac / (target * (marginPct / 100));
  if (isFinite(reqArpu) && reqArpu > arpu) {
    const pctLift = ((reqArpu - arpu) / arpu) * 100;
    recs.push({
      id: 'lift-arpu',
      description: `Lift ARPU by $${(reqArpu - arpu).toFixed(0)} (to ~$${reqArpu.toFixed(0)}/mo)`,
      effort: pctLift,
    });
  }

  // Required margin.
  const reqMarginPct = (cac / (target * arpu)) * 100;
  if (reqMarginPct > marginPct && reqMarginPct < 100) {
    const pctLift = ((reqMarginPct - marginPct) / marginPct) * 100;
    recs.push({
      id: 'lift-margin',
      description: `Improve gross margin to ${reqMarginPct.toFixed(0)}% (+${(reqMarginPct - marginPct).toFixed(0)} pts)`,
      effort: pctLift,
    });
  }

  return rank(recs);
}

// ---------- Contribution margin --------------------------------------------

export function contributionMarginRecommendations(
  currentMargin: number,
  roas: number,
  cogsPct: number,
  fixedPct: number,
): Recommendation[] {
  if (currentMargin >= CONTRIBUTION_MARGIN.good) return [];
  const target = CONTRIBUTION_MARGIN.good;
  const recs: Recommendation[] = [];

  // Required ROAS: 1/r = 1 - cogs - fixed - target  →  r = 1 / denom.
  const denomR = 1 - cogsPct / 100 - fixedPct / 100 - target;
  if (denomR > 0) {
    const reqR = 1 / denomR;
    if (reqR > roas && reqR < 20) {
      const pctLift = ((reqR - roas) / roas) * 100;
      recs.push({
        id: 'lift-roas',
        description: `Push ROAS to ${reqR.toFixed(2)}× (+${(reqR - roas).toFixed(2)}×)`,
        effort: pctLift,
      });
    }
  }

  // Required COGS %.
  const reqCogsFrac = 1 - fixedPct / 100 - target - 1 / roas;
  if (reqCogsFrac > 0 && reqCogsFrac < cogsPct / 100) {
    const reqCogsPct = reqCogsFrac * 100;
    const pctDrop = ((cogsPct - reqCogsPct) / cogsPct) * 100;
    recs.push({
      id: 'cut-cogs',
      description: `Cut COGS to ${reqCogsPct.toFixed(0)}% (−${(cogsPct - reqCogsPct).toFixed(0)} pts)`,
      effort: pctDrop,
    });
  }

  // Required fixed costs %.
  const reqFixedFrac = 1 - cogsPct / 100 - target - 1 / roas;
  if (reqFixedFrac > 0 && reqFixedFrac < fixedPct / 100) {
    const reqFixedPct = reqFixedFrac * 100;
    const pctDrop = ((fixedPct - reqFixedPct) / fixedPct) * 100;
    recs.push({
      id: 'cut-fixed',
      description: `Trim fixed costs to ${reqFixedPct.toFixed(0)}% (−${(fixedPct - reqFixedPct).toFixed(0)} pts)`,
      effort: pctDrop,
    });
  }

  return rank(recs);
}

// ---------- Sample size -----------------------------------------------------

export function sampleSizeRecommendations(
  currentN: number,
  alpha: number,
  power: number,
): Recommendation[] {
  if (currentN <= SAMPLE_SIZE_PER_ARM.good) return [];
  const recs: Recommendation[] = [];

  recs.push({
    id: 'larger-mde',
    description: 'Accept a larger MDE — switch to reverse mode and enter a target N to find the trade-off',
    effort: 10,
  });

  if (power > 0.7) {
    recs.push({
      id: 'lower-power',
      description: `Lower power from ${power.toFixed(2)} to 0.70 to roughly halve required samples`,
      effort: 20,
    });
  }
  if (alpha < 0.1) {
    recs.push({
      id: 'relax-alpha',
      description: `Relax α from ${alpha} to 0.10 (looser type-I error)`,
      effort: 25,
    });
  }
  recs.push({
    id: 'higher-traffic',
    description: 'Run on a higher-traffic surface or extend the holdout window',
    effort: 30,
  });

  return rank(recs);
}

// ---------- Blended CAC -----------------------------------------------------

export interface BlendedRecChannel {
  name: string;
  cac: number | null;
}

export function blendedCacRecommendations(
  currentBlended: number,
  channels: BlendedRecChannel[],
): Recommendation[] {
  if (currentBlended <= BLENDED_CAC.good) return [];
  const recs: Recommendation[] = [];

  const valid = channels.filter(c => c.cac != null && isFinite(c.cac)) as { name: string; cac: number }[];
  if (valid.length >= 2) {
    const worst = [...valid].sort((a, b) => b.cac - a.cac)[0];
    const best = [...valid].sort((a, b) => a.cac - b.cac)[0];
    if (worst.cac > best.cac * 1.5) {
      recs.push({
        id: 'reallocate',
        description: `Move spend from ${worst.name} ($${worst.cac.toFixed(0)} CAC) into ${best.name} ($${best.cac.toFixed(0)} CAC)`,
        effort: 0,
      });
    }
    if (worst.cac > BLENDED_CAC.warn) {
      recs.push({
        id: 'pause-worst',
        description: `Pause or rework ${worst.name} — it sits well above the warn band`,
        effort: 5,
      });
    }
  }

  recs.push({
    id: 'creative',
    description: 'A/B test new creative on the highest-CAC channel before reallocating',
    effort: 15,
  });

  return rank(recs);
}
