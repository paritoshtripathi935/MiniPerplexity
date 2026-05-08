import React, { useMemo, useState } from 'react';

interface Props {
  darkMode: boolean;
}

/**
 * Four client-only calculators marketers reach for daily.
 * No backend round-trip — just JS math.
 */
export function Calculators({ darkMode }: Props) {
  const card = darkMode
    ? 'bg-gray-900 border-gray-800 text-gray-100'
    : 'bg-white border-gray-200 text-gray-900';
  const subtle = darkMode ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-3">
      <p className={`text-xs px-1 ${subtle}`}>Quick math, no backend round-trip.</p>
      <CACPaybackCalc card={card} subtle={subtle} darkMode={darkMode} />
      <ROASToMarginCalc card={card} subtle={subtle} darkMode={darkMode} />
      <SampleSizeCalc card={card} subtle={subtle} darkMode={darkMode} />
      <BlendedEfficiencyCalc card={card} subtle={subtle} darkMode={darkMode} />
    </div>
  );
}

// ---------- Helpers --------------------------------------------------------
const inputCls = (darkMode: boolean) =>
  `w-full px-2 py-1.5 rounded border outline-none text-sm ${
    darkMode
      ? 'bg-gray-800 border-gray-700 placeholder-gray-500'
      : 'bg-white border-gray-300 placeholder-gray-400'
  }`;

function fmtMoney(v: number | null): string {
  if (v == null || !isFinite(v)) return '—';
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function fmtMonths(v: number | null): string {
  if (v == null || !isFinite(v)) return '—';
  return `${v.toFixed(1)} months`;
}
function fmtPct(v: number | null): string {
  if (v == null || !isFinite(v)) return '—';
  return `${(v * 100).toFixed(1)}%`;
}
function fmtRatio(v: number | null): string {
  if (v == null || !isFinite(v)) return '—';
  return `${v.toFixed(2)}×`;
}

interface CalcProps {
  card: string;
  subtle: string;
  darkMode: boolean;
}

// ---------- 1. CAC payback -------------------------------------------------
function CACPaybackCalc({ card, subtle, darkMode }: CalcProps) {
  const [cac, setCac] = useState('120');
  const [arpu, setArpu] = useState('25');
  const [margin, setMargin] = useState('70');

  const result = useMemo(() => {
    const c = Number(cac);
    const a = Number(arpu);
    const m = Number(margin) / 100;
    if (!c || !a || !m) return null;
    const monthlyContribution = a * m;
    if (monthlyContribution <= 0) return null;
    return c / monthlyContribution;
  }, [cac, arpu, margin]);

  return (
    <div className={`rounded-lg border p-3 ${card}`}>
      <h3 className="font-semibold text-sm mb-1">CAC payback</h3>
      <p className={`text-xs ${subtle} mb-3`}>How many months until a new customer pays back acquisition cost.</p>
      <div className="grid grid-cols-3 gap-2">
        <Field label="CAC ($)" value={cac} onChange={setCac} darkMode={darkMode} />
        <Field label="ARPU/mo ($)" value={arpu} onChange={setArpu} darkMode={darkMode} />
        <Field label="Gross margin (%)" value={margin} onChange={setMargin} darkMode={darkMode} />
      </div>
      <Result label="Payback period" value={fmtMonths(result)} subtle={subtle} />
    </div>
  );
}

// ---------- 2. ROAS → contribution margin ---------------------------------
function ROASToMarginCalc({ card, subtle, darkMode }: CalcProps) {
  const [roas, setRoas] = useState('2.5');
  const [cogs, setCogs] = useState('30');
  const [fixed, setFixed] = useState('10');

  const result = useMemo(() => {
    const r = Number(roas);
    const cogsPct = Number(cogs) / 100;
    const fixedPct = Number(fixed) / 100;
    if (!r) return null;
    // Contribution margin per ad-dollar = revenue - COGS - fixed share - ad spend
    const revenuePerAdDollar = r;
    const cogsCost = revenuePerAdDollar * cogsPct;
    const fixedCost = revenuePerAdDollar * fixedPct;
    const adCost = 1;
    const contribution = revenuePerAdDollar - cogsCost - fixedCost - adCost;
    return { contributionPerAd: contribution, marginPct: contribution / revenuePerAdDollar };
  }, [roas, cogs, fixed]);

  return (
    <div className={`rounded-lg border p-3 ${card}`}>
      <h3 className="font-semibold text-sm mb-1">ROAS → margin</h3>
      <p className={`text-xs ${subtle} mb-3`}>Are we actually making money at this ROAS?</p>
      <div className="grid grid-cols-3 gap-2">
        <Field label="ROAS (×)" value={roas} onChange={setRoas} darkMode={darkMode} />
        <Field label="COGS (%)" value={cogs} onChange={setCogs} darkMode={darkMode} />
        <Field label="Fixed costs (%)" value={fixed} onChange={setFixed} darkMode={darkMode} />
      </div>
      <Result
        label="Contribution / ad $"
        value={result ? fmtMoney(result.contributionPerAd) : '—'}
        subtle={subtle}
      />
      <Result
        label="Contribution margin"
        value={result ? fmtPct(result.marginPct) : '—'}
        subtle={subtle}
      />
    </div>
  );
}

// ---------- 3. A/B sample size --------------------------------------------
// Two-proportion z-test, two-sided, α=0.05, power=0.80 by default.
// Formula: n = (z_a/2 + z_b)^2 * (p1(1-p1) + p2(1-p2)) / (p2 - p1)^2
function SampleSizeCalc({ card, subtle, darkMode }: CalcProps) {
  const [baseline, setBaseline] = useState('1.2'); // % CTR/CVR
  const [mde, setMde] = useState('15');             // % relative lift
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

    // Inverse normal approximation (Beasley–Springer–Moro is overkill here).
    // Hard-coded common values are good enough; tweak if the user changes
    // alpha/power away from defaults.
    const z_alpha = invNormal(1 - a / 2);
    const z_beta = invNormal(pw);
    const numerator = Math.pow(z_alpha + z_beta, 2) * (p1 * (1 - p1) + p2 * (1 - p2));
    const denominator = Math.pow(p2 - p1, 2);
    const nPerArm = Math.ceil(numerator / denominator);
    return { nPerArm, total: nPerArm * 2, p1, p2 };
  }, [baseline, mde, alpha, power]);

  return (
    <div className={`rounded-lg border p-3 ${card}`}>
      <h3 className="font-semibold text-sm mb-1">A/B sample size</h3>
      <p className={`text-xs ${subtle} mb-3`}>
        Two-proportion z-test, two-sided. Tells you how many users per arm to detect a real change.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Baseline rate (%)" value={baseline} onChange={setBaseline} darkMode={darkMode} />
        <Field label="MDE — relative lift (%)" value={mde} onChange={setMde} darkMode={darkMode} />
        <Field label="α (two-sided)" value={alpha} onChange={setAlpha} darkMode={darkMode} />
        <Field label="Power" value={power} onChange={setPower} darkMode={darkMode} />
      </div>
      <Result label="N per arm" value={result ? result.nPerArm.toLocaleString() : '—'} subtle={subtle} />
      <Result label="Total N" value={result ? result.total.toLocaleString() : '—'} subtle={subtle} />
    </div>
  );
}

// ---------- 4. Blended channel efficiency ---------------------------------
interface ChannelRow {
  name: string;
  spend: string;
  conversions: string;
}

function BlendedEfficiencyCalc({ card, subtle, darkMode }: CalcProps) {
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
        return { name: r.name, cac: c ? s / c : null, sharePct: totals.spend ? s / totals.spend : 0 };
      }),
    };
  }, [rows]);

  const updateRow = (i: number, patch: Partial<ChannelRow>) =>
    setRows(rs => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows(rs => [...rs, { name: 'Channel', spend: '0', conversions: '0' }]);
  const removeRow = (i: number) => setRows(rs => rs.filter((_, idx) => idx !== i));

  return (
    <div className={`rounded-lg border p-3 ${card}`}>
      <h3 className="font-semibold text-sm mb-1">Blended channel efficiency</h3>
      <p className={`text-xs ${subtle} mb-3`}>Per-channel CAC + the blended number.</p>

      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-12 gap-1 items-center">
            <input
              value={r.name}
              onChange={e => updateRow(i, { name: e.target.value })}
              className={`col-span-4 ${inputCls(darkMode)}`}
            />
            <input
              value={r.spend}
              onChange={e => updateRow(i, { spend: e.target.value })}
              placeholder="spend"
              className={`col-span-3 ${inputCls(darkMode)}`}
            />
            <input
              value={r.conversions}
              onChange={e => updateRow(i, { conversions: e.target.value })}
              placeholder="conv"
              className={`col-span-3 ${inputCls(darkMode)}`}
            />
            <span className="col-span-1 text-xs text-right">
              {fmtMoney(result?.perChannel[i]?.cac ?? null)}
            </span>
            <button
              onClick={() => removeRow(i)}
              className={`col-span-1 text-xs ${subtle} hover:text-red-400`}
              aria-label="remove"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button onClick={addRow} className={`text-xs ${subtle} mt-2 hover:opacity-100`}>
        + Add channel
      </button>

      <Result label="Total spend" value={result ? fmtMoney(result.total) : '—'} subtle={subtle} />
      <Result
        label="Total conversions"
        value={result ? result.conversions.toLocaleString() : '—'}
        subtle={subtle}
      />
      <Result label="Blended CAC" value={result ? fmtMoney(result.blendedCAC) : '—'} subtle={subtle} />
    </div>
  );
}

// ---------- Subcomponents --------------------------------------------------
function Field({
  label,
  value,
  onChange,
  darkMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  darkMode: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider opacity-60 mb-0.5">{label}</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        inputMode="decimal"
        className={inputCls(darkMode)}
      />
    </label>
  );
}

function Result({ label, value, subtle }: { label: string; value: string; subtle: string }) {
  return (
    <div className="mt-2 flex items-baseline justify-between border-t border-current/10 pt-2">
      <span className={`text-xs ${subtle}`}>{label}</span>
      <span className="font-mono text-sm font-semibold">{value}</span>
    </div>
  );
}

// ---------- Stats ----------------------------------------------------------
/**
 * Inverse normal CDF — Acklam's algorithm.
 * Accurate to ~1.15e-9 for p ∈ (0, 1). Good enough for sample-size math.
 */
function invNormal(p: number): number {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969,
             138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887,
             66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184,
             -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143,
             3.75440866190742];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
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
