import { Link } from 'react-router-dom';
import { Logo } from '../Logo';

/** Three kinds of footer links:
 *   - `anchor` jumps to an on-page section (must match an `id` that
 *     actually exists in the landing components)
 *   - `route` is an in-app React Router target (e.g. `/docs`)
 *   - `external` opens in a new tab (mailto, github, etc.)
 *
 *  Adding a link here without a matching destination is what caused
 *  the previous "lot of them don't work" — every entry below now maps
 *  to a real, reachable target. The previous Legal column (privacy /
 *  terms / security / DPA) was dropped entirely rather than ship dead
 *  links pretending to be real legal documents; we'll add a real
 *  /legal route before any production / paid traffic. */
type LinkKind = 'anchor' | 'route' | 'external';

const COLUMNS: Array<{
  heading: string;
  links: Array<{ label: string; href: string; kind: LinkKind }>;
}> = [
  {
    heading: 'Product',
    links: [
      { label: 'Plays', href: '#plays', kind: 'anchor' },
      { label: 'Calculators', href: '#calculators', kind: 'anchor' },
      { label: 'Pricing', href: '#pricing', kind: 'anchor' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Docs', href: '/docs', kind: 'route' },
      { label: 'GitHub', href: 'https://github.com/paritoshtripathi935/MiniPerplexity', kind: 'external' },
      { label: 'Contact', href: 'mailto:hello@paidpilot.app', kind: 'external' },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-border/40 pt-20 pb-10">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-10 mb-16">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="grid place-items-center w-8 h-8 rounded-lg bg-brand text-brand-fg">
                <Logo className="w-4 h-4" />
              </span>
              <span className="font-display text-[16px] font-semibold tracking-tight text-fg">
                PaidPilot
              </span>
            </div>
            <p className="text-[13px] text-fg-muted max-w-xs leading-relaxed">
              an ai co-pilot for in-house performance marketers. cited answers, ready plays, calculators that fit your p&amp;l.
            </p>
          </div>

          {COLUMNS.map(col => (
            <div key={col.heading}>
              <h4 className="font-display text-[13px] font-semibold text-fg mb-4">{col.heading}</h4>
              <ul className="space-y-2.5">
                {col.links.map(link => (
                  <li key={link.label}>
                    <FooterLink {...link} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-border/40 pt-6 flex flex-col md:flex-row justify-between items-center gap-3 font-mono text-[11px] text-fg-subtle">
          <span>© 2026 PaidPilot · open beta · cited answers for in-house growth teams</span>
          <span>
            questions?{' '}
            <a
              href="mailto:hello@paidpilot.app"
              className="hover:text-fg transition-colors"
            >
              hello@paidpilot.app
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({
  label,
  href,
  kind,
}: {
  label: string;
  href: string;
  kind: LinkKind;
}) {
  const className =
    'text-[13px] text-fg-muted hover:text-fg transition-colors';
  if (kind === 'route') {
    return (
      <Link to={href} className={className}>
        {label}
      </Link>
    );
  }
  if (kind === 'external') {
    const isMailto = href.startsWith('mailto:');
    return (
      <a
        href={href}
        target={isMailto ? undefined : '_blank'}
        rel={isMailto ? undefined : 'noopener noreferrer'}
        className={className}
      >
        {label}
      </a>
    );
  }
  return (
    <a href={href} className={className}>
      {label}
    </a>
  );
}
