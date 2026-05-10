import React, { useMemo, useState } from 'react';
import { CalcCard, Result, inputCls } from './CalcCard';
import { Insight } from './Insight';
import { fmtMoney } from './formatters';
import { blendedCacInsight } from './benchmarks';

interface ChannelRow {
  name: string;
  spend: string;
  conversions: string;
}

export function BlendedEfficiencyCalc() {
  const [rows, setRows] = useState<ChannelRow[]>([
    { name: 'Meta', spend: '20000', conversions: '350' },
    { name: 'Google', spend: '15000', conversions: '210' },
    { name: 'TikTok', spend: '5000', conversions: '60' },
  ]);

  const result = useMemo(() => {
    const totals = rows.reduce(
      (acc, r) => ({
        spend: acc.spend + (Number(r.spend) || 0),
        conv: acc.conv + (Number(r.conversions) || 0),
      }),
      { spend: 0, conv: 0 }
    );
    if (!totals.conv) return null;
    return {
      blendedCAC: totals.spend / totals.conv,
      total: totals.spend,
      conversions: totals.conv,
      perChannel: rows.map(r => {
        const s = Number(r.spend) || 0;
        const c = Number(r.conversions) || 0;
        return { name: r.name, cac: c ? s / c : null };
      }),
    };
  }, [rows]);

  const insight = result && isFinite(result.blendedCAC)
    ? blendedCacInsight(result.blendedCAC)
    : null;

  const updateRow = (i: number, patch: Partial<ChannelRow>) =>
    setRows(rs => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows(rs => [...rs, { name: 'Channel', spend: '0', conversions: '0' }]);
  const removeRow = (i: number) => setRows(rs => rs.filter((_, idx) => idx !== i));

  return (
    <CalcCard
      title="Blended channel efficiency"
      description="Per-channel CAC + the blended number across all channels."
      results={
        <>
          <Result label="Total spend" value={result ? fmtMoney(result.total) : '—'} />
          <Result
            label="Total conversions"
            value={result ? result.conversions.toLocaleString() : '—'}
          />
          <Result label="Blended CAC" value={result ? fmtMoney(result.blendedCAC) : '—'} emphasised />
        </>
      }
      insight={<Insight insight={insight} />}
    >
      <div className="space-y-1.5">
        <div className="grid grid-cols-12 gap-1 text-[10px] uppercase tracking-[0.06em] font-medium text-fg-subtle px-1">
          <span className="col-span-4">Channel</span>
          <span className="col-span-3">Spend</span>
          <span className="col-span-3">Conv</span>
          <span className="col-span-1 text-right">CAC</span>
          <span className="col-span-1" />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-12 gap-1 items-center">
            <input
              value={r.name}
              onChange={e => updateRow(i, { name: e.target.value })}
              className={`col-span-4 ${inputCls}`}
            />
            <input
              value={r.spend}
              onChange={e => updateRow(i, { spend: e.target.value })}
              className={`col-span-3 ${inputCls}`}
            />
            <input
              value={r.conversions}
              onChange={e => updateRow(i, { conversions: e.target.value })}
              className={`col-span-3 ${inputCls}`}
            />
            <span className="col-span-1 text-[11px] font-mono text-fg-muted text-right tabular-nums">
              {fmtMoney(result?.perChannel[i]?.cac ?? null)}
            </span>
            <button
              onClick={() => removeRow(i)}
              className="col-span-1 text-fg-subtle hover:text-danger transition-colors"
              aria-label="Remove"
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={addRow}
          className="text-[12px] text-brand hover:underline mt-1"
        >
          + Add channel
        </button>
      </div>
    </CalcCard>
  );
}
