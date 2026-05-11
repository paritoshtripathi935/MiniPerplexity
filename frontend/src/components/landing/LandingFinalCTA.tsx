import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export function LandingFinalCTA() {
  return (
    <section className="relative py-32 overflow-hidden border-t border-border/40">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 flex items-center justify-center"
      >
        <div
          className="w-[820px] h-[400px] rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(124,92,255,0.18) 0%, rgba(59,130,246,0.08) 60%, transparent 80%)',
            filter: 'blur(80px)',
          }}
        />
      </div>

      <div className="max-w-[1200px] mx-auto px-5 sm:px-6 text-center">
        <h2 className="font-display text-[40px] sm:text-[56px] leading-[1.05] tracking-[-0.025em] font-semibold text-fg max-w-3xl mx-auto">
          stop pasting context into chatgpt.
        </h2>
        <p className="mt-5 text-[17px] text-fg-muted max-w-xl mx-auto">
          spin up a free workspace in under a minute. your brand context, every benchmark with a citation, every play already grounded.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/sign-in"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#7C5CFF] to-[#3B82F6] px-8 py-4 text-[15px] font-semibold text-white shadow-[0_0_40px_rgba(124,92,255,0.4)] hover:shadow-[0_0_48px_rgba(124,92,255,0.55)] transition-shadow"
          >
            start free — no card required
            <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="#features"
            className="inline-flex items-center gap-2 text-[14px] text-fg-muted hover:text-fg transition-colors"
          >
            or read how it works →
          </a>
        </div>
      </div>
    </section>
  );
}
