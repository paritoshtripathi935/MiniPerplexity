import React, { useEffect, useMemo, useState } from 'react';
import { CalcCard, Field, Result } from './CalcCard';
import { Insight } from './Insight';
import { ModeToggle, type CalcMode } from './ModeToggle';
import { ScenarioBar } from './ScenarioBar';
import { ScenarioCompare, type CompareField } from './ScenarioCompare';
import { useScenarios, type Scenario } from './useScenarios';
import { Slider } from './Slider';
import { Recommendations } from './RecommendationsList';
import { fmtMoney, fmtPct } from './formatters';
import { contributionMarginInsight } from './benchmarks';
import { contributionMarginRecommendations } from './recommendations';
import { usePreset } from './PresetContext';
import { PRESETS } from './presets';

const CALC_ID = 'roas-margin';

export function ROASToMarginCalc() {
  const [mode, setMode] = useState<CalcMode>('forward');
  const [roas, setRoas] = useState('2.5');
  const [targetMargin, setTargetMargin] = useState('25');
  const [cogs, setCogs] = useState('30');
  const [fixed, setFixed] = useState('10');

  const { preset, applyTick } = usePreset();
  useEffect(() => {
    if (!preset) return;
    const cfg = PRESETS[preset].roasMargin;
    setRoas(cfg.roas);
    setCogs(cfg.cogs);
    setFixed(cfg.fixed);
    setMode('forward');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyTick]);

  const forward = useMemo(() => {
    const r = Number(roas);
    const cogsPct = Number(cogs) / 100;
    const fixedPct = Number(fixed) / 100;
    if (!r) return null;
    const contribution = r - r * cogsPct - r * fixedPct - 1;
    return { contributionPerAd: contribution, marginPct: contribution / r };
  }, [roas, cogs, fixed]);

  const reverse = useMemo(() => {
    const target = Number(targetMargin) / 100;
    const cogsPct = Number(cogs) / 100;
    const fixedPct = Number(fixed) / 100;
    const denom = 1 - cogsPct - fixedPct - target;
    if (!isFinite(target) || denom <= 0) return null;
    return 1 / denom;
  }, [targetMargin, cogs, fixed]);

  const insightValue =
    mode === 'forward'
      ? (forward && isFinite(forward.marginPct) ? forward.marginPct : null)
      : (() => {
          const t = Number(targetMargin) / 100;
          return isFinite(t) ? t : null;
        })();
  const insight = insightValue != null ? contributionMarginInsight(insightValue) : null;

  const recs = useMemo(() => {
    if (mode !== 'forward' || !forward || !isFinite(forward.marginPct)) return [];
    return contributionMarginRecommendations(
      forward.marginPct,
      Number(roas),
      Number(cogs),
      Number(fixed),
    );
  }, [mode, forward, roas, cogs, fixed]);

  const { scenarios, save, remove, duplicate } = useScenarios(CALC_ID);
  const [compareOpen, setCompareOpen] = useState(false);

  const inputs = { roas, targetMargin, cogs, fixed };
  const outputs = {
    contributionPerAd: forward?.contributionPerAd ?? null,
    marginPct: forward?.marginPct ?? null,
    requiredRoas: reverse,
  };

  const loadScenario = (s: Scenario) => {
    setMode(s.mode);
    setRoas((s.inputs.roas as string) ?? roas);
    setTargetMargin((s.inputs.targetMargin as string) ?? targetMargin);
    setCogs((s.inputs.cogs as string) ?? cogs);
    setFixed((s.inputs.fixed as string) ?? fixed);
  };

  const compareFields: CompareField[] = [
    { key: 'mode', label: 'Mode', get: s => s.mode, format: v => (v === 'forward' ? 'Forward' : 'Reverse') },
    { key: 'roas', label: 'ROAS (×)', get: s => s.inputs.roas, format: v => `${v}×` },
    { key: 'targetMargin', label: 'Target margin %', get: s => s.inputs.targetMargin, format: v => `${v}%` },
    { key: 'cogs', label: 'COGS %', get: s => s.inputs.cogs, format: v => `${v}%`, lowerIsBetter: true },
    { key: 'fixed', label: 'Fixed costs %', get: s => s.inputs.fixed, format: v => `${v}%`, lowerIsBetter: true },
    { key: 'marginPct', label: 'Contribution margin', get: s => s.outputs.marginPct, format: v => fmtPct(v as number | null), lowerIsBetter: false },
    { key: 'contributionPerAd', label: 'Contribution / ad $', get: s => s.outputs.contributionPerAd, format: v => fmtMoney(v as number | null), lowerIsBetter: false },
    { key: 'requiredRoas', label: 'Required ROAS', get: s => s.outputs.requiredRoas, format: v => v == null ? '—' : `${(v as number).toFixed(2)}×`, lowerIsBetter: true },
  ];

  return (
    <CalcCard
      title="ROAS → margin"
      description="Are we actually making money at this ROAS?"
      headerRight={<ModeToggle mode={mode} onChange={setMode} />}
      results={
        mode === 'forward' ? (
          <>
            <Result
              label="Contribution / ad $"
              value={forward ? fmtMoney(forward.contributionPerAd) : '—'}
            />
            <Result
              label="Contribution margin"
              value={forward ? fmtPct(forward.marginPct) : '—'}
              emphasised
            />
          </>
        ) : (
          <Result
            label="Required ROAS"
            value={reverse ? `${reverse.toFixed(2)}×` : '—'}
            emphasised
          />
        )
      }
      insight={
        <>
          <Insight insight={insight} />
          <Recommendations items={recs} />
        </>
      }
      footer={
        <>
          <ScenarioBar
            scenarios={scenarios}
            onSave={name => save({ name, mode, inputs, outputs })}
            onLoad={loadScenario}
            onRemove={remove}
            onDuplicate={duplicate}
            onCompareToggle={() => setCompareOpen(o => !o)}
            compareOpen={compareOpen}
          />
          {compareOpen && <ScenarioCompare scenarios={scenarios} fields={compareFields} />}
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        {mode === 'forward' ? (
          <Field label="ROAS (×)" value={roas} onChange={setRoas} />
        ) : (
          <Field label="Target margin %" value={targetMargin} onChange={setTargetMargin} />
        )}
        <Field label="COGS %" value={cogs} onChange={setCogs} />
        <Field label="Fixed costs %" value={fixed} onChange={setFixed} />
      </div>
      {mode === 'forward' && (
        <Slider
          label="Drag ROAS"
          min={0.5}
          max={10}
          step={0.1}
          value={Number(roas) || 0}
          onChange={v => setRoas(v.toFixed(1))}
          format={v => `${v.toFixed(1)}×`}
        />
      )}
    </CalcCard>
  );
}
