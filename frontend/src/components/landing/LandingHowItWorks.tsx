const STEPS = [
  {
    n: 1,
    title: 'tell paidpilot about your brand',
    body: '90 seconds. icp, voice, current campaigns, P&L targets. you can paste from a doc.',
    mock: BrandStepMock,
  },
  {
    n: 2,
    title: 'ask a question or run a play',
    body: 'type a question or pick from the plays library — abo brief, lifecycle audit, channel plan.',
    mock: QueryStepMock,
  },
  {
    n: 3,
    title: 'ship the brief, the test, or the plan',
    body: 'every answer is cited and exportable. drop it into notion, a brief doc, or your media plan.',
    mock: ExportStepMock,
  },
];

export function LandingHowItWorks() {
  return (
    <section className="py-24 sm:py-32 bg-surface-sunken/40 border-y border-border/40">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-6">
        <div className="max-w-2xl mb-14">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-3">
            how it works
          </p>
          <h2 className="font-display text-[36px] sm:text-[44px] leading-[1.1] tracking-[-0.02em] font-semibold text-fg">
            workflow at the speed of thought.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STEPS.map(({ n, title, body, mock: Mock }) => (
            <div key={n} className="rounded-2xl border border-border/60 bg-surface-raised/40 p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="grid place-items-center w-8 h-8 rounded-full border border-brand/60 text-brand font-mono text-[13px] font-semibold">
                  {n}
                </span>
                <h3 className="font-display text-[18px] font-semibold tracking-tight text-fg">
                  {title}
                </h3>
              </div>
              <p className="text-fg-muted text-[14px] mb-6">{body}</p>
              <Mock />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BrandStepMock() {
  return (
    <div className="rounded-lg border border-border/40 bg-surface/60 p-3 space-y-2 font-mono text-[11px]">
      {[
        ['brand', 'lumen skincare'],
        ['icp', '25–44 f, premium'],
        ['voice', 'editorial'],
        ['target cac', '<$55'],
      ].map(([k, v]) => (
        <div key={k} className="flex items-center justify-between">
          <span className="text-fg-subtle">{k}</span>
          <span className="text-fg">{v}</span>
        </div>
      ))}
    </div>
  );
}

function QueryStepMock() {
  return (
    <div className="rounded-lg border border-border/40 bg-surface/60 p-3 space-y-2 font-mono text-[11px]">
      <div className="flex items-start gap-2">
        <span className="text-brand">›</span>
        <span className="text-fg">draft a meta abo test plan for the new SPF SKU</span>
      </div>
      <div className="space-y-1 pl-4 border-l border-brand/40">
        <div className="h-1.5 w-[90%] rounded-full bg-fg-subtle/20" />
        <div className="h-1.5 w-[75%] rounded-full bg-fg-subtle/20" />
        <div className="h-1.5 w-[55%] rounded-full bg-fg-subtle/20" />
      </div>
    </div>
  );
}

function ExportStepMock() {
  return (
    <div className="rounded-lg border border-border/40 bg-surface/60 p-3 space-y-2 font-mono text-[11px]">
      <div className="flex items-center justify-between text-fg-subtle">
        <span>brief — q4 spf launch</span>
        <span className="text-brand">ready</span>
      </div>
      <div className="space-y-1">
        <div className="h-1.5 w-[95%] rounded-full bg-fg-subtle/20" />
        <div className="h-1.5 w-[82%] rounded-full bg-fg-subtle/20" />
        <div className="h-1.5 w-[68%] rounded-full bg-fg-subtle/20" />
      </div>
      <div className="flex gap-1.5 pt-1">
        {['notion', 'slack', '.pdf'].map(x => (
          <span
            key={x}
            className="inline-flex items-center rounded-md border border-border/60 bg-surface/40 px-1.5 py-0.5 text-[10px] text-fg-muted"
          >
            {x}
          </span>
        ))}
      </div>
    </div>
  );
}
