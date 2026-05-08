import React, { useMemo, useState } from 'react';
import { Card } from './ui/Card';

interface Props {
  /** Kept for back-compat with the page; not actually used (tokens swap via .dark). */
  darkMode?: boolean;
}

/** Four client-only calculators marketers reach for daily. */
export function Calculators({}: Props) {
  return (
    <>
      <CACPaybackCalc />
      <ROASToMarginCalc />
      <SampleSizeCalc />
      <BlendedEfficiencyCalc />
    </>
  );
}

// ---------- Helpers --------------------------------------------------------
const inputCls =
  'w-full px-2.5 h-9 rounded-md border border-border bg-surface text-[13px] tabular-nums placeholder:text-fg-subtle outline-none focus-visible:shadow-focus';

const fmtMoney = (v: number | null): string =>
  v == null || !isFinite(v)
    ? '—'
    : v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtMonths = (v: number | null): string =>
  v == null || !isFinite(v) ? '—' : `${v.toFixed(1)} months`;
const fmtPct = (v: number | null): string =>
  v == null || !isFinite(v) ? '—' : `${(v * 100).toFixed(1)}%`;

// ---------- Card chrome shared by all calculators -------------------------
function CalcCard({
  title,
  description,
  children,
  results,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  results: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4">
        <h3 className="font-display font-semibold text-[14px] tracking-tight">{title}</h3>
        <p className="text-[12px] text-fg-muted mt-0.5 leading-relaxed">{description}</p>
      </div>
      <div className="space-y-3">{children}</div>
      <div className="mt-4 pt-3 border-t border-border space-y-1.5">{results}</div>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.06em] font-medium text-fg-subtle mb-1">
        {label}
      </span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        inputMode="decimal"
        className={inputCls}
      />
    </label>
  );
}

function Result({ label, value, emphasised = false }: { label: string; value: string; emphasised?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[12px] text-fg-subtle">{label}</span>
      <span
        className={`font-mono ${emphasised ? 'text-[15px] font-semibold text-fg' : 'text-[13px] text-fg'}`}
      >
        {value}
      </span>
    </div>
  );
}

// ---------- 1. CAC payback -------------------------------------------------
function CACPaybackCalc() {
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

  return (
    <CalcCard
      title="CAC payback"
      description="How many months until a new customer pays back acquisition cost."
      results={<Result label="Payback period" value={fmtMonths(months)} emphasised />}
    >
      <div className="grid grid-cols-3 gap-2">
        <Field label="CAC ($)" value={cac} onChange={setCac} />
        <Field label="ARPU/mo ($)" value={arpu} onChange={setArpu} />
        <Field label="Gross margin %" value={margin} onChange={setMargin} />
      </div>
    </CalcCard>
  );
}

// ---------- 2. ROAS → contribution margin ---------------------------------
function ROASToMarginCalc() {
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
    >
      <div className="grid grid-cols-3 gap-2">
        <Field label="ROAS (×)" value={roas} onChange={setRoas} />
        <Field label="COGS %" value={cogs} onChange={setCogs} />
        <Field label="Fixed costs %" value={fixed} onChange={setFixed} />
      </div>
    </CalcCard>
  );
}

// ---------- 3. A/B sample size --------------------------------------------
function SampleSizeCalc() {
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

  return (
    <CalcCard
      title="A/B sample size"
      description="Two-proportion z-test, two-sided. How many users per arm to detect a real change."
      results={
        <>
          <Result label="N per arm" value={result ? result.nPerArm.toLocaleString() : '—'} emphasised />
          <Result label="Total N" value={result ? result.total.toLocaleString() : '—'} />
        </>
      }
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

// ---------- 4. Blended channel efficiency ---------------------------------
interface ChannelRow { name: string; spend: string; conversions: string; }

function BlendedEfficiencyCalc() {
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
          <Result label="Total conversions" value={result ? result.conversions.toLocaleString() : '—'} />
          <Result label="Blended CAC" value={result ? fmtMoney(result.blendedCAC) : '—'} emphasised />
        </>
      }
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

// ---------- Stats ----------------------------------------------------------
/** Inverse normal CDF — Acklam's algorithm. */
function invNormal(p: number): number {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969,
             138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887,
             66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184,
             -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143,
             3.75440866190742];
  const pLow = 0.02425, pHigh = 1 - pLow;
  let q: number, r: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
}
