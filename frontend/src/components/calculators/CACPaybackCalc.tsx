import React, { useMemo, useState } from 'react';
import { CalcCard, Field, Result } from './CalcCard';
import { Insight } from './Insight';
import { ModeToggle, type CalcMode } from './ModeToggle';
import { ScenarioBar } from './ScenarioBar';
import { ScenarioCompare, type CompareField } from './ScenarioCompare';
import { useScenarios, type Scenario } from './useScenarios';
import { fmtMoney, fmtMonths } from './formatters';
import { cacPaybackInsight } from './benchmarks';

const CALC_ID = 'cac-payback';

export function CACPaybackCalc() {
  const [mode, setMode] = useState<CalcMode>('forward');
  const [cac, setCac] = useState('120');
  const [targetMonths, setTargetMonths] = useState('4');
  const [arpu, setArpu] = useState('25');
  const [margin, setMargin] = useState('70');

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

  const { scenarios, save, remove, duplicate } = useScenarios(CALC_ID);
  const [compareOpen, setCompareOpen] = useState(false);

  const inputs = { cac, targetMonths, arpu, margin };
  const outputs = { months: forward, requiredCac: reverse };

  const loadScenario = (s: Scenario) => {
    setMode(s.mode);
    setCac(s.inputs.cac ?? cac);
    setTargetMonths(s.inputs.targetMonths ?? targetMonths);
    setArpu(s.inputs.arpu ?? arpu);
    setMargin(s.inputs.margin ?? margin);
  };

  const compareFields: CompareField[] = [
    { key: 'mode', label: 'Mode', get: s => s.mode, format: v => (v === 'forward' ? 'Forward' : 'Reverse') },
    { key: 'cac', label: 'CAC', get: s => s.inputs.cac, format: v => fmtMoney(Number(v)), lowerIsBetter: true },
    { key: 'arpu', label: 'ARPU/mo', get: s => s.inputs.arpu, format: v => fmtMoney(Number(v)) },
    { key: 'margin', label: 'Margin %', get: s => s.inputs.margin, format: v => `${v}%`, lowerIsBetter: false },
    { key: 'months', label: 'Payback (months)', get: s => s.outputs.months, format: v => fmtMonths(v as number | null), lowerIsBetter: true },
    { key: 'requiredCac', label: 'Required CAC', get: s => s.outputs.requiredCac, format: v => fmtMoney(v as number | null), lowerIsBetter: true },
  ];

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
      insight={<Insight insight={insight} />}
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
          <Field label="CAC ($)" value={cac} onChange={setCac} />
        ) : (
          <Field label="Target months" value={targetMonths} onChange={setTargetMonths} />
        )}
        <Field label="ARPU/mo ($)" value={arpu} onChange={setArpu} />
        <Field label="Gross margin %" value={margin} onChange={setMargin} />
      </div>
    </CalcCard>
  );
}
