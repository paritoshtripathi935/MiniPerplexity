import React, { useMemo, useState } from 'react';
import { CalcCard, Field, Result, inputCls } from './CalcCard';
import { Insight } from './Insight';
import { ModeToggle, type CalcMode } from './ModeToggle';
import { ScenarioBar } from './ScenarioBar';
import { ScenarioCompare, type CompareField } from './ScenarioCompare';
import { useScenarios, type Scenario } from './useScenarios';
import { fmtMoney } from './formatters';
import { blendedCacInsight } from './benchmarks';

const CALC_ID = 'blended-efficiency';

interface ChannelRow {
  name: string;
  spend: string;
  conversions: string;
}

export function BlendedEfficiencyCalc() {
  const [mode, setMode] = useState<CalcMode>('forward');
  const [rows, setRows] = useState<ChannelRow[]>([
    { name: 'Meta', spend: '20000', conversions: '350' },
    { name: 'Google', spend: '15000', conversions: '210' },
    { name: 'TikTok', spend: '5000', conversions: '60' },
  ]);
  const [targetCac, setTargetCac] = useState('80');

  const forward = useMemo(() => {
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

  const reverse = useMemo(() => {
    const tgt = Number(targetCac);
    if (!tgt) return null;
    const perChannel = rows.map(r => {
      const c = Number(r.conversions) || 0;
      return { name: r.name, requiredSpend: c * tgt };
    });
    const total = perChannel.reduce((s, c) => s + c.requiredSpend, 0);
    const totalConv = rows.reduce((s, r) => s + (Number(r.conversions) || 0), 0);
    return { perChannel, total, totalConv };
  }, [rows, targetCac]);

  const insightValue =
    mode === 'forward'
      ? (forward && isFinite(forward.blendedCAC) ? forward.blendedCAC : null)
      : (Number(targetCac) || null);
  const insight = insightValue != null ? blendedCacInsight(insightValue) : null;

  const { scenarios, save, remove, duplicate } = useScenarios(CALC_ID);
  const [compareOpen, setCompareOpen] = useState(false);

  const inputs = { rows, targetCac };
  const outputs = {
    blendedCAC: forward?.blendedCAC ?? null,
    totalSpend: forward?.total ?? null,
    totalConversions: forward?.conversions ?? null,
    requiredTotalSpend: reverse?.total ?? null,
  };

  const loadScenario = (s: Scenario) => {
    setMode(s.mode);
    if (Array.isArray(s.inputs.rows)) setRows(s.inputs.rows as ChannelRow[]);
    if (typeof s.inputs.targetCac === 'string') setTargetCac(s.inputs.targetCac);
  };

  const compareFields: CompareField[] = [
    { key: 'mode', label: 'Mode', get: s => s.mode, format: v => (v === 'forward' ? 'Forward' : 'Reverse') },
    {
      key: 'channels',
      label: 'Channels',
      get: s => (s.inputs.rows as ChannelRow[] | undefined)?.length ?? 0,
      format: v => `${v}`,
    },
    { key: 'targetCac', label: 'Target CAC', get: s => s.inputs.targetCac, format: v => fmtMoney(Number(v)), lowerIsBetter: true },
    { key: 'totalSpend', label: 'Total spend', get: s => s.outputs.totalSpend, format: v => fmtMoney(v as number | null) },
    { key: 'totalConversions', label: 'Total conversions', get: s => s.outputs.totalConversions, format: v => v == null ? '—' : (v as number).toLocaleString() },
    { key: 'blendedCAC', label: 'Blended CAC', get: s => s.outputs.blendedCAC, format: v => fmtMoney(v as number | null), lowerIsBetter: true },
    { key: 'requiredTotalSpend', label: 'Required spend', get: s => s.outputs.requiredTotalSpend, format: v => fmtMoney(v as number | null), lowerIsBetter: true },
  ];

  const updateRow = (i: number, patch: Partial<ChannelRow>) =>
    setRows(rs => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows(rs => [...rs, { name: 'Channel', spend: '0', conversions: '0' }]);
  const removeRow = (i: number) => setRows(rs => rs.filter((_, idx) => idx !== i));

  return (
    <CalcCard
      title="Blended channel efficiency"
      description="Per-channel CAC + the blended number across all channels."
      headerRight={
        <ModeToggle mode={mode} onChange={setMode} reverseLabel="Plan budget" />
      }
      results={
        mode === 'forward' ? (
          <>
            <Result label="Total spend" value={forward ? fmtMoney(forward.total) : '—'} />
            <Result
              label="Total conversions"
              value={forward ? forward.conversions.toLocaleString() : '—'}
            />
            <Result
              label="Blended CAC"
              value={forward ? fmtMoney(forward.blendedCAC) : '—'}
              emphasised
            />
          </>
        ) : (
          <>
            <Result
              label="Total conversions"
              value={reverse ? reverse.totalConv.toLocaleString() : '—'}
            />
            <Result
              label="Required total spend"
              value={reverse ? fmtMoney(reverse.total) : '—'}
              emphasised
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
      {mode === 'reverse' && (
        <Field label="Target blended CAC ($)" value={targetCac} onChange={setTargetCac} />
      )}
      <div className="space-y-1.5">
        <div className="grid grid-cols-12 gap-1 text-[10px] uppercase tracking-[0.06em] font-medium text-fg-subtle px-1">
          <span className="col-span-4">Channel</span>
          {mode === 'forward' ? (
            <>
              <span className="col-span-3">Spend</span>
              <span className="col-span-3">Conv</span>
              <span className="col-span-1 text-right">CAC</span>
            </>
          ) : (
            <>
              <span className="col-span-3">Target conv</span>
              <span className="col-span-4 text-right">Required spend</span>
            </>
          )}
          <span className="col-span-1" />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-12 gap-1 items-center">
            <input
              value={r.name}
              onChange={e => updateRow(i, { name: e.target.value })}
              className={`col-span-4 ${inputCls}`}
            />
            {mode === 'forward' ? (
              <>
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
                  {fmtMoney(forward?.perChannel[i]?.cac ?? null)}
                </span>
              </>
            ) : (
              <>
                <input
                  value={r.conversions}
                  onChange={e => updateRow(i, { conversions: e.target.value })}
                  className={`col-span-3 ${inputCls}`}
                />
                <span className="col-span-4 text-[12px] font-mono text-fg text-right tabular-nums">
                  {fmtMoney(reverse?.perChannel[i]?.requiredSpend ?? null)}
                </span>
              </>
            )}
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
