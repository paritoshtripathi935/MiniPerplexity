import { useEffect, useRef, useState } from 'react';
import {
  Calculators,
  PresetBar,
  PresetProvider,
  ScenariosPanel,
  CALC_DEFS,
  type CalcId,
} from '../components/calculators';
import type { Scenario } from '../components/calculators/useScenarios';

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
 * Calculators workspace — tabs at the top, scenarios primary on the left,
 * active calc on the right.
 *
 * PR F.2 lifts the scenarios list out of each calc's footer into a single
 * page-level left-side surface (per the Stitch cac_payback_calculator_dark
 * mock). The active calc's loadScenario is hooked into a ref the page
 * holds; clicking a scenario row in ScenariosPanel calls through it to
 * rehydrate the calc inputs. Save lives inside the calc (it owns the
 * current input state); ScenariosPanel handles load / delete / duplicate /
 * compare.
 */
export function CalculatorsPage({}: Props) {
  const [active, setActive] = useState<CalcId>(() => readActiveCalc());
  const loadHandlerRef = useRef<((s: Scenario) => void) | null>(null);

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

      {/* Two-column workspace: scenarios primary (left ~60%), calc (right
          ~40%) on lg+. Stacks under lg with scenarios above the calc. */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 min-w-0">
          {/* Remount ScenariosPanel on tab switch so its internal compare
              state resets when the calc changes. */}
          <ScenariosPanel
            key={active}
            calcId={active}
            onLoad={s => loadHandlerRef.current?.(s)}
          />
        </div>
        <div className="lg:col-span-2 min-w-0">
          <Calculators
            key={active}
            activeCalc={active}
            registerLoadHandler={fn => {
              loadHandlerRef.current = fn;
            }}
          />
        </div>
      </div>
    </PresetProvider>
  );
}
