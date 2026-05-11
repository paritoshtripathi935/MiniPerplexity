import React, { useEffect, useMemo, useState } from 'react';
import { CalcCard, Field, Result } from './CalcCard';
import { Insight } from './Insight';
import { ModeToggle, type CalcMode } from './ModeToggle';
import { SaveScenarioButton } from './SaveScenarioButton';
import { useScenarios, type Scenario } from './useScenarios';
import { Slider } from './Slider';
import { Recommendations } from './RecommendationsList';
import { fmtMoney, fmtMonths } from './formatters';
import { cacPaybackInsight } from './benchmarks';
import { cacPaybackRecommendations } from './recommendations';
import { usePreset } from './PresetContext';
import { PRESETS } from './presets';

const CALC_ID = 'cac-payback';

interface CalcProps {
  /** PR F.2 workspace wiring — the page hooks the calc's loadScenario into
   * this ref so the left-side ScenariosPanel can drive it. */
  registerLoadHandler?: (fn: (s: Scenario) => void) => void;
}

export function CACPaybackCalc({ registerLoadHandler }: CalcProps = {}) {
  const [mode, setMode] = useState<CalcMode>('forward');
  const [cac, setCac] = useState('120');
  const [targetMonths, setTargetMonths] = useState('4');
  const [arpu, setArpu] = useState('25');
  const [margin, setMargin] = useState('70');

  const { preset, applyTick } = usePreset();
  useEffect(() => {
    if (!preset) return;
    const cfg = PRESETS[preset].cacPayback;
    setCac(cfg.cac);
    setArpu(cfg.arpu);
    setMargin(cfg.margin);
    setMode('forward');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyTick]);

  const forward = useMemo(() => {
    const c = Number(cac);
    const a = Number(arpu);
    const m = Number(margin) / 100;
    if (!c || !a || !m) return null;
    const contribution = a * m;
    return contribution > 0 ? c / contribution : null;
  }, [cac, arpu, margin]);

  const reverse = useMemo(() => {
    const tm = Number(targetMonths);
    const a = Number(arpu);
    const m = Number(margin) / 100;
    if (!tm || !a || !m) return null;
    return tm * a * m;
  }, [targetMonths, arpu, margin]);

  const insightValue =
    mode === 'forward'
      ? (forward != null && isFinite(forward) ? forward : null)
      : (Number(targetMonths) || null);
  const insight = insightValue != null ? cacPaybackInsight(insightValue) : null;

  const recs = useMemo(() => {
    if (mode !== 'forward' || forward == null || !isFinite(forward)) return [];
    return cacPaybackRecommendations(forward, Number(cac), Number(arpu), Number(margin));
  }, [mode, forward, cac, arpu, margin]);

  const { scenarios, save } = useScenarios(CALC_ID);

  const inputs = { cac, targetMonths, arpu, margin };
  const outputs = { months: forward, requiredCac: reverse };

  const loadScenario = (s: Scenario) => {
    setMode(s.mode);
    setCac((s.inputs.cac as string) ?? cac);
    setTargetMonths((s.inputs.targetMonths as string) ?? targetMonths);
    setArpu((s.inputs.arpu as string) ?? arpu);
    setMargin((s.inputs.margin as string) ?? margin);
  };
  // Re-register on every render so the captured fallback state stays fresh.
  // Cheap (a ref-set) and avoids the stale-closure trap with useEffect deps.
  registerLoadHandler?.(loadScenario);

  return (
    <CalcCard
      title="CAC payback"
      description="How many months until a new customer pays back acquisition cost."
      headerRight={<ModeToggle mode={mode} onChange={setMode} />}
      results={
        mode === 'forward' ? (
          <Result label="Payback period" value={fmtMonths(forward)} emphasised />
        ) : (
          <Result label="Required CAC" value={fmtMoney(reverse)} emphasised />
        )
      }
      insight={
        <>
          <Insight insight={insight} />
          <Recommendations items={recs} />
        </>
      }
      footer={
        <SaveScenarioButton
          scenarioCount={scenarios.length}
          onSave={name => save({ name, mode, inputs, outputs })}
        />
      }
    >
      <div className="grid grid-cols-3 gap-2">
        {mode === 'forward' ? (
          <Field label="CAC ($)" value={cac} onChange={setCac} />
        ) : (
          <Field label="Target months" value={targetMonths} onChange={setTargetMonths} />
        )}
        <Field label="ARPU/mo ($)" value={arpu} onChange={setArpu} />
        <Field label="Gross margin %" value={margin} onChange={setMargin} />
      </div>
      {mode === 'forward' && (
        <Slider
          label="Drag CAC"
          min={0}
          max={Math.max(500, Number(cac) * 1.5 || 500)}
          step={5}
          value={Number(cac) || 0}
          onChange={v => setCac(String(v))}
          format={v => fmtMoney(v)}
        />
      )}
    </CalcCard>
  );
}
