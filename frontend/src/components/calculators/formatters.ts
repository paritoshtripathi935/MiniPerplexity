export const fmtMoney = (v: number | null): string =>
  v == null || !isFinite(v)
    ? '—'
    : v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export const fmtMonths = (v: number | null): string =>
  v == null || !isFinite(v) ? '—' : `${v.toFixed(1)} months`;

export const fmtPct = (v: number | null): string =>
  v == null || !isFinite(v) ? '—' : `${(v * 100).toFixed(1)}%`;
