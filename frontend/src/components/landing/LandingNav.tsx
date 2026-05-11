import { Link } from 'react-router-dom';
import { Logo } from '../Logo';

const LINKS: Array<{ label: string; href: string }> = [
  { label: 'Product', href: '#features' },
  { label: 'Plays', href: '#plays' },
  { label: 'Calculators', href: '#calculators' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Changelog', href: '#changelog' },
  { label: 'Docs', href: '#docs' },
];

export function LandingNav() {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 border-b border-border/40 bg-surface/70 backdrop-blur-xl">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="grid place-items-center w-8 h-8 rounded-lg bg-brand text-brand-fg">
            <Logo className="w-4 h-4" />
          </span>
          <span className="font-display text-[17px] font-semibold tracking-tight text-fg">
            PaidPilot
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {LINKS.map(link => (
            <a
              key={link.label}
              href={link.href}
              className="text-[14px] text-fg-muted hover:text-fg transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/sign-in"
            className="hidden sm:inline-block text-[14px] text-fg-muted hover:text-fg transition-colors"
          >
            Sign in
          </Link>
          <Link
            to="/sign-in"
            className="inline-flex items-center rounded-lg bg-gradient-to-br from-[#7C5CFF] to-[#3B82F6] px-4 py-2 text-[14px] font-medium text-white shadow-[0_0_24px_rgba(124,92,255,0.25)] hover:shadow-[0_0_28px_rgba(124,92,255,0.4)] transition-shadow"
          >
            Start free
          </Link>
        </div>
      </div>
    </nav>
  );
}
