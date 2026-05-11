import { Link } from 'react-router-dom';
import { PlayCircle, ArrowRight } from 'lucide-react';

export function LandingHero() {
  return (
    <section className="relative pt-40 pb-24 overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-x-0 -top-40 h-[640px] -z-10"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(124,92,255,0.25), transparent 70%), radial-gradient(ellipse 40% 30% at 70% 10%, rgba(59,130,246,0.15), transparent 70%)',
          filter: 'blur(40px)',
        }}
      />
      <div className="max-w-[1200px] mx-auto px-5 sm:px-6 text-center">
        <div className="inline-flex items-center rounded-full border border-brand/40 bg-brand/5 px-3.5 py-1.5 mb-8">
          <span className="font-mono text-[12px] text-brand">
            now in open beta — free forever for solo marketers
          </span>
        </div>

        <h1 className="font-display text-[44px] sm:text-[64px] md:text-[76px] leading-[1.05] tracking-[-0.025em] font-semibold text-fg max-w-4xl mx-auto">
          the fastest path from question to growth play.
        </h1>

        <p className="mt-6 text-[18px] leading-[1.6] text-fg-muted max-w-2xl mx-auto">
          benchmarks, briefs, and channel plans grounded in the sources you actually trust — with your brand context baked into every answer.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/sign-in"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#7C5CFF] to-[#3B82F6] px-7 py-3.5 text-[15px] font-semibold text-white shadow-[0_0_32px_rgba(124,92,255,0.35)] hover:shadow-[0_0_40px_rgba(124,92,255,0.5)] transition-shadow"
          >
            start free — no card required
            <ArrowRight className="w-4 h-4" />
          </Link>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-border/60 px-7 py-3.5 text-[15px] font-semibold text-fg hover:border-border-strong/60 hover:bg-surface-raised/40 transition-colors"
          >
            <PlayCircle className="w-4 h-4 text-fg-muted" />
            see it in 60 seconds
          </button>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[12px] text-fg-subtle">
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-brand/60" />
            free while in beta
          </span>
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-brand/60" />
            no credit card
          </span>
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-brand/60" />
            ready in under a minute
          </span>
        </div>

        <div className="mt-16 max-w-5xl mx-auto">
          <HeroProductMock />
        </div>
      </div>
    </section>
  );
}

function HeroProductMock() {
  return (
    <div className="relative rounded-2xl border border-border/60 bg-surface-raised/60 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.5)] overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/40 px-4 py-3 bg-surface/80">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/40" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/40" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-500/40" />
        </div>
        <span className="ml-3 font-mono text-[11px] text-fg-subtle">paidpilot.app/investigations</span>
      </div>

      <div className="grid grid-cols-[220px_1fr] min-h-[340px]">
        <aside className="border-r border-border/40 bg-surface/60 p-3 space-y-1">
          <div className="text-[11px] font-mono text-fg-subtle px-2 pb-1.5">recent</div>
          {[
            'cac benchmarks for dtc skincare',
            'meta abo q4 test brief',
            'lifecycle audit — paid social',
          ].map((t, i) => (
            <div
              key={t}
              className={`px-2 py-1.5 rounded-md text-[12px] truncate ${
                i === 0 ? 'bg-brand/15 text-fg' : 'text-fg-muted'
              }`}
            >
              {t}
            </div>
          ))}
        </aside>

        <div className="p-6 space-y-4 text-left">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-surface-raised border border-border/40 shrink-0" />
            <div className="font-display text-[15px] text-fg">
              what's the median CAC for DTC skincare brands in 2026?
            </div>
          </div>

          <div className="rounded-lg border border-border/40 bg-surface/60 p-4 space-y-3">
            <div className="space-y-1.5">
              <div className="h-2 w-[92%] rounded-full bg-fg-subtle/20" />
              <div className="h-2 w-[78%] rounded-full bg-fg-subtle/20" />
              <div className="h-2 w-[64%] rounded-full bg-fg-subtle/20" />
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {['eMarketer · Q1 2026', 'Adweek benchmarks', 'Meta industry report'].map(s => (
                <span
                  key={s}
                  className="inline-flex items-center rounded-md border border-brand/40 bg-brand/5 px-2 py-0.5 font-mono text-[10px] text-brand"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2">
            <MiniStat label="median CAC" value="$47" />
            <MiniStat label="p90 CAC" value="$118" />
            <MiniStat label="payback" value="4.2 mo" />
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-surface/60 px-3 py-2">
      <div className="font-mono text-[10px] text-fg-subtle uppercase tracking-wider">{label}</div>
      <div className="font-display text-[18px] font-semibold text-fg">{value}</div>
    </div>
  );
}
