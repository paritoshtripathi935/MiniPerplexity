import React, { useMemo, useState } from 'react';
import { CalcCard, Field, Result } from './CalcCard';
import { Insight } from './Insight';
import { fmtMonths } from './formatters';
import { cacPaybackInsight } from './benchmarks';

export function CACPaybackCalc() {
  const [cac, setCac] = useState('120');
  const [arpu, setArpu] = useState('25');
  const [margin, setMargin] = useState('70');

  const months = useMemo(() => {
    const c = Number(cac);
    const a = Number(arpu);
    const m = Number(margin) / 100;
    if (!c || !a || !m) return null;
    const contribution = a * m;
    return contribution > 0 ? c / contribution : null;
  }, [cac, arpu, margin]);

  const insight = months != null && isFinite(months) ? cacPaybackInsight(months) : null;

  return (
    <CalcCard
      title="CAC payback"
      description="How many months until a new customer pays back acquisition cost."
      results={<Result label="Payback period" value={fmtMonths(months)} emphasised />}
      insight={<Insight insight={insight} />}
    >
      <div className="grid grid-cols-3 gap-2">
        <Field label="CAC ($)" value={cac} onChange={setCac} />
        <Field label="ARPU/mo ($)" value={arpu} onChange={setArpu} />
        <Field label="Gross margin %" value={margin} onChange={setMargin} />
      </div>
    </CalcCard>
  );
}
