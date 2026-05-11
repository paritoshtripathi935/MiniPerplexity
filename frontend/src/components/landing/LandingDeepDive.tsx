export function LandingDeepDive() {
  return (
    <section id="plays" className="py-24 sm:py-32">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-6 space-y-24">
        <DeepRow
          eyebrow="cited, not guessed"
          headline="trust but verify every benchmark."
          body="every answer keeps the source urls it was grounded in. expand the citation drawer to see the exact paragraph the number came from — and re-run with a different source weighting if you don't like the answer."
          mock={<CitationDrawerMock />}
        />

        <DeepRow
          reverse
          eyebrow="plays library"
          headline="the briefs you'd otherwise pay a consultant for."
          body="10 ready-to-run plays — meta abo test plans, lifecycle audits, icp refreshes, channel allocation models. each one is grounded in your brand context the moment you run it."
          mock={<PlaysGridMock />}
        />

        <DeepRow
          eyebrow="calculators"
          headline="modeling that matches your p&l."
          body="cac payback, roas-to-margin, sample size, blended efficiency. each calculator accepts your contribution margin and target payback so the answer comes out in months, not abstractions."
          mock={<CalculatorChartMock />}
        />
      </div>
    </section>
  );
}

function DeepRow({
  eyebrow,
  headline,
  body,
  mock,
  reverse = false,
}: {
  eyebrow: string;
  headline: string;
  body: string;
  mock: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <div className={`flex flex-col ${reverse ? 'md:flex-row-reverse' : 'md:flex-row'} items-center gap-12 lg:gap-20`}>
      <div className="flex-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-3">
          {eyebrow}
        </p>
        <h3 className="font-display text-[32px] sm:text-[40px] leading-[1.1] tracking-[-0.02em] font-semibold text-fg mb-4">
          {headline}
        </h3>
        <p className="text-[17px] leading-[1.6] text-fg-muted max-w-md">{body}</p>
      </div>
      <div className="flex-1 w-full">{mock}</div>
    </div>
  );
}

function CitationDrawerMock() {
  return (
    <div className="rounded-2xl border border-border/60 bg-surface-raised/60 p-5 space-y-3 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.4)]">
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">citations</div>
      {[
        { src: 'eMarketer · Q1 2026', quote: '"DTC skincare median CAC is $47 across reporting brands…"' },
        { src: 'Adweek · benchmarks 2026', quote: '"Premium skincare CACs rose 12% YoY post-iOS17…"' },
        { src: 'Meta industry report', quote: '"Advantage+ shopping campaigns reduced CPA by 14%…"' },
      ].map(c => (
        <div key={c.src} className="rounded-lg border border-border/40 bg-surface/60 p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] text-brand">{c.src}</span>
            <span className="font-mono text-[10px] text-fg-subtle">open ↗</span>
          </div>
          <p className="text-[13px] text-fg-muted italic">{c.quote}</p>
        </div>
      ))}
    </div>
  );
}

function PlaysGridMock() {
  const plays = [
    { name: 'meta abo q4 test plan', tag: 'paid · meta' },
    { name: 'lifecycle audit', tag: 'crm' },
    { name: 'icp refresh', tag: 'strategy' },
    { name: 'creative brief', tag: 'creative' },
    { name: 'channel allocation', tag: 'planning' },
    { name: 'a/b test spec', tag: 'experimentation' },
  ];
  return (
    <div className="rounded-2xl border border-border/60 bg-surface-raised/60 p-5 grid grid-cols-2 gap-2.5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.4)]">
      {plays.map((p, i) => (
        <div
          key={p.name}
          className={`rounded-lg border p-3 transition-colors ${
            i === 0
              ? 'border-brand/50 bg-brand/10'
              : 'border-border/40 bg-surface/40 hover:border-border-strong/40'
          }`}
        >
          <div className="font-display text-[13px] font-semibold text-fg leading-tight">{p.name}</div>
          <div className="font-mono text-[10px] text-fg-subtle mt-1.5 uppercase tracking-wider">{p.tag}</div>
        </div>
      ))}
    </div>
  );
}

function CalculatorChartMock() {
  return (
    <div className="rounded-2xl border border-border/60 bg-surface-raised/60 p-5 space-y-4 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.4)]">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">cac payback</div>
          <div className="font-display text-[32px] font-semibold text-fg leading-none mt-1">4.2 mo</div>
        </div>
        <div className="font-mono text-[11px] text-brand">on track</div>
      </div>

      <div className="h-32 relative">
        <svg viewBox="0 0 240 100" className="w-full h-full">
          <defs>
            <linearGradient id="dd-grad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#7C5CFF" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0 80 C 40 70, 80 55, 120 45 S 200 20, 240 10 L 240 100 L 0 100 Z"
            fill="url(#dd-grad)"
          />
          <path
            d="M0 80 C 40 70, 80 55, 120 45 S 200 20, 240 10"
            stroke="#7C5CFF"
            strokeWidth="1.5"
            fill="none"
          />
        </svg>
      </div>

      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/40">
        {[
          ['cac', '$48'],
          ['margin', '42%'],
          ['target', '<6 mo'],
        ].map(([k, v]) => (
          <div key={k}>
            <div className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">{k}</div>
            <div className="font-display text-[16px] font-semibold text-fg">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
