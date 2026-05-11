const SOURCES = ['Meta', 'Google', 'TikTok', 'eMarketer', 'Adweek', 'HubSpot', 'IAB'];

export function LandingLogos() {
  return (
    <section className="py-16 border-y border-border/40">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-6">
        <p className="text-center font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle/70 mb-8">
          trained on the platforms and publications marketers actually trust
        </p>
        <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-4 opacity-50">
          {SOURCES.map(name => (
            <span
              key={name}
              className="font-display text-[18px] font-semibold tracking-tight text-fg-muted"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
