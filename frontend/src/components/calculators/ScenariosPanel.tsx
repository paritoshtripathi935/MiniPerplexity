/**
 * Scenarios primary surface for the calculator workspace (PAI-13 / PR F.2).
 *
 * Stacked-row list of saved scenarios for the active calculator. Headline
 * metric in metric-lg tabular nums, chip-line of inputs, delta vs. the
 * preceding (older) scenario. One row visually dominant — the most-recent.
 * Empty state with operational copy. Inline Compare expand re-using the
 * existing ScenarioCompare panel.
 *
 * Read-only display + load/delete/duplicate/compare. The Save action lives
 * inside the active calc's header (it owns the current input state).
 */
import { useMemo, useState } from 'react';
import { ChevronDown, Copy, GitCompare, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { useScenarios, type Scenario } from './useScenarios';
import { ScenarioCompare } from './ScenarioCompare';
import { SCENARIO_DISPLAYS, formatDelta } from './scenarioDisplays';
import type { CalcId } from './index';

interface Props {
  calcId: CalcId;
  /** Called when a row is clicked. The calc loads the scenario into its
   * inputs. Owning the load handler at the page level keeps ScenariosPanel
   * decoupled from any single calc's state shape. */
  onLoad: (scenario: Scenario) => void;
}

export function ScenariosPanel({ calcId, onLoad }: Props) {
  const display = SCENARIO_DISPLAYS[calcId];
  const fmt = formatDelta[calcId];
  const { scenarios, remove, duplicate } = useScenarios(calcId);

  // Newest first so deltas read "current vs. previous" intuitively.
  const sorted = useMemo(
    () => [...scenarios].sort((a, b) => b.createdAt - a.createdAt),
    [scenarios],
  );

  const [compareOpen, setCompareOpen] = useState(false);

  return (
    <section>
      <header className="flex items-center justify-between mb-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80">
          saved scenarios
        </h2>
        {sorted.length >= 2 && (
          <button
            type="button"
            onClick={() => setCompareOpen(v => !v)}
            className={clsx(
              'inline-flex items-center gap-1.5 h-7 px-2.5 text-body-sm rounded-md border transition-colors',
              compareOpen
                ? 'border-brand/40 text-brand bg-brand/10'
                : 'border-border/60 text-fg-muted hover:text-fg hover:border-border-strong',
            )}
          >
            <GitCompare className="w-3 h-3" />
            compare
            <ChevronDown
              className={clsx(
                'w-3 h-3 transition-transform',
                compareOpen && 'rotate-180',
              )}
            />
          </button>
        )}
      </header>

      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 px-4 py-10 text-center text-body-sm text-fg-muted">
          no scenarios yet.{' '}
          <span className="text-fg">calculate once and save it</span> to
          track changes over time.
        </div>
      ) : (
        <div className="rounded-2xl border border-border/60 bg-surface-raised/40 backdrop-blur divide-y divide-border/40 overflow-hidden">
          {sorted.map((s, i) => {
            const headline = display.headline(s);
            const value = display.headlineValue(s);
            const prevValue =
              i + 1 < sorted.length ? display.headlineValue(sorted[i + 1]) : null;
            const delta =
              value != null && prevValue != null ? value - prevValue : null;
            const deltaStr = delta != null ? fmt(delta) : null;
            const better =
              delta != null
                ? display.lowerIsBetter
                  ? delta < 0
                  : delta > 0
                : false;
            const worse =
              delta != null
                ? display.lowerIsBetter
                  ? delta > 0
                  : delta < 0
                : false;

            return (
              <ScenarioRow
                key={s.id}
                scenario={s}
                headline={headline}
                chips={display.chips(s)}
                deltaStr={deltaStr}
                deltaBetter={better}
                deltaWorse={worse}
                dominant={i === 0}
                onLoad={() => onLoad(s)}
                onDuplicate={() => duplicate(s.id)}
                onRemove={() => remove(s.id)}
              />
            );
          })}
        </div>
      )}

      {compareOpen && sorted.length >= 2 && (
        <div className="mt-4 animate-fade-in">
          <ScenarioCompare scenarios={sorted} fields={display.compareFields} />
        </div>
      )}
    </section>
  );
}

interface RowProps {
  scenario: Scenario;
  headline: string;
  chips: string[];
  deltaStr: string | null;
  deltaBetter: boolean;
  deltaWorse: boolean;
  dominant: boolean;
  onLoad: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

function ScenarioRow({
  scenario,
  headline,
  chips,
  deltaStr,
  deltaBetter,
  deltaWorse,
  dominant,
  onLoad,
  onDuplicate,
  onRemove,
}: RowProps) {
  return (
    <div
      className={clsx(
        'group flex items-center gap-4 px-4 py-3 transition-colors',
        dominant ? 'bg-brand/5' : 'hover:bg-surface-raised/60',
      )}
    >
      <button
        type="button"
        onClick={onLoad}
        className="flex-1 min-w-0 text-left focus-visible:outline-none focus-visible:shadow-focus rounded-md"
        title="Load this scenario"
      >
        <div className="text-body-base text-fg font-medium truncate">
          {scenario.name}
        </div>
        {chips.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {chips.map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center px-1.5 h-5 rounded-md border border-border/60 bg-surface-raised/60 font-mono text-[10px] uppercase tracking-wider text-fg-subtle"
              >
                {c}
              </span>
            ))}
          </div>
        )}
      </button>

      <div className="text-right shrink-0">
        <div className="font-display text-metric-lg text-fg tabular-nums">
          {headline}
        </div>
        {deltaStr && (
          <div
            className={clsx(
              'text-body-sm tabular-nums mt-1',
              deltaBetter && 'text-success',
              deltaWorse && 'text-warning',
              !deltaBetter && !deltaWorse && 'text-fg-muted',
            )}
          >
            {deltaStr} vs. last
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          type="button"
          onClick={onDuplicate}
          className="grid place-items-center w-7 h-7 rounded-md text-fg-muted hover:text-fg hover:bg-surface-raised transition-colors"
          aria-label={`Duplicate ${scenario.name}`}
          title="Duplicate"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="grid place-items-center w-7 h-7 rounded-md text-fg-muted hover:text-danger hover:bg-danger-subtle/40 transition-colors"
          aria-label={`Delete ${scenario.name}`}
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
