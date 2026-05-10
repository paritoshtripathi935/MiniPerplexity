import React, { useMemo, useState } from 'react';
import { CalcCard, Field, Result } from './CalcCard';
import { Insight } from './Insight';
import { ModeToggle, type CalcMode } from './ModeToggle';
import { ScenarioBar } from './ScenarioBar';
import { ScenarioCompare, type CompareField } from './ScenarioCompare';
import { useScenarios, type Scenario } from './useScenarios';
import { invNormal } from './stats';
import { sampleSizeInsight } from './benchmarks';

const CALC_ID = 'sample-size';

function nPerArm(p1: number, lift: number, alpha: number, power: number): number | null {
  const p2 = p1 * (1 + lift);
  if (p1 <= 0 || p1 >= 1 || p2 <= 0 || p2 >= 1) return null;
  const z_alpha = invNormal(1 - alpha / 2);
  const z_beta = invNormal(power);
  const num = Math.pow(z_alpha + z_beta, 2) * (p1 * (1 - p1) + p2 * (1 - p2));
  const den = Math.pow(p2 - p1, 2);
  return Math.ceil(num / den);
}

/** Bisect for the relative lift that yields exactly `target` samples per arm. */
function solveLift(p1: number, alpha: number, power: number, target: number): number | null {
  let lo = 0.001;
  let hi = 5.0;
  const nLo = nPerArm(p1, lo, alpha, power);
  const nHi = nPerArm(p1, hi, alpha, power);
  if (nLo == null || nHi == null) return null;
  if (target >= nLo) return lo;
  if (target <= nHi) return hi;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const n = nPerArm(p1, mid, alpha, power);
    if (n == null) return null;
    if (n > target) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-6) break;
  }
  return (lo + hi) / 2;
}

export function SampleSizeCalc() {
  const [mode, setMode] = useState<CalcMode>('forward');
  const [baseline, setBaseline] = useState('1.2');
  const [mde, setMde] = useState('15');
  const [targetN, setTargetN] = useState('5000');
  const [alpha, setAlpha] = useState('0.05');
  const [power, setPower] = useState('0.8');

  const forward = useMemo(() => {
    const p1 = Number(baseline) / 100;
    const lift = Number(mde) / 100;
    const a = Number(alpha);
    const pw = Number(power);
    if (!p1 || !lift || !a || !pw) return null;
    const n = nPerArm(p1, lift, a, pw);
    return n == null ? null : { nPerArm: n, total: n * 2 };
  }, [baseline, mde, alpha, power]);

  const reverse = useMemo(() => {
    const p1 = Number(baseline) / 100;
    const tgt = Number(targetN);
    const a = Number(alpha);
    const pw = Number(power);
    if (!p1 || !tgt || !a || !pw) return null;
    const lift = solveLift(p1, a, pw, tgt);
    if (lift == null) return null;
    return { liftPct: lift * 100, absoluteP2: p1 * (1 + lift) * 100 };
  }, [baseline, targetN, alpha, power]);

  const insightValue =
    mode === 'forward'
      ? (forward ? forward.nPerArm : null)
      : (Number(targetN) || null);
  const insight = insightValue != null ? sampleSizeInsight(insightValue) : null;

  const { scenarios, save, remove, duplicate } = useScenarios(CALC_ID);
  const [compareOpen, setCompareOpen] = useState(false);

  const inputs = { baseline, mde, targetN, alpha, power };
  const outputs = {
    nPerArm: forward?.nPerArm ?? null,
    minDetectableLift: reverse?.liftPct ?? null,
  };

  const loadScenario = (s: Scenario) => {
    setMode(s.mode);
    setBaseline(s.inputs.baseline ?? baseline);
    setMde(s.inputs.mde ?? mde);
    setTargetN(s.inputs.targetN ?? targetN);
    setAlpha(s.inputs.alpha ?? alpha);
    setPower(s.inputs.power ?? power);
  };

  const compareFields: CompareField[] = [
    { key: 'mode', label: 'Mode', get: s => s.mode, format: v => (v === 'forward' ? 'Forward' : 'Reverse') },
    { key: 'baseline', label: 'Baseline %', get: s => s.inputs.baseline, format: v => `${v}%` },
    { key: 'mde', label: 'MDE %', get: s => s.inputs.mde, format: v => `${v}%`, lowerIsBetter: true },
    { key: 'targetN', label: 'Target N / arm', get: s => s.inputs.targetN, format: v => Number(v).toLocaleString() },
    { key: 'alpha', label: 'α', get: s => s.inputs.alpha, format: v => String(v) },
    { key: 'power', label: 'Power', get: s => s.inputs.power, format: v => String(v) },
    { key: 'nPerArm', label: 'N / arm', get: s => s.outputs.nPerArm, format: v => v == null ? '—' : (v as number).toLocaleString(), lowerIsBetter: true },
    { key: 'minDetectableLift', label: 'Min detectable lift', get: s => s.outputs.minDetectableLift, format: v => v == null ? '—' : `${(v as number).toFixed(1)}%`, lowerIsBetter: true },
  ];

  return (
    <CalcCard
      title="A/B sample size"
      description="Two-proportion z-test, two-sided. How many users per arm to detect a real change."
      headerRight={<ModeToggle mode={mode} onChange={setMode} />}
      results={
        mode === 'forward' ? (
          <>
            <Result
              label="N per arm"
              value={forward ? forward.nPerArm.toLocaleString() : '—'}
              emphasised
            />
            <Result label="Total N" value={forward ? forward.total.toLocaleString() : '—'} />
          </>
        ) : (
          <>
            <Result
              label="Min detectable lift"
              value={reverse ? `${reverse.liftPct.toFixed(1)}%` : '—'}
              emphasised
            />
            <Result
              label="Treatment rate"
              value={reverse ? `${reverse.absoluteP2.toFixed(2)}%` : '—'}
            />
          </>
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
      <div className="grid grid-cols-2 gap-2">
        <Field label="Baseline %" value={baseline} onChange={setBaseline} />
        {mode === 'forward' ? (
          <Field label="MDE rel. lift %" value={mde} onChange={setMde} />
        ) : (
          <Field label="Target N / arm" value={targetN} onChange={setTargetN} />
        )}
        <Field label="α (two-sided)" value={alpha} onChange={setAlpha} />
        <Field label="Power" value={power} onChange={setPower} />
      </div>
    </CalcCard>
  );
}
