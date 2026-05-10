import React, { useMemo, useState } from 'react';
import { CalcCard, Field, Result } from './CalcCard';
import { Insight } from './Insight';
import { ModeToggle, type CalcMode } from './ModeToggle';
import { fmtMoney, fmtPct } from './formatters';
import { contributionMarginInsight } from './benchmarks';

export function ROASToMarginCalc() {
  const [mode, setMode] = useState<CalcMode>('forward');
  const [roas, setRoas] = useState('2.5');
  const [targetMargin, setTargetMargin] = useState('25');
  const [cogs, setCogs] = useState('30');
  const [fixed, setFixed] = useState('10');

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
      insight={<Insight insight={insight} />}
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
    </CalcCard>
  );
}
