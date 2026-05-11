import { useEffect, useState } from 'react';
import {
  Calculators,
  PresetBar,
  PresetProvider,
  CALC_DEFS,
  type CalcId,
} from '../components/calculators';

interface Props {
  darkMode: boolean;
}

const ACTIVE_TAB_KEY = 'paidpilot-calc-active-tab';

function readActiveCalc(): CalcId {
  if (typeof window === 'undefined') return 'cac-payback';
  const saved = window.localStorage.getItem(ACTIVE_TAB_KEY);
  if (saved && CALC_DEFS.some(c => c.id === saved)) return saved as CalcId;
  return 'cac-payback';
}

/**
 * Calculators workspace — tabs at the top, one calculator at a time below.
 *
 * Replaces the earlier "all four calcs stacked in a column-css layout" with
 * a focused single-calc workspace (PAI-13 / PR F.1). One dominant working
 * surface per the Stitch operator design language; scenarios + insights live
 * inside each calculator's card (PR F.2 will lift scenarios to a left-side
 * primary surface).
 */
export function CalculatorsPage({}: Props) {
  const [active, setActive] = useState<CalcId>(() => readActiveCalc());

  // Persist tab selection so reloads land back on the user's last calc.
  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVE_TAB_KEY, active);
    } catch {
      /* quota / disabled — skip */
    }
  }, [active]);

  const activeDef = CALC_DEFS.find(c => c.id === active) ?? CALC_DEFS[0];

  return (
    <PresetProvider>
      {/* Top row: title + tertiary breadcrumb chip per Stitch. */}
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-h1 text-on-surface">{activeDef.label}</h1>
          <p className="mt-1 text-body-sm text-on-surface-variant max-w-2xl">
            All client-side — no telemetry, no roundtrips. Saved scenarios live
            in your browser.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 px-2.5 h-7 rounded-control border border-outline-variant bg-surface-container-low text-label-caps text-on-surface-variant">
          Calculators
          <span className="text-outline-variant" aria-hidden>/</span>
          <span className="text-on-surface">{activeDef.label}</span>
        </span>
      </header>

      {/* Calculator tabs. Pill row, no decorative chrome — selected tab gets
          a 2px primary left bar treatment via inset shadow plus a tint
          background. Matches the operational ledger aesthetic. */}
      <nav className="mb-6 flex items-center gap-1 overflow-x-auto border-b border-outline-variant pb-px">
        {CALC_DEFS.map(c => {
          const isActive = c.id === active;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setActive(c.id)}
              className={
                'inline-flex items-center h-8 px-3 text-body-sm font-medium transition-colors relative shrink-0 ' +
                (isActive
                  ? 'text-on-surface'
                  : 'text-on-surface-variant hover:text-on-surface')
              }
            >
              {c.label}
              {isActive && (
                <span
                  className="absolute left-0 right-0 -bottom-px h-[2px] bg-primary"
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </nav>

      <div className="mb-6">
        <PresetBar />
      </div>

      {/* Single calc, full width. */}
      <Calculators activeCalc={active} />
    </PresetProvider>
  );
}
