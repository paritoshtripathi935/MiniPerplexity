import {
  FileText,
  Mail,
  Target,
  Sparkles,
  Layers,
  FlaskConical,
  ArrowUpRight,
  Quote,
  Download,
} from 'lucide-react';

export function LandingFeatures() {
  return (
    <section id="features" className="py-24 sm:py-32">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-6">
        <div className="max-w-2xl mb-14">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-3">
            the product
          </p>
          <h2 className="font-display text-[36px] sm:text-[44px] leading-[1.1] tracking-[-0.02em] font-semibold text-fg">
            everything a performance marketer asks slack for, in one place.
          </h2>
          <p className="mt-4 text-fg-muted max-w-xl">
            five surfaces, one workspace. each one is grounded in the same brand context and the same trusted sources — so the answers, briefs, and models stay consistent.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 md:grid-rows-[auto_auto] gap-4">
          <BentoCard
            className="md:col-span-8 md:row-span-2"
            eyebrow="cited answers"
            title="cite, don't guess."
            blurb="every claim links back to a real source — platform docs, industry reports, publisher benchmarks. inspect the exact paragraph the number came from."
          >
            <HeroChatMock />
          </BentoCard>

          <BentoCard
            className="md:col-span-4"
            eyebrow="brand profile"
            title="context that follows you."
            blurb="your icp, voice, p&l, and live campaigns are part of every prompt."
          >
            <BrandProfileMock />
          </BentoCard>

          <BentoCard
            id="calculators"
            className="md:col-span-4"
            eyebrow="calculators"
            title="modeled for your p&l."
            blurb="cac payback, roas-to-margin, sample size — with your margins built in."
          >
            <CalcSparklineMock />
          </BentoCard>

          <BentoCard
            id="plays"
            className="md:col-span-6"
            eyebrow="plays library"
            title="10 plays you'd otherwise pay a consultant for."
            blurb="grounded the moment you run them. customize and ship."
          >
            <PlaysIconGridMock />
          </BentoCard>

          <BentoCard
            className="md:col-span-6"
            eyebrow="source weighting"
            title="re-rank the voices you trust."
            blurb="boost the publishers and platforms you read. the model follows the weights you set."
          >
            <SourceWeightsMock />
          </BentoCard>
        </div>
      </div>
    </section>
  );
}

function BentoCard({
  id,
  className = '',
  eyebrow,
  title,
  blurb,
  children,
}: {
  id?: string;
  className?: string;
  eyebrow: string;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      className={`group relative overflow-hidden rounded-2xl border border-border/60 bg-surface-raised/40 p-6 sm:p-7 transition-all hover:border-brand/40 hover:bg-surface-raised/60 flex flex-col ${className}`}
    >
      <div className="mb-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand/80 mb-2">
          {eyebrow}
        </p>
        <h3 className="font-display text-[20px] sm:text-[22px] font-semibold tracking-tight text-fg leading-tight">
          {title}
        </h3>
        <p className="mt-2 text-fg-muted text-[14px] leading-relaxed max-w-md">{blurb}</p>
      </div>
      <div className="flex-1 flex flex-col justify-end">{children}</div>
    </div>
  );
}

function HeroChatMock() {
  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-lg border border-border/40 bg-surface/60 px-3 py-2 font-mono text-[10px] text-fg-subtle">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          brand context: <span className="text-fg">lumen skincare</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Quote className="w-3 h-3 text-brand/70" />
          <span>3 sources cited</span>
        </div>
      </div>

      <div className="flex-1 rounded-xl border border-border/40 bg-surface/60 p-4 sm:p-5 flex flex-col">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-7 h-7 rounded-full bg-surface-raised border border-border/40 shrink-0" />
          <div className="font-display text-[14px] text-fg leading-snug">
            what's the median cac for dtc skincare in 2026, and how has it shifted post-iOS17?
          </div>
        </div>

        <div className="flex-1 pl-10 space-y-2.5 text-[13px] leading-relaxed text-fg-muted">
          <p>
            median cac sits at <span className="text-fg font-medium">$47</span>
            <Sup n={1} /> across reporting dtc skincare brands, with the p90 at{' '}
            <span className="text-fg font-medium">$118</span>
            <Sup n={2} />.
          </p>
          <p>
            cacs have risen <span className="text-fg font-medium">~12% yoy</span>
            <Sup n={2} /> since iOS17 — driven mostly by signal loss on prospecting audiences. advantage+ shopping has offset some of that
            <Sup n={3} />.
          </p>
          <p className="border-l-2 border-brand/40 pl-3 text-fg-muted">
            <span className="font-mono text-[10px] uppercase tracking-wider text-brand/80 block mb-1">
              applied to your brand
            </span>
            your target cac of <span className="text-fg font-medium">{'<$55'}</span> sits in the top quartile — comfortable for premium skincare, but tight against the post-iOS17 median.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {[
          { n: 1, src: 'eMarketer Q1 2026', q: 'dtc skincare median cac $47…' },
          { n: 2, src: 'Adweek benchmarks', q: 'cpa rose 12% yoy post-iOS17…' },
          { n: 3, src: 'Meta industry rpt', q: 'a+ shopping cut cpa 14%…' },
        ].map(c => (
          <div
            key={c.n}
            className="rounded-md border border-brand/30 bg-brand/5 p-2.5 hover:border-brand/60 transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-[10px] text-brand">
                [{c.n}] {c.src}
              </span>
              <ArrowUpRight className="w-3 h-3 text-brand/70" />
            </div>
            <p className="font-mono text-[10px] text-fg-muted italic truncate">"{c.q}"</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <span className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle shrink-0">
          follow up
        </span>
        <div className="flex flex-wrap gap-1.5">
          {[
            'compare to my Q4 cac',
            'draft a meta abo test plan',
            'show payback at this cac',
          ].map(t => (
            <button
              key={t}
              type="button"
              className="inline-flex items-center rounded-full border border-border/60 bg-surface/40 hover:border-brand/40 hover:bg-brand/5 px-3 py-1 font-mono text-[10px] text-fg-muted hover:text-fg transition-colors"
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border/40 bg-surface/40 px-3 py-2">
        <div className="flex items-center gap-2 font-mono text-[10px] text-fg-subtle">
          <Download className="w-3 h-3" />
          export
        </div>
        <div className="flex gap-1.5">
          {['notion', 'slack', '.pdf', 'brief.md'].map(x => (
            <span
              key={x}
              className="inline-flex items-center rounded border border-border/60 bg-surface-raised/40 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted"
            >
              {x}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Sup({ n }: { n: number }) {
  return (
    <sup className="ml-0.5 inline-flex items-center justify-center min-w-[14px] h-[14px] px-1 rounded text-[9px] font-mono text-brand bg-brand/10 align-super">
      {n}
    </sup>
  );
}

function BrandProfileMock() {
  return (
    <div className="rounded-xl border border-border/40 bg-surface/60 p-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#7C5CFF] to-[#3B82F6] grid place-items-center text-white font-display font-semibold text-[14px]">
          L
        </div>
        <div>
          <div className="font-display text-[14px] font-semibold text-fg leading-tight">
            lumen skincare
          </div>
          <div className="font-mono text-[10px] text-fg-subtle">dtc · premium · skincare</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {['editorial', 'science-led', 'premium', 'gen-z+millennial'].map(t => (
          <span
            key={t}
            className="inline-flex items-center rounded-md border border-border/60 bg-surface-raised/60 px-2 py-0.5 font-mono text-[10px] text-fg-muted"
          >
            {t}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border/40">
        {[
          ['aov', '$68'],
          ['target cac', '<$55'],
          ['margin', '42%'],
        ].map(([k, v]) => (
          <div key={k}>
            <div className="font-mono text-[9px] uppercase tracking-wider text-fg-subtle">{k}</div>
            <div className="font-display text-[14px] font-semibold text-fg">{v}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-border/40">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="font-mono text-[10px] text-fg-subtle">applied to every answer</span>
      </div>
    </div>
  );
}

function CalcSparklineMock() {
  return (
    <div className="rounded-xl border border-border/40 bg-surface/60 p-4 space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
            cac payback
          </div>
          <div className="font-display text-[28px] font-semibold leading-none text-fg mt-1">
            4.2 mo
          </div>
        </div>
        <div className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
          on track
        </div>
      </div>

      <svg viewBox="0 0 240 80" className="w-full h-16">
        <defs>
          <linearGradient id="calc-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#7C5CFF" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0 60 C 40 55, 70 50, 100 38 S 170 18, 240 12 L 240 80 L 0 80 Z"
          fill="url(#calc-grad)"
        />
        <path
          d="M0 60 C 40 55, 70 50, 100 38 S 170 18, 240 12"
          stroke="#7C5CFF"
          strokeWidth="1.5"
          fill="none"
        />
      </svg>

      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/40">
        {[
          ['cac', '$48'],
          ['cm', '42%'],
          ['ltv', '$214'],
        ].map(([k, v]) => (
          <div key={k}>
            <div className="font-mono text-[9px] uppercase tracking-wider text-fg-subtle">{k}</div>
            <div className="font-display text-[13px] font-semibold text-fg">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlaysIconGridMock() {
  const plays = [
    { icon: FlaskConical, name: 'meta abo test plan', tag: 'paid · meta', tone: 'brand' },
    { icon: Target, name: 'icp refresh', tag: 'strategy', tone: 'neutral' },
    { icon: Mail, name: 'lifecycle audit', tag: 'crm', tone: 'neutral' },
    { icon: FileText, name: 'creative brief', tag: 'creative', tone: 'neutral' },
    { icon: Layers, name: 'channel allocation', tag: 'planning', tone: 'neutral' },
    { icon: Sparkles, name: 'launch playbook', tag: 'launch', tone: 'neutral' },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-2">
      {plays.map(p => {
        const Icon = p.icon;
        const isBrand = p.tone === 'brand';
        return (
          <div
            key={p.name}
            className={`rounded-lg border p-3 transition-colors ${
              isBrand
                ? 'border-brand/50 bg-brand/10'
                : 'border-border/40 bg-surface/40 hover:border-border-strong/40 hover:bg-surface/60'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <span
                className={`grid place-items-center w-7 h-7 rounded-md shrink-0 ${
                  isBrand ? 'bg-brand/20 text-brand' : 'bg-surface-raised/80 text-fg-muted'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </span>
              <div className="min-w-0">
                <div className="font-display text-[12px] font-semibold text-fg leading-tight truncate">
                  {p.name}
                </div>
                <div className="font-mono text-[9px] text-fg-subtle mt-1 uppercase tracking-wider truncate">
                  {p.tag}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SourceWeightsMock() {
  const sources = [
    { name: 'Meta docs', weight: 92 },
    { name: 'eMarketer', weight: 84 },
    { name: 'Google Help', weight: 78 },
    { name: 'Adweek', weight: 64 },
    { name: 'Tinuiti reports', weight: 52 },
    { name: 'industry blogs', weight: 24 },
  ];

  return (
    <div className="rounded-xl border border-border/40 bg-surface/60 p-4 space-y-2.5">
      {sources.map(s => (
        <div key={s.name} className="space-y-1">
          <div className="flex items-center justify-between font-mono text-[11px]">
            <span className="text-fg">{s.name}</span>
            <span className="text-fg-subtle">{s.weight}</span>
          </div>
          <div className="h-1.5 rounded-full bg-fg-subtle/15 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#7C5CFF] to-[#3B82F6]"
              style={{ width: `${s.weight}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
