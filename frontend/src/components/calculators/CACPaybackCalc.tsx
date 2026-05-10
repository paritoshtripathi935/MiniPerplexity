import React, { useMemo, useState } from 'react';
import { CalcCard, Field, Result } from './CalcCard';
import { Insight } from './Insight';
import { ModeToggle, type CalcMode } from './ModeToggle';
import { fmtMoney, fmtMonths } from './formatters';
import { cacPaybackInsight } from './benchmarks';

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
