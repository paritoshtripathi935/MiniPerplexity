import React, { ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';
import { Calculator, Home, PlayCircle, Search, Settings, Sun, Moon } from 'lucide-react';
import clsx from 'clsx';
import {
  CommandPalette,
  CommandPaletteProvider,
  useCommandPalette,
} from './CommandPalette';
import { Logo } from './Logo';

interface Props {
  darkMode: boolean;
  toggleDarkMode: () => void;
}

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/investigations', label: 'Investigations', icon: Search, end: false },
  { to: '/plays', label: 'Plays', icon: PlayCircle, end: false },
  { to: '/calc', label: 'Calculators', icon: Calculator, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
];

/**
 * Sticky top nav + outlet for routed pages. Pages render their own page-level
 * chrome below.
 */
export function AppLayout(props: Props) {
  return (
    <CommandPaletteProvider>
      <AppLayoutInner {...props} />
      <CommandPalette />
    </CommandPaletteProvider>
  );
}

function AppLayoutInner({ darkMode, toggleDarkMode }: Props) {
  const location = useLocation();
  // Investigation surface uses its own full-bleed layout (no max-width).
  // Legacy `/chat/*` redirects via App.tsx; nothing else needs this guard.
  const isInvestigationRoute = location.pathname.startsWith('/investigations');
  const { setOpen: setPaletteOpen } = useCommandPalette();
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  return (
    <div className="min-h-screen flex flex-col bg-surface-sunken text-fg">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/60">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-4">
          <NavLink to="/" className="flex items-center gap-2 mr-2 shrink-0">
            <span className="grid place-items-center w-7 h-7 rounded-md bg-brand text-brand-fg">
              <Logo className="w-4 h-4" />
            </span>
            <span className="font-display font-semibold tracking-tight text-body-base">
              PaidPilot
            </span>
          </NavLink>

          <nav className="flex-1 flex items-center gap-0.5 overflow-x-auto">
            {NAV.map(item => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    clsx(
                      'inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-body-sm font-medium transition-colors duration-150',
                      isActive
                        ? 'text-fg bg-surface-sunken'
                        : 'text-fg-subtle hover:text-fg hover:bg-surface-sunken/60'
                    )
                  }
                >
                  <Icon className="w-3.5 h-3.5" strokeWidth={2} />
                  <span className="hidden sm:inline">{item.label}</span>
                </NavLink>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden sm:inline-flex items-center gap-2 h-8 pl-2.5 pr-1.5 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-sunken transition-colors border border-border"
              aria-label="Open command palette"
              title="Open command palette"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="text-body-md">Search</span>
              <kbd className="inline-grid place-items-center min-w-[18px] h-[16px] px-1 text-[10px] font-medium text-fg-subtle bg-surface-sunken rounded">
                {isMac ? '⌘' : 'Ctrl'}
              </kbd>
              <kbd className="inline-grid place-items-center min-w-[18px] h-[16px] px-1 text-[10px] font-medium text-fg-subtle bg-surface-sunken rounded">
                K
              </kbd>
            </button>
            {/* Compact icon-only variant for mobile / narrow widths. */}
            <button
              onClick={() => setPaletteOpen(true)}
              className="sm:hidden grid place-items-center w-8 h-8 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-sunken transition-colors"
              aria-label="Open command palette"
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              onClick={toggleDarkMode}
              className="grid place-items-center w-8 h-8 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-sunken transition-colors"
              aria-label="Toggle theme"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: { avatarBox: 'w-7 h-7' },
              }}
            />
          </div>
        </div>
      </header>

      {isInvestigationRoute ? (
        <main className="flex-1 min-h-0">
          <Outlet />
        </main>
      ) : (
        <main className="flex-1 max-w-[1280px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
          <Outlet />
        </main>
      )}
    </div>
  );
}

/** Page hero — title + description with consistent spacing. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-h1">
          {title}
        </h1>
        {subtitle && (
          <p className="text-body-base text-fg-muted mt-1.5 max-w-2xl leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
