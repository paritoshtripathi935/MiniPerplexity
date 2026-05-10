import React, { useMemo, useState } from 'react';
import { CalcCard, Field, Result } from './CalcCard';
import { Insight } from './Insight';
import { fmtMoney, fmtPct } from './formatters';
import { contributionMarginInsight } from './benchmarks';

export function ROASToMarginCalc() {
  const [roas, setRoas] = useState('2.5');
  const [cogs, setCogs] = useState('30');
  const [fixed, setFixed] = useState('10');

  const result = useMemo(() => {
    const r = Number(roas);
    const cogsPct = Number(cogs) / 100;
    const fixedPct = Number(fixed) / 100;
    if (!r) return null;
    const contribution = r - r * cogsPct - r * fixedPct - 1;
    return { contributionPerAd: contribution, marginPct: contribution / r };
  }, [roas, cogs, fixed]);

  const insight =
    result && isFinite(result.marginPct)
      ? contributionMarginInsight(result.marginPct)
      : null;

  return (
    <CalcCard
      title="ROAS → margin"
      description="Are we actually making money at this ROAS?"
      results={
        <>
          <Result
            label="Contribution / ad $"
            value={result ? fmtMoney(result.contributionPerAd) : '—'}
          />
          <Result
            label="Contribution margin"
            value={result ? fmtPct(result.marginPct) : '—'}
            emphasised
          />
        </>
      }
      insight={<Insight insight={insight} />}
    >
      <div className="grid grid-cols-3 gap-2">
        <Field label="ROAS (×)" value={roas} onChange={setRoas} />
        <Field label="COGS %" value={cogs} onChange={setCogs} />
        <Field label="Fixed costs %" value={fixed} onChange={setFixed} />
      </div>
    </CalcCard>
  );
}
