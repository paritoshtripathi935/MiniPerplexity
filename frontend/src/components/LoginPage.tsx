import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { SignIn } from '@clerk/clerk-react';
import { ArrowLeft, ArrowUpRight, Quote } from 'lucide-react';
import { Logo } from './Logo';

const LoginPage: React.FC = () => {
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains('dark');
    root.classList.add('dark');
    return () => {
      if (!hadDark) root.classList.remove('dark');
    };
  }, []);

  return (
    <div className="relative min-h-screen bg-surface text-fg overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 50% 60% at 20% 30%, rgba(124,92,255,0.18), transparent 60%), radial-gradient(ellipse 40% 40% at 80% 80%, rgba(59,130,246,0.10), transparent 60%)',
          filter: 'blur(30px)',
        }}
      />

      <Link
        to="/"
        className="absolute top-6 right-6 z-20 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface-raised/60 backdrop-blur px-3 py-1.5 text-[13px] text-fg-muted hover:text-fg hover:border-border-strong/60 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        back to home
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] min-h-screen">
        <PitchColumn />
        <AuthColumn />
      </div>
    </div>
  );
};

function PitchColumn() {
  return (
    <section className="relative hidden lg:flex flex-col justify-between p-12 xl:p-16 border-r border-border/40 bg-surface-sunken/40">
      <div className="flex items-center gap-2.5">
        <span className="grid place-items-center w-9 h-9 rounded-lg bg-brand text-brand-fg shadow-[0_0_24px_rgba(124,92,255,0.3)]">
          <Logo className="w-5 h-5" />
        </span>
        <span className="font-display text-[18px] font-semibold tracking-tight">PaidPilot</span>
      </div>

      <div className="space-y-10 max-w-xl">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-3">
            an operating system for growth teams
          </p>
          <h2 className="font-display text-[40px] xl:text-[48px] leading-[1.05] tracking-[-0.025em] font-semibold">
            the fastest path from question to growth play.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-fg-muted max-w-md">
            benchmarks, briefs, and channel plans grounded in the sources you actually trust — with your brand context baked into every answer.
          </p>
        </div>

        <PitchProductMock />

        <ul className="space-y-2.5 max-w-md">
          {[
            'every answer cited — no hallucinated benchmarks',
            'brand context applied to every prompt',
            '10 ready-to-run plays + built-in calculators',
          ].map(line => (
            <li key={line} className="flex items-start gap-2.5 text-[14px] text-fg-muted">
              <span className="mt-2 w-1 h-1 rounded-full bg-brand shrink-0" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center gap-4 font-mono text-[11px] text-fg-subtle">
        <span className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          free in open beta
        </span>
        <span className="text-fg-subtle/50">·</span>
        <span>no credit card</span>
        <span className="text-fg-subtle/50">·</span>
        <span>ready in 60s</span>
      </div>
    </section>
  );
}

function PitchProductMock() {
  return (
    <div className="rounded-2xl border border-border/60 bg-surface-raised/60 backdrop-blur p-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.5)] max-w-md">
      <div className="flex items-center justify-between font-mono text-[10px] text-fg-subtle mb-3">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          brand context: <span className="text-fg">lumen skincare</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Quote className="w-3 h-3 text-brand/70" />
          3 cited
        </div>
      </div>

      <div className="rounded-xl border border-border/40 bg-surface/60 p-3.5 space-y-3">
        <div className="flex items-start gap-2.5">
          <div className="w-6 h-6 rounded-full bg-surface-raised border border-border/40 shrink-0" />
          <div className="font-display text-[13px] text-fg leading-snug">
            what's the median cac for dtc skincare in 2026?
          </div>
        </div>

        <div className="pl-[34px] space-y-2 text-[12px] leading-relaxed text-fg-muted">
          <p>
            median cac sits at <span className="text-fg font-medium">$47</span>
            <Sup n={1} /> with p90 at <span className="text-fg font-medium">$118</span>
            <Sup n={2} />, up <span className="text-fg font-medium">~12% yoy</span>
            <Sup n={2} /> post-iOS17.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-1.5 pt-1">
          {[
            { n: 1, src: 'eMarketer' },
            { n: 2, src: 'Adweek' },
            { n: 3, src: 'Meta rpt' },
          ].map(c => (
            <div
              key={c.n}
              className="rounded-md border border-brand/30 bg-brand/5 px-2 py-1 flex items-center justify-between"
            >
              <span className="font-mono text-[10px] text-brand">
                [{c.n}] {c.src}
              </span>
              <ArrowUpRight className="w-2.5 h-2.5 text-brand/70" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Sup({ n }: { n: number }) {
  return (
    <sup className="ml-0.5 inline-flex items-center justify-center min-w-[12px] h-[12px] px-1 rounded text-[8px] font-mono text-brand bg-brand/10 align-super">
      {n}
    </sup>
  );
}

function AuthColumn() {
  return (
    <section className="relative flex flex-col items-center justify-center px-6 py-16 lg:px-12">
      <div className="lg:hidden flex items-center gap-2.5 mb-12">
        <span className="grid place-items-center w-8 h-8 rounded-lg bg-brand text-brand-fg">
          <Logo className="w-4 h-4" />
        </span>
        <span className="font-display text-[17px] font-semibold tracking-tight">PaidPilot</span>
      </div>

      <div className="w-full max-w-[460px]">
        <div className="mb-8">
          <h1 className="font-display text-[32px] leading-[1.1] tracking-[-0.025em] font-semibold">
            welcome back.
          </h1>
          <p className="mt-2 text-[14px] text-fg-muted">
            sign in to pick up where you left off.
          </p>
        </div>

        <div className="rounded-2xl border border-border/60 bg-surface-raised/40 backdrop-blur p-3 sm:p-4 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)]">
          <SignIn signUpUrl="/sign-in" routing="path" path="/sign-in" />
        </div>

        <p className="mt-8 text-center font-mono text-[11px] text-fg-subtle">
          © 2026 PaidPilot. all rights reserved.
        </p>
      </div>
    </section>
  );
}

export default LoginPage;
