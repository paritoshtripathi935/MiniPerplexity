import React, { useMemo, useState } from 'react';
import { CalcCard, Field, Result } from './CalcCard';
import { Insight } from './Insight';
import { invNormal } from './stats';
import { sampleSizeInsight } from './benchmarks';

export function SampleSizeCalc() {
  const [baseline, setBaseline] = useState('1.2');
  const [mde, setMde] = useState('15');
  const [alpha, setAlpha] = useState('0.05');
  const [power, setPower] = useState('0.8');

  const result = useMemo(() => {
    const p1 = Number(baseline) / 100;
    const lift = Number(mde) / 100;
    const a = Number(alpha);
    const pw = Number(power);
    if (!p1 || !lift || !a || !pw) return null;
    const p2 = p1 * (1 + lift);
    if (p2 <= 0 || p2 >= 1 || p1 <= 0 || p1 >= 1) return null;
    const z_alpha = invNormal(1 - a / 2);
    const z_beta = invNormal(pw);
    const numerator = Math.pow(z_alpha + z_beta, 2) * (p1 * (1 - p1) + p2 * (1 - p2));
    const denominator = Math.pow(p2 - p1, 2);
    const nPerArm = Math.ceil(numerator / denominator);
    return { nPerArm, total: nPerArm * 2 };
  }, [baseline, mde, alpha, power]);

  const insight = result ? sampleSizeInsight(result.nPerArm) : null;

  return (
    <CalcCard
      title="A/B sample size"
      description="Two-proportion z-test, two-sided. How many users per arm to detect a real change."
      results={
        <>
          <Result
            label="N per arm"
            value={result ? result.nPerArm.toLocaleString() : '—'}
            emphasised
          />
          <Result label="Total N" value={result ? result.total.toLocaleString() : '—'} />
        </>
      }
      insight={<Insight insight={insight} />}
    >
      <div className="grid grid-cols-2 gap-2">
        <Field label="Baseline %" value={baseline} onChange={setBaseline} />
        <Field label="MDE rel. lift %" value={mde} onChange={setMde} />
        <Field label="α (two-sided)" value={alpha} onChange={setAlpha} />
        <Field label="Power" value={power} onChange={setPower} />
      </div>
    </CalcCard>
  );
}
