import { ChevronDown } from 'lucide-react';

const FAQS = [
  {
    q: 'how is this different from chatgpt or perplexity?',
    a: "PaidPilot is purpose-built for performance marketing. it weights its sources toward platform docs and industry reports — not the open web — and it carries your brand context (icp, voice, p&l) into every prompt so the answer comes out usable, not generic.",
  },
  {
    q: 'is my brand data used to train models?',
    a: 'no. your brand profile, queries, and uploaded docs are never sent to model providers for training. they sit in your workspace and are only used to ground answers for you.',
  },
  {
    q: 'what powers the answers?',
    a: 'frontier reasoning models from the major labs, swapped behind the scenes as new releases prove themselves on marketing tasks. you get the best available model for each kind of question — benchmark lookup, brief drafting, plan modeling — without having to think about it.',
  },
  {
    q: 'can i export to notion or slack?',
    a: 'yes, on team and enterprise plans. briefs, plays, and chat answers can be exported to notion, slack, or downloaded as pdf.',
  },
  {
    q: 'do you have an api?',
    a: 'yes, on enterprise. point your internal tools at the same source-grounded answers and plays your team uses in the app.',
  },
  {
    q: 'what does "free for 6 months" mean?',
    a: 'through november 2026, every workspace gets the full product — unlimited queries, unlimited brand profiles, every play, every calculator — for $0. when paid tiers launch, beta participants get grandfathered pricing and 30 days notice before anything changes.',
  },
];

export function LandingFAQ() {
  return (
    <section className="py-24 sm:py-32 border-t border-border/40">
      <div className="max-w-[820px] mx-auto px-5 sm:px-6">
        <div className="text-center mb-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-3">
            faq
          </p>
          <h2 className="font-display text-[36px] sm:text-[44px] leading-[1.1] tracking-[-0.02em] font-semibold text-fg">
            frequently asked.
          </h2>
        </div>

        <div className="space-y-3">
          {FAQS.map(item => (
            <details
              key={item.q}
              className="group rounded-xl border border-border/60 bg-surface-raised/40 open:bg-surface-raised/60 open:border-brand/30 transition-colors"
            >
              <summary className="flex items-center justify-between cursor-pointer list-none p-5 text-[15px] font-medium text-fg">
                <span>{item.q}</span>
                <ChevronDown className="w-4 h-4 text-fg-muted transition-transform group-open:rotate-180" />
              </summary>
              <div className="px-5 pb-5 text-[14px] text-fg-muted leading-relaxed">{item.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
