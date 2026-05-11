import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';

const INCLUDED = [
  'unlimited cited queries',
  'unlimited brand profiles',
  'full plays library',
  'all calculators',
  'export to notion, slack, pdf',
  'no credit card, no usage caps',
];

export function LandingPricing() {
  return (
    <section id="pricing" className="py-24 sm:py-32 border-t border-border/40">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-3">
            pricing
          </p>
          <h2 className="font-display text-[36px] sm:text-[44px] leading-[1.1] tracking-[-0.02em] font-semibold text-fg">
            free for everyone, for the next 6 months.
          </h2>
          <p className="mt-4 text-fg-muted max-w-xl mx-auto">
            we're in open beta. no tiers, no seat limits, no metered queries — every workspace gets the full product while we iterate with early users.
          </p>
        </div>

        <div className="relative max-w-2xl mx-auto">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 flex items-center justify-center"
          >
            <div
              className="w-[600px] h-[300px] rounded-full"
              style={{
                background:
                  'radial-gradient(circle, rgba(124,92,255,0.15) 0%, transparent 70%)',
                filter: 'blur(60px)',
              }}
            />
          </div>

          <div className="rounded-2xl border border-brand/40 bg-surface-raised/60 p-8 sm:p-10 shadow-[0_30px_80px_-20px_rgba(124,92,255,0.3)] backdrop-blur">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
              <div>
                <div className="inline-flex items-center rounded-full border border-brand/40 bg-brand/5 px-2.5 py-1 mb-3">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-brand">
                    open beta
                  </span>
                </div>
                <div className="font-display text-[20px] font-semibold text-fg">
                  PaidPilot, on us.
                </div>
                <p className="text-fg-muted text-[14px] mt-1.5">
                  through november 2026 — paid tiers introduced only when beta ends.
                </p>
              </div>
              <div className="text-right">
                <div className="font-display text-[56px] font-semibold leading-none text-fg">$0</div>
                <div className="font-mono text-[11px] text-fg-subtle mt-2">for 6 months</div>
              </div>
            </div>

            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mb-8">
              {INCLUDED.map(f => (
                <li key={f} className="flex items-start gap-2 text-[14px] text-fg-muted">
                  <Check className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <Link
              to="/sign-in"
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#7C5CFF] to-[#3B82F6] px-7 py-3.5 text-[15px] font-semibold text-white shadow-[0_0_32px_rgba(124,92,255,0.35)] hover:shadow-[0_0_40px_rgba(124,92,255,0.5)] transition-shadow"
            >
              claim your free workspace
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <p className="text-center font-mono text-[11px] text-fg-subtle mt-6">
            beta participants keep grandfathered pricing when paid tiers launch.
          </p>
        </div>
      </div>
    </section>
  );
}
